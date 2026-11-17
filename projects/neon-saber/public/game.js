const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const lobby = document.querySelector("#lobby");
const hud = document.querySelector("#hud");
const results = document.querySelector("#results");
const countdown = document.querySelector("#countdown");
const audioGate = document.querySelector("#audio-gate");
const pairCode = document.querySelector("#pair-code");
const phoneLink = document.querySelector("#copy-link");
const connection = document.querySelector("#connection");
const startButton = document.querySelector("#start-game");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
const multiplierEl = document.querySelector("#multiplier");
const progressEl = document.querySelector("#progress");
const energyEl = document.querySelector("#energy");
const toastEl = document.querySelector("#toast");

const BPM = 128;
const BEAT = 60 / BPM;
const LEVEL_SECONDS = 64 * BEAT;
const NOTE_SPEED = 8.4;
const COLORS = { red: "#ff275d", blue: "#22d9ff", bomb: "#14111f" };
const DIRECTIONS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  upLeft: [-0.707, -0.707], upRight: [0.707, -0.707],
  downLeft: [-0.707, 0.707], downRight: [0.707, 0.707], any: [0, 0],
};
const LANE_X = [0.2, 0.4, 0.6, 0.8];
const ROW_Y = [0.72, 0.5, 0.28];

let width = 0;
let height = 0;
let dpr = 1;
let controllerConnected = false;
let controllerMotionReady = false;
let phoneUrl = "";
let controllerSocket;
let reconnectTimer;
let mode = "lobby";
let startAt = 0;
let lastFrame = performance.now();
let notes = [];
let particles = [];
let flashes = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let hits = 0;
let misses = 0;
let possibleScore = 0;
let energy = 70;
let audioContext;
let masterGain;
let pendingStart = false;
let mouseMode = false;

const room = sessionStorage.getItem("neon-saber-room") || String(Math.floor(1000 + Math.random() * 9000));
sessionStorage.setItem("neon-saber-room", room);
pairCode.textContent = room;

const controls = {
  blue: {
    x: 0.5,
    y: 0.84,
    vx: 0,
    vy: 0,
    angle: 0,
    direction: { x: 0, y: 0.8645, z: 0.5026 },
    angularSpeed: 0,
    speed: 0,
    active: false,
    updatedAt: 0,
    history: [],
  },
};

const stars = Array.from({ length: 90 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 193) % 991) / 991,
  size: 0.4 + ((index * 17) % 10) / 9,
  phase: (index * 1.71) % 6.28,
}));

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function initializeMotionController() {
  connection.classList.add("connecting");
  connectGameSocket();
  waitForSecurePhoneLink();
}
initializeMotionController();

function connectGameSocket() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  controllerSocket = new WebSocket(`${protocol}//${location.host}/ws`);
  controllerSocket.addEventListener("open", () => {
    controllerSocket.send(JSON.stringify({ type: "register", role: "game", room }));
  });
  controllerSocket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "controller-status") {
      setControllerConnected(Boolean(message.connected));
      if (message.connected) {
        sendToController({ type: "level-state", state: mode, duration: LEVEL_SECONDS });
      }
    }
    if (message.type === "control") updatePhoneControls(message);
    if (message.type === "start" || message.type === "restart") requestStart();
    if (message.type === "controller-ready") setControllerMotionReady(message.motionEnabled === true);
  });
  controllerSocket.addEventListener("close", () => {
    setControllerConnected(false);
    connection.classList.add("connecting");
    connection.querySelector("span").textContent = "Restoring controller connection";
    reconnectTimer = setTimeout(connectGameSocket, 900);
  });
  controllerSocket.addEventListener("error", () => controllerSocket.close());
}

