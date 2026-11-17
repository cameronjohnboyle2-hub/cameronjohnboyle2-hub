import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNeonSaberServer } from "../server.mjs";
import {
  NEUTRAL_BLADE_DIRECTION,
  advanceTrackedOrientation,
  amplifyBladeDepth,
  angularDistance,
  bladeDirectionFromOrientations,
  quaternionFromDeviceOrientation,
} from "../public/orientation-math.js";

test("serves the desktop game and health/config endpoints", async (t) => {
  const app = createNeonSaberServer({ port: 0 });
  const address = await app.listen();
  t.after(async () => app.close());
  const origin = `http://127.0.0.1:${address.port}`;

  const [gameResponse, healthResponse, configResponse, controllerResponse] =
    await Promise.all([
      fetch(`${origin}/game`),
      fetch(`${origin}/health`),
      fetch(`${origin}/api/config`),
      fetch(`${origin}/controller`),
    ]);

  assert.equal(gameResponse.status, 200);
  const gameHtml = await gameResponse.text();
  assert.match(gameHtml, /NEON[\s\S]*SABER/);
  assert.match(gameHtml, /One phone\. One motion saber\./);
  assert.match(gameHtml, /\/vendor\/qrcode\.js/);

  const qrLibrary = await fetch(`${origin}/vendor/qrcode.js`);
  assert.equal(qrLibrary.status, 200);
  assert.match(qrLibrary.headers.get("content-type"), /javascript/);
  assert.deepEqual(await healthResponse.json(), {
    ok: true,
    controllers: 0,
    tunnelStatus: "idle",
    diagnosticRecordings: [],
  });
  const config = await configResponse.json();
  assert.equal(config.port, address.port);
  assert.equal(config.controllerUrl, null);
  assert.equal(config.tunnelStatus, "idle");
  assert.equal(controllerResponse.status, 200);
  assert.match(await controllerResponse.text(), /ENABLE MOTION/);
});

