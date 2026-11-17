import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { networkInterfaces, hostname } from "node:os";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_ROOT = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(APP_ROOT, "public");
const CLOUDFLARED = join(APP_ROOT, "tools", "cloudflared.exe");
const DIAGNOSTICS_ROOT = join(APP_ROOT, "diagnostics");
let controllerUrl = null;
let tunnelStatus = "idle";
let tunnelProcess = null;
let keepTunnelRunning = false;
const VENDOR_FILES = {
  "/vendor/qrcode.js": join(APP_ROOT, "node_modules", "qrcode-generator", "qrcode.js"),
};
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function localAddresses() {
  const addresses = [];
  for (const [adapter, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        let priority = 0;
        if (/wi-?fi|wireless|wlan/i.test(adapter)) priority += 100;
        else if (/ethernet/i.test(adapter) && !/v?ethernet|virtual|vmware|hyper-v|wsl/i.test(adapter)) priority += 80;
        if (/^192\.168\./.test(entry.address)) priority += 30;
        else if (/^10\./.test(entry.address)) priority += 20;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)) priority += 10;
        if (/v?ethernet|virtual|vmware|hyper-v|wsl|loopback/i.test(adapter)) priority -= 100;
        addresses.push({ address: entry.address, priority });
      }
    }
  }
  return [...new Map(addresses.sort((a, b) => b.priority - a.priority).map((item) => [item.address, item])).values()].map((item) => item.address);
}

function wsFrame(payload) {
  const body = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const head = Buffer.alloc(4);
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(body.length, 2);
    return Buffer.concat([head, body]);
  }
  const head = Buffer.alloc(10);
  head[0] = 0x81;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([head, body]);
}

function send(socket, message) {
  if (!socket.destroyed && socket.writable) socket.write(wsFrame(message));
}

function createFrameParser(onMessage, onClose) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = Boolean(buffer[1] & 0x80);
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) return onClose();
        length = Number(big);
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      if (opcode === 0x8) return onClose();
      if (opcode === 0x1) onMessage(payload.toString("utf8"));
    }
  };
}

function safeRoom(value) {
  const room = String(value || "").replace(/\D/g, "").slice(0, 4);
  return room.length === 4 ? room : null;
}