async function waitForSecurePhoneLink(attempt = 0) {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const config = await response.json();
    if (config.controllerUrl) {
      phoneUrl = `${config.controllerUrl}/controller?room=${encodeURIComponent(room)}`;
      phoneLink.textContent = "COPY SECURE MOTION LINK";
      phoneLink.title = phoneUrl;
      renderQrCode(phoneUrl);
      connection.querySelector("span").textContent = controllerConnected
        ? "Phone connected"
        : "Scan the QR code to connect your phone";
      return;
    }
    connection.querySelector("span").textContent =
      config.tunnelStatus === "error"
        ? "Secure phone link retrying"
        : "Starting secure phone link";
  } catch {
    connection.querySelector("span").textContent = "Starting secure phone link";
  }
  if (attempt > 45) {
    phoneLink.textContent = "RETRY SECURE LINK";
    phoneLink.addEventListener("click", () => location.reload(), { once: true });
    return;
  }
  setTimeout(() => waitForSecurePhoneLink(attempt + 1), 700);
}

function renderQrCode(value, attempt = 0) {
  if (typeof window.qrcode !== "function") {
    if (attempt < 20) setTimeout(() => renderQrCode(value, attempt + 1), 150);
    return;
  }
  try {
    const code = window.qrcode(0, "M");
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    const quiet = 4;
    const qrCanvas = document.createElement("canvas");
    qrCanvas.width = count + quiet * 2;
    qrCanvas.height = count + quiet * 2;
    const qrContext = qrCanvas.getContext("2d");
    qrContext.fillStyle = "#fff";
    qrContext.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
    qrContext.fillStyle = "#05030d";
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) qrContext.fillRect(column + quiet, row + quiet, 1, 1);
      }
    }
    const qr = document.querySelector("#qr");
    qr.replaceChildren(qrCanvas);
    qr.classList.remove("hidden");
  } catch {}
}

phoneLink.addEventListener("click", async () => {
  if (!phoneUrl) return;
  try {
    await navigator.clipboard.writeText(phoneUrl);
    showToast("Phone link copied");
  } catch {
    const input = document.createElement("input");
    input.value = phoneUrl;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("Phone link copied");
  }
});

function setControllerConnected(connected) {
  controllerConnected = connected;
  if (!connected) controllerMotionReady = false;
  connection.classList.remove("connecting");
  connection.classList.toggle("online", connected);
  connection.querySelector("span").textContent = connected
    ? controllerMotionReady
      ? "Motion controller connected — ready to slash"
      : "Phone connected — enable motion on the phone"
    : "Waiting for motion controller";
  startButton.disabled = !controllerConnected;
  if (connected) showToast("Phone connected");
}

function setControllerMotionReady(ready) {
  controllerMotionReady = controllerConnected && ready;
  startButton.disabled = !controllerConnected;
  connection.querySelector("span").textContent = controllerMotionReady
    ? "Motion controller connected — ready to slash"
    : "Phone connected — enable motion on the phone";
  if (controllerMotionReady) showToast("Phone motion is ready");
}

function updatePhoneControls(message) {
  const now = performance.now();
  const incoming = message.blue;
  if (!incoming) return;
  if (!controllerMotionReady) setControllerMotionReady(true);
  const control = controls.blue;
  control.x = clamp(Number(incoming.x), 0.42, 0.58);
  control.y = clamp(Number(incoming.y), 0.78, 0.9);
  control.vx = clamp(Number(incoming.vx) || 0, -4.5, 4.5);
  control.vy = clamp(Number(incoming.vy) || 0, -4.5, 4.5);
  control.angle = clamp(Number(incoming.angle) || 0, -180, 180);
  control.direction = normalizeDirection(
    incoming.direction || {
      x: Math.sin(control.angle * Math.PI / 180),
      y: Math.cos(control.angle * Math.PI / 180),
      z: 0,
    },
  );
  control.angularSpeed = clamp(Number(incoming.angularSpeed) || 0, 0, 14);
  control.speed = Math.max(Math.hypot(control.vx, control.vy), control.angularSpeed * 0.72);
  control.active = Boolean(incoming.active);
  control.updatedAt = now;
  addControlHistory(control, now);
}