test("implements one blue motion saber with contact-only blocks", async () => {
  const [game, controller] = await Promise.all([
    readFile(new URL("../public/game.js", import.meta.url), "utf8"),
    readFile(new URL("../public/controller.js", import.meta.url), "utf8"),
  ]);
  assert.match(game, /new WebSocket/);
  assert.match(game, /waitForSecurePhoneLink/);
  assert.match(game, /controllerMotionReady/);
  assert.match(game, /message\.motionEnabled === true/);
  assert.match(game, /startButton\.disabled = !controllerConnected/);
  assert.match(game, /const color = "blue"/);
  assert.match(game, /direction: "any"/);
  assert.match(game, /function saberGeometry/);
  assert.match(game, /function pointToSegmentDistance/);
  assert.match(game, /fullBladeLength = clamp/);
  assert.match(game, /projectedMagnitude/);
  assert.match(game, /direction\.z/);
  assert.match(game, /for \(const color of \["blue"\]\)/);
  assert.doesNotMatch(game, /if \(!directional\) continue/);
  assert.match(controller, /deviceorientation/);
  assert.match(controller, /quaternionFromDeviceOrientation/);
  assert.match(controller, /bladeDirectionFromOrientations/);
  assert.match(controller, /amplifyBladeDepth/);
  assert.match(controller, /advanceTrackedOrientation/);
  assert.match(controller, /devicemotion/);
  assert.match(controller, /runDiagnosticTest/);
  assert.match(controller, /guided-test-start/);
  assert.match(controller, /phase-forward-back/);
  assert.match(controller, /pose\.x = 0\.5/);
  assert.match(controller, /pose\.y = 0\.84/);
  assert.match(controller, /angularSpeed/);
  assert.match(controller, /direction: \{/);
  assert.doesNotMatch(controller, /targetX/);
  assert.doesNotMatch(controller, /targetY/);
  assert.match(controller, /new WebSocket/);
  assert.match(controller, /Start sent — watch the computer/);
  assert.doesNotMatch(game, /controls\.red/);
  assert.doesNotMatch(game, /for \(const color of \["red", "blue"\]\)/);
});

test("maps phone orientation to a foreshortenable 3D blade", () => {
  const calibration = quaternionFromDeviceOrientation(0, 90, 0, 0);
  const neutral = bladeDirectionFromOrientations(calibration, calibration);
  assert.ok(Math.abs(neutral.x - NEUTRAL_BLADE_DIRECTION.x) < 0.0001);
  assert.ok(Math.abs(neutral.y - NEUTRAL_BLADE_DIRECTION.y) < 0.0001);
  assert.ok(Math.abs(neutral.z - NEUTRAL_BLADE_DIRECTION.z) < 0.0001);

  const pointingForward = bladeDirectionFromOrientations(
    calibration,
    quaternionFromDeviceOrientation(0, 150, 0, 0),
  );
  assert.ok(pointingForward.z > 0.98);
  assert.ok(Math.hypot(pointingForward.x, pointingForward.y) < 0.08);

  const swungSideways = bladeDirectionFromOrientations(
    calibration,
    quaternionFromDeviceOrientation(60, 90, 0, 0),
  );
  assert.ok(Math.abs(swungSideways.x) > 0.7);
  assert.ok(swungSideways.y < 0.5);
});

test("boosts forward depth and suppresses slow orientation drift", () => {
  const calibration = quaternionFromDeviceOrientation(0, 90, 0, 0);
  const modestForwardTilt = quaternionFromDeviceOrientation(0, 110, 0, 0);
  const normalDepth = bladeDirectionFromOrientations(calibration, modestForwardTilt);
  const boostedDepth = amplifyBladeDepth(normalDepth);
  assert.ok(boostedDepth.z > normalDepth.z + 0.1);
  assert.ok(
    Math.hypot(boostedDepth.x, boostedDepth.y)
      < Math.hypot(normalDepth.x, normalDepth.y) * 0.72,
  );

  const rawDrift = quaternionFromDeviceOrientation(10, 90, 0, 0);
  const guardedOrientation = advanceTrackedOrientation(
    calibration,
    calibration,
    rawDrift,
    0.035,
  );
  const fullDriftDirection = bladeDirectionFromOrientations(calibration, rawDrift);
  const guardedDirection = bladeDirectionFromOrientations(calibration, guardedOrientation);
  assert.ok(
    angularDistance(NEUTRAL_BLADE_DIRECTION, guardedDirection)
      < angularDistance(NEUTRAL_BLADE_DIRECTION, fullDriftDirection) * 0.08,
  );
});

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

function nextMessage(socket, predicate, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeout);
    const onMessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

test("relays phone start and motion messages to the computer", async (t) => {
  const app = createNeonSaberServer({ port: 0 });
  const address = await app.listen();
  t.after(async () => app.close());
  const socketUrl = `ws://127.0.0.1:${address.port}/ws`;
  const game = await openSocket(socketUrl);
  const controller = await openSocket(socketUrl);
  t.after(() => {
    game.close();
    controller.close();
  });

  const gameRegistered = nextMessage(game, (message) => message.type === "registered");
  game.send(JSON.stringify({ type: "register", role: "game", room: "2468" }));
  await gameRegistered;

  const controllerRegistered = nextMessage(controller, (message) => message.type === "registered");
  const controllerOnline = nextMessage(game, (message) => message.type === "controller-status" && message.connected);
  controller.send(JSON.stringify({ type: "register", role: "controller", room: "2468" }));
  await Promise.all([controllerRegistered, controllerOnline]);

  const startReceived = nextMessage(game, (message) => message.type === "start");
  controller.send(JSON.stringify({ type: "start" }));
  assert.equal((await startReceived).type, "start");

  const controlReceived = nextMessage(game, (message) => message.type === "control");
  controller.send(JSON.stringify({
    type: "control",
    blue: {
      x: 0.5,
      y: 0.84,
      vx: 1,
      vy: 0,
      direction: { x: 0.2, y: 0.8, z: 0.56 },
      angularSpeed: 2.4,
      active: true,
    },
  }));
  const relayedControl = await controlReceived;
  assert.equal(relayedControl.blue.x, 0.5);
  assert.equal(relayedControl.blue.direction.z, 0.56);

  const stateReceived = nextMessage(controller, (message) => message.type === "level-state");
  game.send(JSON.stringify({ type: "level-state", state: "countdown" }));
  assert.equal((await stateReceived).state, "countdown");
});

test("records motion diagnostics and issue markers locally", async () => {
  const directory = await mkdtemp(join(tmpdir(), "neon-saber-diagnostics-"));
  const app = createNeonSaberServer({
    port: 0,
    diagnostics: true,
    diagnosticsDirectory: directory,
  });
  const address = await app.listen();
  const socketUrl = `ws://127.0.0.1:${address.port}/ws`;
  const game = await openSocket(socketUrl);
  const controller = await openSocket(socketUrl);
  let recording = "";
  let appClosed = false;

  try {
    const gameRegistered = nextMessage(game, (message) => message.type === "registered");
    game.send(JSON.stringify({ type: "register", role: "game", room: "8642" }));
    await gameRegistered;

    const controllerRegistered = nextMessage(controller, (message) => message.type === "registered");
    const diagnosticReady = nextMessage(
      controller,
      (message) => message.type === "diagnostic-status" && message.recording,
    );
    controller.send(JSON.stringify({ type: "register", role: "controller", room: "8642" }));
    await Promise.all([controllerRegistered, diagnosticReady]);

    controller.send(JSON.stringify({
      type: "control",
      sentAt: Date.now(),
      motion: { alpha: 12, beta: 93, gamma: -4 },
      blue: {
        x: 0.5,
        y: 0.84,
        direction: { x: 0.1, y: 0.8, z: 0.59 },
        angularSpeed: 1.4,
        active: true,
      },
      diagnostic: {
        driftGuard: true,
        gyroRate: 0.1,
        sensorDirection: { x: 0.11, y: 0.8, z: 0.59 },
        driftCorrectedDirection: { x: 0.1, y: 0.81, z: 0.58 },
        depthBoostedDirection: { x: 0.08, y: 0.72, z: 0.69 },
        projectedLength: 0.81,
      },
    }));

    const markerSaved = nextMessage(
      controller,
      (message) => message.type === "diagnostic-marker-saved",
    );
    controller.send(JSON.stringify({ type: "diagnostic-marker", marker: "felt-wrong" }));
    await markerSaved;
    game.send(JSON.stringify({ type: "feedback", result: "hit", score: 115, combo: 1 }));

    controller.close();
    await new Promise((resolve) => setTimeout(resolve, 450));
    game.close();
    await app.close();
    appClosed = true;
    const files = (await readdir(directory)).filter((file) => file.endsWith(".ndjson"));
    assert.equal(files.length, 1);
    recording = await readFile(join(directory, files[0]), "utf8");
  } finally {
    game.close();
    controller.close();
    if (!appClosed) await app.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }

  assert.match(recording, /"type":"session-start"/);
  assert.match(recording, /"type":"control"/);
  assert.match(recording, /"type":"marker"/);
  assert.match(recording, /"marker":"felt-wrong"/);
  assert.match(recording, /"type":"feedback"/);
  assert.match(recording, /"type":"session-end"/);
});