function startQuickTunnel(port) {
  if (!existsSync(CLOUDFLARED)) {
    tunnelStatus = "missing";
    return;
  }
  controllerUrl = null;
  tunnelStatus = "starting";
  let output = "";
  tunnelProcess = spawn(
    CLOUDFLARED,
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
    { cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const inspect = (chunk) => {
    output = `${output}${chunk}`.slice(-16000);
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      controllerUrl = match[0];
      tunnelStatus = "ready";
      console.log(`Secure phone controller: ${controllerUrl}/controller`);
    }
  };
  tunnelProcess.stdout.on("data", inspect);
  tunnelProcess.stderr.on("data", inspect);
  tunnelProcess.on("error", () => {
    tunnelStatus = "error";
  });
  tunnelProcess.on("exit", () => {
    tunnelProcess = null;
    controllerUrl = null;
    if (!keepTunnelRunning) return;
    tunnelStatus = "restarting";
    setTimeout(() => startQuickTunnel(port), 1500);
  });
}

export function createNeonSaberServer({
  port = Number(process.env.NEON_SABER_PORT || 4545),
  diagnostics = port !== 0,
  diagnosticsDirectory = DIAGNOSTICS_ROOT,
} = {}) {
  const clients = new Set();
  const recordings = new Map();
  const pendingRecordings = new Map();
  const diagnosticsReady = diagnostics
    ? mkdir(diagnosticsDirectory, { recursive: true })
    : Promise.resolve();

  async function ensureRecording(room) {
    if (!diagnostics || !room) return null;
    if (recordings.has(room)) return recordings.get(room);
    if (pendingRecordings.has(room)) return pendingRecordings.get(room);
    const pending = (async () => {
      await diagnosticsReady;
      const startedAt = Date.now();
      const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, "-");
      const filename = `neon-saber-${stamp}-room-${room}.ndjson`;
      const file = join(diagnosticsDirectory, filename);
      const stream = createWriteStream(file, { flags: "a", encoding: "utf8" });
      const recording = {
        room,
        file,
        filename,
        stream,
        startedAt,
        closed: false,
        samples: 0,
      };
      stream.on("error", (error) => {
        console.error(`Diagnostic recording error: ${error.message}`);
      });
      recordings.set(room, recording);
      stream.write(`${JSON.stringify({
        type: "session-start",
        at: startedAt,
        elapsedMs: 0,
        room,
        formatVersion: 1,
        computer: hostname(),
      })}\n`);
      console.log(`Diagnostic recording: ${file}`);
      return recording;
    })();
    pendingRecordings.set(room, pending);
    try {
      return await pending;
    } finally {
      pendingRecordings.delete(room);
    }
  }

  function writeDiagnostic(room, type, data = {}) {
    if (!diagnostics || !room) return;
    void ensureRecording(room).then((recording) => {
      if (!recording || recording.closed) return;
      if (type === "control") recording.samples += 1;
      const at = Date.now();
      recording.stream.write(`${JSON.stringify({
        type,
        at,
        elapsedMs: at - recording.startedAt,
        ...data,
      })}\n`);
    }).catch((error) => {
      console.error(`Could not record diagnostics: ${error.message}`);
    });
  }

  function writeActiveDiagnostic(room, type, data = {}) {
    if (!recordings.has(room) && !pendingRecordings.has(room)) return;
    writeDiagnostic(room, type, data);
  }

  async function finishRecording(room, reason) {
    if (!diagnostics || !room) return;
    const recording = recordings.get(room) || await pendingRecordings.get(room);
    if (!recording || recording.closed) return;
    recording.closed = true;
    recordings.delete(room);
    const at = Date.now();
    recording.stream.write(`${JSON.stringify({
      type: "session-end",
      at,
      elapsedMs: at - recording.startedAt,
      reason,
      samples: recording.samples,
    })}\n`);
    await new Promise((resolve) => recording.stream.end(resolve));
  }

  const httpServer = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (requestUrl.pathname === "/api/config") {
        const actualPort = httpServer.address()?.port || port;
        res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
        res.end(JSON.stringify({
          name: "Neon Saber",
          computer: hostname(),
          port: actualPort,
          addresses: localAddresses(),
          websocketPath: "/ws",
          controllerUrl,
          tunnelStatus,
          diagnosticsEnabled: diagnostics,
        }));
        return;
      }
      if (requestUrl.pathname === "/health") {
        res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
        res.end(JSON.stringify({
          ok: true,
          controllers: [...clients].filter((client) => client.role === "controller").length,
          tunnelStatus,
          diagnosticRecordings: [...recordings.values()].map((recording) => basename(recording.file)),
        }));
        return;
      }
      let route = requestUrl.pathname;
      if (route === "/") route = "/game.html";
      if (route === "/game") route = "/game.html";
      if (route === "/controller" || route === "/c" || /^\/\d{4}$/.test(route)) route = "/controller.html";
      if (VENDOR_FILES[route]) {
        const body = await readFile(VENDOR_FILES[route]);
        res.writeHead(200, {
          "content-type": MIME[".js"],
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        });
        res.end(body);
        return;
      }
      const relative = normalize(route).replace(/^([/\\])+/, "");
      const file = join(ROOT, relative);
      if (!file.startsWith(ROOT)) throw new Error("Unsafe path");
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
      const body = await readFile(file);
      const extension = extname(file).toLowerCase();
      res.writeHead(200, {
        "content-type": MIME[extension] || "application/octet-stream",
        "cache-control": [".html", ".js", ".css"].includes(extension)
          ? "no-store"
          : "public, max-age=3600",
        "x-content-type-options": "nosniff",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  httpServer.on("upgrade", (req, socket) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const key = req.headers["sec-websocket-key"];
    if (requestUrl.pathname !== "/ws" || !key) return socket.destroy();
    const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"));
    const client = { socket, room: null, role: null, diagnostics: true };
    clients.add(client);

    const peers = (role) => [...clients].filter((other) => other !== client && other.room === client.room && (!role || other.role === role));
    const announceControllerStatus = () => {
      if (!client.room) return;
      const connected = [...clients].some((other) => other.room === client.room && other.role === "controller");
      for (const game of [...clients].filter((other) => other.room === client.room && other.role === "game")) {
        send(game.socket, { type: "controller-status", connected });
      }
    };
    const cleanup = () => {
      if (!clients.has(client)) return;
      const disconnectedRoom = client.room;
      const disconnectedRole = client.role;
      if (disconnectedRoom && recordings.has(disconnectedRoom)) {
        writeDiagnostic(disconnectedRoom, "client-disconnected", {
          role: disconnectedRole,
        });
      }
      clients.delete(client);
      announceControllerStatus();
      if (disconnectedRoom && disconnectedRole === "controller") {
        setTimeout(() => {
          const controllerRemains = [...clients].some(
            (other) => other.room === disconnectedRoom && other.role === "controller",
          );
          if (!controllerRemains) void finishRecording(disconnectedRoom, "controller-disconnected");
        }, 250);
      }
      if (!socket.destroyed) socket.destroy();
    };
    const parse = createFrameParser((text) => {
      let message;
      try { message = JSON.parse(text); } catch { return; }
      if (message.type === "register") {
        const room = safeRoom(message.room);
        const role = message.role === "game" ? "game" : message.role === "controller" ? "controller" : null;
        if (!room || !role) return send(socket, { type: "error", message: "Invalid pairing code" });
        client.room = room;
        client.role = role;
        client.diagnostics = message.diagnostics !== false;
        send(socket, { type: "registered", role, room });
        announceControllerStatus();
        if (role === "controller" && client.diagnostics) {
          writeDiagnostic(room, "client-registered", { role });
          void ensureRecording(room).then((recording) => {
            if (!recording) return;
            send(socket, {
              type: "diagnostic-status",
              recording: true,
              file: recording.filename,
            });
          });
        } else if (recordings.has(room)) {
          writeActiveDiagnostic(room, "client-registered", { role });
        }
        return;
      }
      if (!client.room || !client.role) return;
      if (["control", "controller-ready"].includes(message.type) && client.role === "controller") {
        const payload = { ...message, serverTime: Date.now() };
        if (client.diagnostics) writeDiagnostic(client.room, message.type, message.type === "control"
          ? {
              phoneSentAt: Number(message.sentAt) || null,
              motion: message.motion || null,
              blue: message.blue || null,
              diagnostic: message.diagnostic || null,
            }
          : {
              mode: message.mode || null,
              sabers: message.sabers || null,
              motionEnabled: Boolean(message.motionEnabled),
            });
        for (const game of peers("game")) send(game.socket, payload);
      } else if (["start", "pause", "restart"].includes(message.type) && client.role === "controller") {
        if (client.diagnostics) writeDiagnostic(client.room, message.type, { source: "controller" });
        for (const game of peers("game")) send(game.socket, message);
      } else if (message.type === "diagnostic-marker" && client.role === "controller") {
        const marker = String(message.marker || "felt-wrong").slice(0, 40);
        if (client.diagnostics) {
          writeDiagnostic(client.room, "marker", { marker });
          send(socket, { type: "diagnostic-marker-saved", marker });
        }
      } else if (["feedback", "level-state"].includes(message.type) && client.role === "game") {
        writeActiveDiagnostic(client.room, message.type, {
          state: message.state || null,
          result: message.result || null,
          score: Number(message.score) || 0,
          combo: Number(message.combo) || 0,
          rank: message.rank || null,
          accuracy: Number(message.accuracy) || 0,
        });
        for (const controller of peers("controller")) send(controller.socket, message);
      }
    }, cleanup);
    socket.on("data", parse);
    socket.on("error", cleanup);
    socket.on("close", cleanup);
  });

  return {
    server: httpServer,
    listen() {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, "0.0.0.0", () => {
          httpServer.off("error", reject);
          resolve(httpServer.address());
        });
      });
    },
    close() {
      for (const client of clients) client.socket.destroy();
      return Promise.all([
        ...[...recordings.keys()].map((room) => finishRecording(room, "server-stopped")),
        new Promise((resolve) => httpServer.close(resolve)),
      ]);
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const app = createNeonSaberServer();
  app.listen().then((address) => {
    const actualPort = address.port;
    console.log(`Neon Saber is ready at http://127.0.0.1:${actualPort}/game`);
    keepTunnelRunning = true;
    startQuickTunnel(actualPort);
  }).catch((error) => {
    if (error.code === "EADDRINUSE") {
      console.log(`Neon Saber is already running at http://127.0.0.1:${process.env.NEON_SABER_PORT || 4545}/game`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  });
  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      keepTunnelRunning = false;
      tunnelProcess?.kill();
      await app.close().catch(() => {});
      process.exit(0);
    });
  }
}