function addControlHistory(control, now) {
  control.history.push({
    x: control.x,
    y: control.y,
    angle: control.angle,
    direction: { ...control.direction },
    at: now,
  });
  while (control.history.length > 11 || (control.history[0] && now - control.history[0].at > 170)) control.history.shift();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function normalizeDirection(direction) {
  const x = Number(direction?.x) || 0;
  const y = Number(direction?.y) || 0;
  const z = Number(direction?.z) || 0;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function createLevel() {
  const map = [];
  let index = 0;
  for (let beat = 4; beat < 61; beat += 1) {
    const color = "blue";
    const lane = (beat * 5 + Math.floor(beat / 4)) % 4;
    const row = (beat + Math.floor(beat / 3)) % 3;
    map.push({ id: index++, beat, time: beat * BEAT, color, lane, row, direction: "any" });
  }
  for (const beat of [18.5, 34.5, 50.5]) {
    map.push({ id: index++, beat, time: beat * BEAT, color: "bomb", lane: beat % 4 < 2 ? 1 : 2, row: 1, direction: "any" });
  }
  return map.sort((a, b) => a.time - b.time).map((note) => ({ ...note, resolved: false, hit: false }));
}

function currentMultiplier() {
  if (combo >= 14) return 8;
  if (combo >= 6) return 4;
  if (combo >= 2) return 2;
  return 1;
}

function updateHud() {
  scoreEl.textContent = score.toLocaleString();
  comboEl.textContent = `${combo} COMBO`;
  multiplierEl.textContent = `×${currentMultiplier()}`;
  energyEl.style.width = `${energy}%`;
}

async function ensureAudio() {
  audioContext ||= new AudioContext({ latencyHint: "interactive" });
  await audioContext.resume().catch(() => {});
  return audioContext.state === "running";
}

async function requestStart() {
  if (mode === "countdown" || mode === "playing") return;
  pendingStart = true;
  if (await ensureAudio()) beginLevel();
  else audioGate.classList.remove("hidden");
}

audioGate.querySelector("button").addEventListener("click", async () => {
  if (await ensureAudio()) {
    audioGate.classList.add("hidden");
    if (pendingStart) beginLevel();
  }
});

function beginLevel() {
  pendingStart = false;
  stopTrack();
  notes = createLevel();
  particles = [];
  flashes = [];
  score = 0;
  combo = 0;
  maxCombo = 0;
  hits = 0;
  misses = 0;
  possibleScore = 0;
  energy = 70;
  updateHud();
  lobby.classList.add("hidden");
  results.classList.add("hidden");
  hud.classList.remove("hidden");
  countdown.classList.remove("hidden");
  mode = "countdown";
  startAt = performance.now() + 3000;
  scheduleTrack(audioContext.currentTime + 3);
  sendToController({ type: "level-state", state: "countdown", duration: LEVEL_SECONDS });
}

function sendToController(message) {
  if (controllerSocket?.readyState === WebSocket.OPEN) {
    controllerSocket.send(JSON.stringify(message));
  }
}

function scheduleTrack(audioStart) {
  masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.62, audioStart);
  masterGain.gain.setValueAtTime(0.62, audioStart + LEVEL_SECONDS - 0.35);
  masterGain.gain.exponentialRampToValueAtTime(0.001, audioStart + LEVEL_SECONDS);
  masterGain.connect(audioContext.destination);
  const scale = [55, 65.41, 73.42, 82.41, 98, 110, 130.81, 146.83];
  for (let beat = 0; beat < 64; beat += 0.5) {
    const time = audioStart + beat * BEAT;
    if (Number.isInteger(beat)) kick(time, beat % 4 === 0 ? 1 : 0.72);
    hat(time, Number.isInteger(beat) ? 0.1 : 0.065);
    if (beat % 4 === 1 || beat % 4 === 3) clap(time);
    if (Number.isInteger(beat)) bass(time, scale[(beat * 3 + Math.floor(beat / 8)) % scale.length], BEAT * 0.82);
    if (beat >= 16 && Number.isInteger(beat) && beat % 2 === 0) lead(time, scale[(beat / 2 + 4) % scale.length] * 4, BEAT * 1.5);
  }
}

function stopTrack() {
  if (!masterGain || !audioContext) return;
  try {
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);
    masterGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.025);
  } catch {}
  masterGain = null;
}

function kick(time, amount) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.setValueAtTime(145, time);
  oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.13);
  gain.gain.setValueAtTime(0.7 * amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.24);
}

function noiseBuffer(duration) {
  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function hat(time, amount) {
  const source = audioContext.createBufferSource();
  const highpass = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = noiseBuffer(0.055);
  highpass.type = "highpass";
  highpass.frequency.value = 7200;
  gain.gain.setValueAtTime(amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  source.connect(highpass).connect(gain).connect(masterGain);
  source.start(time);
}

function clap(time) {
  const source = audioContext.createBufferSource();
  const bandpass = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = noiseBuffer(0.13);
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1350;
  bandpass.Q.value = 0.7;
  gain.gain.setValueAtTime(0.15, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  source.connect(bandpass).connect(gain).connect(masterGain);
  source.start(time);
}

function bass(time, frequency, duration) {
  const oscillator = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(frequency, time);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(420, time);
  filter.frequency.exponentialRampToValueAtTime(105, time + duration);
  gain.gain.setValueAtTime(0.105, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(filter).connect(gain).connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function lead(time, frequency, duration) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.055, time + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function project(note, z) {
  const perspective = 1 / (1 + Math.max(-0.4, z) * 0.075);
  const horizon = height * 0.35;
  const nearBase = height * 0.82;
  const targetX = LANE_X[note.lane] * width;
  const targetY = ROW_Y[note.row] * height;
  return {
    x: width / 2 + (targetX - width / 2) * perspective,
    y: horizon + (targetY - horizon) * perspective,
    size: clamp(Math.min(width, height) * 0.105 * perspective, 8, 102),
    perspective,
    ground: horizon + (nearBase - horizon) * perspective,
  };
}

function drawArena(now, levelTime) {
  const pulse = mode === "playing" || mode === "countdown" ? Math.pow((Math.cos(levelTime / BEAT * Math.PI * 2) + 1) / 2, 8) : (Math.sin(now * 0.0015) + 1) * 0.15;
  const background = ctx.createRadialGradient(width / 2, height * 0.38, 10, width / 2, height * 0.45, Math.max(width, height) * 0.8);
  background.addColorStop(0, `rgba(29,20,68,${0.82 + pulse * 0.1})`);
  background.addColorStop(0.5, "#080518");
  background.addColorStop(1, "#020207");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  for (const star of stars) {
    const alpha = 0.15 + 0.25 * (Math.sin(now * 0.0018 + star.phase) + 1);
    ctx.fillStyle = `rgba(176,222,255,${alpha})`;
    ctx.fillRect(star.x * width, star.y * height * 0.67, star.size, star.size);
  }
  ctx.restore();
  drawTunnel(now, levelTime, pulse);
}

function drawTunnel(now, levelTime, pulse) {
  const horizonY = height * 0.355;
  const centerX = width / 2;
  ctx.save();
  ctx.lineWidth = 1;
  const travel = mode === "playing" ? (levelTime * NOTE_SPEED) % 4 : (now * 0.0012) % 4;
  for (let z = 2 - travel; z < 42; z += 4) {
    if (z < 0.2) continue;
    const p = 1 / (1 + z * 0.075);
    const left = centerX + (width * 0.07 - centerX) * p;
    const right = centerX + (width * 0.93 - centerX) * p;
    const floor = horizonY + (height * 0.92 - horizonY) * p;
    const ceiling = horizonY + (height * 0.08 - horizonY) * p;
    ctx.strokeStyle = `rgba(93,108,190,${0.035 + p * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(left, floor); ctx.lineTo(right, floor); ctx.lineTo(right, ceiling); ctx.lineTo(left, ceiling); ctx.closePath();
    ctx.stroke();
  }
  for (let lane = 0; lane <= 4; lane += 1) {
    const x = width * (0.1 + lane * 0.2);
    ctx.strokeStyle = lane === 2 ? `rgba(169,113,255,${0.17 + pulse * 0.16})` : "rgba(77,110,181,.12)";
    ctx.beginPath();
    ctx.moveTo(centerX, horizonY);
    ctx.lineTo(x, height * 0.91);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(255,39,93,${0.22 + pulse * 0.22})`;
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#ff275d";
  ctx.beginPath(); ctx.moveTo(width * 0.07, height * 0.92); ctx.lineTo(centerX, horizonY); ctx.stroke();
  ctx.strokeStyle = `rgba(34,217,255,${0.22 + pulse * 0.22})`;
  ctx.shadowColor = "#22d9ff";
  ctx.beginPath(); ctx.moveTo(width * 0.93, height * 0.92); ctx.lineTo(centerX, horizonY); ctx.stroke();
  ctx.restore();
}

function drawNote(note, z) {
  if (note.hit || z < -1.5 || z > 38) return;
  const p = project(note, z);
  const size = p.size;
  if (note.color === "bomb") return drawBomb(p.x, p.y, size, note);
  const color = COLORS[note.color];
  const depth = size * 0.17;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowBlur = size * 0.48;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = note.resolved ? 0.38 : 0.96;
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, Math.max(2, size * 0.08));
  ctx.fill();
  ctx.globalAlpha *= 0.46;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-size / 2, -size / 2); ctx.lineTo(-size / 2 + depth, -size / 2 + depth); ctx.lineTo(size / 2 - depth, -size / 2 + depth); ctx.lineTo(size / 2, -size / 2); ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = note.resolved ? 0.35 : 1;
  drawArrow(note.direction, size);
  ctx.restore();
}

function drawArrow(direction, size) {
  if (direction === "any") {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const [dx, dy] = DIRECTIONS[direction];
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.28);
  ctx.lineTo(size * 0.22, 0);
  ctx.lineTo(size * 0.08, 0);
  ctx.lineTo(size * 0.08, size * 0.27);
  ctx.lineTo(-size * 0.08, size * 0.27);
  ctx.lineTo(-size * 0.08, 0);
  ctx.lineTo(-size * 0.22, 0);
  ctx.closePath();
  ctx.fill();
}

function drawBomb(x, y, size, note) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = note.resolved ? 0.2 : 1;
  ctx.shadowBlur = size * 0.4;
  ctx.shadowColor = "#9b7aff";
  const gradient = ctx.createRadialGradient(-size * 0.12, -size * 0.12, 1, 0, 0, size * 0.55);
  gradient.addColorStop(0, "#6e647c"); gradient.addColorStop(0.45, "#201a2d"); gradient.addColorStop(1, "#08070d");
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#a986ff";
  ctx.lineWidth = Math.max(1, size * 0.035);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4); ctx.lineTo(Math.cos(a) * size * 0.62, Math.sin(a) * size * 0.62); ctx.stroke();
  }
  ctx.restore();
}

function drawSabers(now) {
  for (const color of ["blue"]) {
    const control = controls[color];
    const geometry = saberGeometry(control);
    const history = control.history;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < history.length; i += 1) {
      const from = saberGeometry(history[i - 1]);
      const to = saberGeometry(history[i]);
      const alpha = i / history.length * 0.18;
      ctx.strokeStyle = hexToRgba(COLORS[color], alpha);
      ctx.lineWidth = 6 + i * 0.8;
      ctx.beginPath();
      ctx.moveTo(from.tipX, from.tipY);
      ctx.lineTo(to.tipX, to.tipY);
      ctx.stroke();
    }

    ctx.shadowBlur = 30;
    ctx.shadowColor = COLORS[color];
    ctx.strokeStyle = COLORS[color];
    ctx.lineWidth = geometry.bladeWidth;
    ctx.beginPath();
    ctx.moveTo(geometry.handleX, geometry.handleY);
    ctx.lineTo(geometry.tipX, geometry.tipY);
    ctx.stroke();
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(255,255,255,.96)";
    ctx.lineWidth = Math.max(5, geometry.bladeWidth * 0.29);
    ctx.beginPath();
    ctx.moveTo(geometry.handleX, geometry.handleY);
    ctx.lineTo(geometry.tipX, geometry.tipY);
    ctx.stroke();

    // Looking straight down the blade produces a bright circular cap instead
    // of a full-length 2D line, making forward pointing visible.
    ctx.shadowBlur = 28;
    ctx.fillStyle = COLORS[color];
    ctx.beginPath();
    ctx.arc(geometry.tipX, geometry.tipY, geometry.bladeWidth * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 9;
    ctx.fillStyle = "rgba(255,255,255,.97)";
    ctx.beginPath();
    ctx.arc(geometry.tipX, geometry.tipY, geometry.bladeWidth * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#9da8bb";
    ctx.lineWidth = geometry.gripWidth;
    ctx.beginPath();
    ctx.moveTo(geometry.handleX - geometry.dirX * 8, geometry.handleY - geometry.dirY * 8);
    ctx.lineTo(geometry.gripX, geometry.gripY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#222534";
    ctx.lineWidth = geometry.gripWidth * 0.58;
    ctx.beginPath();
    ctx.moveTo(geometry.handleX - geometry.dirX * 8, geometry.handleY - geometry.dirY * 8);
    ctx.lineTo(geometry.gripX, geometry.gripY);
    ctx.stroke();

    ctx.shadowBlur = 18;
    ctx.fillStyle = COLORS[color];
    ctx.beginPath();
    ctx.arc(geometry.handleX, geometry.handleY, geometry.emitterRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(geometry.handleX, geometry.handleY, geometry.emitterRadius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (now - control.updatedAt > 100) {
      control.vx *= 0.86;
      control.vy *= 0.86;
      control.angularSpeed *= 0.86;
      control.speed = Math.max(Math.hypot(control.vx, control.vy), control.angularSpeed * 0.72);
    }
  }
}

function saberGeometry(control) {
  const handleX = control.x * width;
  const handleY = control.y * height;
  const direction = normalizeDirection(control.direction);
  const projectedMagnitude = Math.hypot(direction.x, direction.y);
  const angle = (Number(control.angle) || 0) * Math.PI / 180;
  const dirX = projectedMagnitude > 0.025
    ? direction.x / projectedMagnitude
    : Math.sin(angle);
  const dirY = projectedMagnitude > 0.025
    ? -direction.y / projectedMagnitude
    : -Math.cos(angle);
  const fullBladeLength = clamp(Math.min(width, height) * 0.62, 400, 680);
  const depthScale = 1 - Math.max(0, direction.z) * 0.12 + Math.max(0, -direction.z) * 0.18;
  const bladeLength = fullBladeLength * clamp(projectedMagnitude, 0.065, 1) * depthScale;
  const gripLength = clamp(fullBladeLength * clamp(projectedMagnitude, 0.42, 1) * 0.13, 48, 82);
  const foreshortening = 1 - projectedMagnitude;
  const bladeWidth = clamp(18 + Math.max(0, direction.z) * 17 + foreshortening * 12, 18, 46);
  const gripWidth = clamp(22 + foreshortening * 9, 22, 34);
  return {
    handleX,
    handleY,
    tipX: handleX + dirX * bladeLength,
    tipY: handleY + dirY * bladeLength,
    gripX: handleX - dirX * gripLength,
    gripY: handleY - dirY * gripLength,
    dirX,
    dirY,
    direction,
    projectedMagnitude,
    bladeWidth,
    gripWidth,
    emitterRadius: clamp(12 + foreshortening * 5, 12, 17),
  };
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function updateNotes(levelTime, now) {
  for (const note of notes) {
    if (note.resolved) continue;
    const delta = note.time - levelTime;
    if (delta > 0.22 || delta < -0.24) {
      if (delta < -0.24) resolveMiss(note);
      continue;
    }
    const candidates = [controls.blue];
    for (const control of candidates) {
      if (!control) continue;
      const fresh = now - control.updatedAt < (mouseMode ? 380 : 220);
      if (!fresh || !control.active) continue;
      const saber = saberGeometry(control);
      const blockX = LANE_X[note.lane] * width;
      const blockY = ROW_Y[note.row] * height;
      const hitRadius = clamp(Math.min(width, height) * 0.065, 46, 82);
      const distance = pointToSegmentDistance(
        blockX,
        blockY,
        saber.handleX,
        saber.handleY,
        saber.tipX,
        saber.tipY,
      );
      if (distance > hitRadius) continue;
      if (note.color === "bomb") {
        note.resolved = true;
        note.hit = true;
        combo = 0;
        energy = clamp(energy - 18, 1, 100);
        misses += 1;
        spawnParticles(note, control, "#9b7aff", 18);
        flashes.push({ text: "BOMB", x: LANE_X[note.lane], y: ROW_Y[note.row], color: "#b294ff", born: now });
        sendToController({ type: "feedback", result: "bomb", combo, score });
        updateHud();
        break;
      }
      resolveHit(note, control, distance / hitRadius, now);
      break;
    }
  }
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy || 1;
  const position = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (x1 + position * dx), py - (y1 + position * dy));
}

function resolveHit(note, control, proximity, now) {
  note.resolved = true;
  note.hit = true;
  const accuracy = clamp(1 - proximity, 0, 1);
  const swing = clamp((control.speed - 0.44) / 1.5, 0, 1);
  const cutScore = Math.round(70 + swing * 30 + accuracy * 15);
  score += cutScore * currentMultiplier();
  possibleScore += 115 * currentMultiplier();
  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  hits += 1;
  energy = clamp(energy + 2.2, 1, 100);
  spawnParticles(note, control, COLORS[note.color], 26);
  flashes.push({ text: String(cutScore), x: LANE_X[note.lane], y: ROW_Y[note.row], color: COLORS[note.color], born: now });
  sendToController({ type: "feedback", result: "hit", color: note.color, combo, score, cutScore });
  updateHud();
}

function resolveMiss(note) {
  note.resolved = true;
  if (note.color === "bomb") return;
  combo = 0;
  misses += 1;
  possibleScore += 115 * currentMultiplier();
  energy = clamp(energy - 9, 1, 100);
  flashes.push({ text: "MISS", x: LANE_X[note.lane], y: ROW_Y[note.row], color: "#ffffff", born: performance.now() });
  sendToController({ type: "feedback", result: "miss", combo, score });
  updateHud();
}

function spawnParticles(note, control, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.atan2(control.vy, control.vx) + Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = 70 + Math.random() * 250;
    particles.push({
      x: LANE_X[note.lane] * width,
      y: ROW_Y[note.row] * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.42,
      maxLife: 0.75,
      size: 2 + Math.random() * 8,
      color,
    });
  }
}

function updateAndDrawParticles(dt) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  particles = particles.filter((particle) => {
    particle.life -= dt;
    if (particle.life <= 0) return false;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.shadowBlur = 13;
    ctx.shadowColor = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    return true;
  });
  ctx.restore();
}

function drawFlashes(now) {
  flashes = flashes.filter((flash) => {
    const age = (now - flash.born) / 1000;
    if (age > 0.65) return false;
    ctx.save();
    ctx.globalAlpha = 1 - age / 0.65;
    ctx.fillStyle = flash.color;
    ctx.textAlign = "center";
    ctx.font = `900 ${18 + age * 20}px Segoe UI,Arial`;
    ctx.shadowBlur = 15;
    ctx.shadowColor = flash.color;
    ctx.fillText(flash.text, flash.x * width, flash.y * height - age * 75);
    ctx.restore();
    return true;
  });
}

function finishLevel() {
  if (mode === "results") return;
  mode = "results";
  hud.classList.add("hidden");
  countdown.classList.add("hidden");
  results.classList.remove("hidden");
  const accuracy = hits + misses ? hits / (hits + misses) : 0;
  const rank = accuracy >= 0.96 ? "SS" : accuracy >= 0.9 ? "S" : accuracy >= 0.8 ? "A" : accuracy >= 0.68 ? "B" : accuracy >= 0.5 ? "C" : "D";
  document.querySelector("#rank").textContent = rank;
  document.querySelector("#final-score").textContent = score.toLocaleString();
  document.querySelector("#max-combo").textContent = maxCombo;
  document.querySelector("#accuracy").textContent = `${Math.round(accuracy * 100)}%`;
  sendToController({ type: "level-state", state: "results", score, maxCombo, accuracy: Math.round(accuracy * 100), rank });
}

function render(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.034);
  lastFrame = now;
  const levelTime = (now - startAt) / 1000;
  if (mode === "countdown") {
    const remaining = Math.ceil(-levelTime);
    countdown.textContent = remaining > 0 ? remaining : "GO";
    if (levelTime >= 0) {
      mode = "playing";
      setTimeout(() => countdown.classList.add("hidden"), 480);
      sendToController({ type: "level-state", state: "playing", duration: LEVEL_SECONDS });
    }
  }
  drawArena(now, levelTime);
  if (mode === "playing" || mode === "countdown") {
    if (mode === "playing") updateNotes(levelTime, now);
    const ordered = notes.map((note) => ({ note, z: (note.time - levelTime) * NOTE_SPEED })).sort((a, b) => b.z - a.z);
    for (const item of ordered) drawNote(item.note, item.z);
    drawSabers(now);
    updateAndDrawParticles(dt);
    drawFlashes(now);
    progressEl.style.width = `${clamp(levelTime / LEVEL_SECONDS * 100, 0, 100)}%`;
    if (levelTime >= LEVEL_SECONDS + 0.5) finishLevel();
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

startButton.addEventListener("click", requestStart);
document.querySelector("#practice").addEventListener("click", () => {
  mouseMode = true;
  controls.blue.active = true;
  showToast("Move the mouse quickly through blocks to swing the blue saber.");
  requestStart();
});
document.querySelector("#replay").addEventListener("click", requestStart);
document.querySelector("#back-lobby").addEventListener("click", () => {
  mode = "lobby";
  stopTrack();
  results.classList.add("hidden");
  hud.classList.add("hidden");
  lobby.classList.remove("hidden");
  sendToController({ type: "level-state", state: "lobby" });
});

let previousMouse = { x: 0.5, y: 0.7, at: performance.now() };
window.addEventListener("pointerdown", (event) => {
  if (!mouseMode || (mode !== "playing" && mode !== "countdown")) return;
  updateMouse(event);
});
window.addEventListener("pointermove", (event) => {
  if (!mouseMode || (mode !== "playing" && mode !== "countdown")) return;
  updateMouse(event);
});

function updateMouse(event) {
  const now = performance.now();
  const x = event.clientX / width;
  const y = event.clientY / height;
  const seconds = Math.max((now - previousMouse.at) / 1000, 0.008);
  const control = controls.blue;
  control.x = x;
  control.y = y;
  control.vx = (x - previousMouse.x) / seconds;
  control.vy = (y - previousMouse.y) / seconds;
  control.angle = clamp(control.vx * 9, -55, 55);
  control.direction = normalizeDirection({
    x: Math.sin(control.angle * Math.PI / 180),
    y: Math.cos(control.angle * Math.PI / 180),
    z: 0,
  });
  control.angularSpeed = 0;
  control.speed = Math.hypot(control.vx, control.vy);
  control.active = true;
  control.updatedAt = now;
  previousMouse = { x, y, at: now };
  addControlHistory(control, now);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && mode !== "playing" && mode !== "countdown") requestStart();
});
