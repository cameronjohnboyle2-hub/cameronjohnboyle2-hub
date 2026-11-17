import {
  NEUTRAL_BLADE_DIRECTION,
  advanceTrackedOrientation,
  amplifyBladeDepth,
  angularDistance,
  bladeDirectionFromOrientations,
  normalizeVector,
  quaternionFromDeviceOrientation,
} from "./orientation-math.js";

const room = new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || "";
const roomEl = document.querySelector("#room");
const statusEl = document.querySelector("#status");
const statusText = statusEl.querySelector("span");
const messageEl = document.querySelector("#message");
const motionStateEl = document.querySelector("#motion-state");
const saberEl = document.querySelector("#saber");
const bladeEl = saberEl.querySelector(".blade");
const enableButton = document.querySelector("#enable-motion");
const playActions = document.querySelector("#play-actions");
const startButton = document.querySelector("#start-level");
const centerButton = document.querySelector("#center-saber");
const diagnosticButton = document.querySelector("#run-diagnostic");
const markerButton = document.querySelector("#mark-issue");
const diagnosticStateEl = document.querySelector("#diagnostic-state");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");

let socket;
let reconnectTimer;
let connected = false;
let motionEnabled = false;
let motionSeen = false;
let latestOrientation = null;
let calibration = null;
let previousRawOrientation = null;
let trackedOrientation = null;
let gyroRate = 0;
let gyroSeenAt = 0;
let wakeLock;
let diagnosticTestRunning = false;
let diagnosticSample = {
  driftGuard: false,
  gyroFresh: false,
  gyroRate: 0,
  sampleIntervalMs: 0,
  projectedLength: Math.hypot(NEUTRAL_BLADE_DIRECTION.x, NEUTRAL_BLADE_DIRECTION.y),
  sensorDirection: { ...NEUTRAL_BLADE_DIRECTION },
  driftCorrectedDirection: { ...NEUTRAL_BLADE_DIRECTION },
  depthBoostedDirection: { ...NEUTRAL_BLADE_DIRECTION },
  screenAngle: 0,
  absoluteOrientation: false,
};
const pose = {
  x: 0.5,
  y: 0.84,
  vx: 0,
  vy: 0,
  angle: 0,
  direction: { ...NEUTRAL_BLADE_DIRECTION },
  angularSpeed: 0,
  lastAt: performance.now(),
  lastSentAt: 0,
};

roomEl.textContent = room || "----";
if (!room) {
  setStatus("error", "BAD LINK");
  messageEl.textContent = "Scan the QR code shown by Neon Saber again.";
  enableButton.disabled = true;
} else {
  connectSocket();
}

function setStatus(kind, label) {
  statusEl.className = `status ${kind}`;
  statusText.textContent = label;
}

function updateButtons() {
  startButton.disabled = !(connected && motionEnabled);
}

function send(message) {
  if (socket?.readyState !== WebSocket.OPEN || !connected) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function connectSocket() {
  clearTimeout(reconnectTimer);
  connected = false;
  updateButtons();
  setStatus("connecting", "CONNECTING");
  messageEl.textContent = "Connecting directly to your computer…";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "register", role: "controller", room }));
  });
  socket.addEventListener("message", (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "registered") {
      connected = true;
      setStatus("online", motionEnabled ? "MOTION READY" : "COMPUTER FOUND");
      messageEl.textContent = motionEnabled
        ? "Connected. Your phone is the blue saber."
        : "Computer found. Enable motion and calibrate.";
      updateButtons();
      send({
        type: "controller-ready",
        room,
        mode: "motion",
        sabers: 1,
        motionEnabled,
      });
      sendControl();
    }
    if (data.type === "diagnostic-status" && data.recording) {
      diagnosticStateEl.classList.add("live");
      diagnosticStateEl.textContent = "Diagnostics recording locally on the computer";
    }
    if (data.type === "diagnostic-marker-saved") {
      if (diagnosticTestRunning) return;
      diagnosticStateEl.classList.add("live");
      diagnosticStateEl.textContent = "Issue moment marked in the recording";
      setTimeout(() => {
        diagnosticStateEl.textContent = "Diagnostics recording locally on the computer";
      }, 1400);
    }
    if (data.type === "feedback") {
      scoreEl.textContent = Number(data.score || 0).toLocaleString();
      comboEl.textContent = String(Number(data.combo || 0));
      if (data.result === "hit") navigator.vibrate?.(18);
      if (data.result === "miss") navigator.vibrate?.([36, 20, 36]);
      if (data.result === "bomb") navigator.vibrate?.([85, 30, 85]);
    }
    if (data.type === "level-state") {
      if (data.state === "countdown") {
        setStatus("online", "GET READY");
        messageEl.textContent = "Start received. Watch the computer.";
      } else if (data.state === "playing") {
        setStatus("online", "LEVEL LIVE");
        messageEl.textContent = "Hit the blue blocks with the saber.";
      } else if (data.state === "results") {
        setStatus("online", "LEVEL COMPLETE");
        messageEl.textContent = `${String(data.rank || "—")} rank · ${Number(data.score || 0).toLocaleString()} points`;
      } else if (data.state === "lobby") {
        setStatus("online", motionEnabled ? "MOTION READY" : "COMPUTER FOUND");
        messageEl.textContent = "Ready for another run.";
      }
    }
  });
  socket.addEventListener("close", handleDisconnect);
  socket.addEventListener("error", () => socket.close());
}

function handleDisconnect() {
  connected = false;
  updateButtons();
  setStatus("connecting", "RECONNECTING");
  messageEl.textContent = "The computer link paused. Reconnecting…";
  reconnectTimer = setTimeout(connectSocket, 900);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function handleDeviceMotion(event) {
  const rotation = event.rotationRate;
  const rates = [rotation?.alpha, rotation?.beta, rotation?.gamma]
    .map(Number)
    .filter(Number.isFinite);
  if (!rates.length) return;
  gyroRate = Math.hypot(...rates);
  gyroSeenAt = performance.now();
}

function handleOrientation(event) {
  const alpha = Number(event.alpha);
  const beta = Number(event.beta);
  const gamma = Number(event.gamma);
  if (![alpha, beta, gamma].every(Number.isFinite)) return;
  const now = performance.now();
  const dt = clamp((now - pose.lastAt) / 1000, 0.008, 0.05);
  const screenAngle = screen.orientation?.angle ?? Number(window.orientation || 0);
  const rawOrientation = quaternionFromDeviceOrientation(alpha, beta, gamma, screenAngle);
  const gyroIsFresh = now - gyroSeenAt < 180;
  let driftGuardActive = false;
  if (!previousRawOrientation || !trackedOrientation) {
    previousRawOrientation = rawOrientation;
    trackedOrientation = rawOrientation;
  } else {
    driftGuardActive = gyroIsFresh && gyroRate < 0.22;
    trackedOrientation = advanceTrackedOrientation(
      previousRawOrientation,
      trackedOrientation,
      rawOrientation,
      driftGuardActive ? 0.035 : 1,
    );
    previousRawOrientation = rawOrientation;
  }
  latestOrientation = trackedOrientation;
  calibration ||= { ...latestOrientation };

  const sensorDirection = bladeDirectionFromOrientations(calibration, rawOrientation);
  const driftCorrectedDirection = bladeDirectionFromOrientations(calibration, latestOrientation);
  const targetDirection = amplifyBladeDepth(driftCorrectedDirection);
  const previousDirection = { ...pose.direction };
  const smoothing = 1 - Math.exp(-dt * 22);
  pose.direction = normalizeVector({
    x: pose.direction.x + (targetDirection.x - pose.direction.x) * smoothing,
    y: pose.direction.y + (targetDirection.y - pose.direction.y) * smoothing,
    z: pose.direction.z + (targetDirection.z - pose.direction.z) * smoothing,
  });
  pose.angularSpeed = clamp(angularDistance(previousDirection, pose.direction) / dt, 0, 14);
  pose.vx = clamp((pose.direction.x - previousDirection.x) / dt, -8, 8);
  pose.vy = clamp(-(pose.direction.y - previousDirection.y) / dt, -8, 8);
  pose.x = 0.5;
  pose.y = 0.84;
  pose.lastAt = now;

  const projectedLength = Math.hypot(pose.direction.x, pose.direction.y);
  diagnosticSample = {
    driftGuard: driftGuardActive,
    gyroFresh: gyroIsFresh,
    gyroRate: Math.round(gyroRate * 1000) / 1000,
    sampleIntervalMs: Math.round(dt * 100000) / 100,
    projectedLength: Math.round(projectedLength * 10000) / 10000,
    sensorDirection: {
      x: Math.round(sensorDirection.x * 10000) / 10000,
      y: Math.round(sensorDirection.y * 10000) / 10000,
      z: Math.round(sensorDirection.z * 10000) / 10000,
    },
    driftCorrectedDirection: {
      x: Math.round(driftCorrectedDirection.x * 10000) / 10000,
      y: Math.round(driftCorrectedDirection.y * 10000) / 10000,
      z: Math.round(driftCorrectedDirection.z * 10000) / 10000,
    },
    depthBoostedDirection: {
      x: Math.round(targetDirection.x * 10000) / 10000,
      y: Math.round(targetDirection.y * 10000) / 10000,
      z: Math.round(targetDirection.z * 10000) / 10000,
    },
    screenAngle: Number(screenAngle) || 0,
    absoluteOrientation: event.absolute === true,
  };
  pose.angle = Math.atan2(pose.direction.x, pose.direction.y) * 180 / Math.PI;
  saberEl.style.left = `${pose.x * 100}%`;
  saberEl.style.top = `${pose.y * 100}%`;
  saberEl.style.transform = `translate(-50%, -100%) rotate(${pose.angle}deg)`;
  bladeEl.style.height = `${clamp(projectedLength * 176, 22, 176)}px`;
  bladeEl.style.width = `${clamp(13 + Math.max(0, pose.direction.z) * 14, 13, 27)}px`;
  bladeEl.style.opacity = String(clamp(0.72 + projectedLength * 0.28, 0.72, 1));
  if (!motionSeen) {
    motionSeen = true;
    motionStateEl.textContent = "3D tracking is live";
    messageEl.textContent = connected
      ? "Calibrated. Point, tilt, and swing the phone like a hilt."
      : "Calibrated. Waiting for the computer link.";
  }
  if (now - pose.lastSentAt >= 28) {
    pose.lastSentAt = now;
    sendControl(beta, gamma, alpha);
  }
}

function sendControl(beta = 0, gamma = 0, alpha = 0) {
  send({
    type: "control",
    blue: {
      x: Math.round(pose.x * 1000) / 1000,
      y: Math.round(pose.y * 1000) / 1000,
      vx: Math.round(pose.vx * 1000) / 1000,
      vy: Math.round(pose.vy * 1000) / 1000,
      angle: Math.round(pose.angle * 10) / 10,
      direction: {
        x: Math.round(pose.direction.x * 10000) / 10000,
        y: Math.round(pose.direction.y * 10000) / 10000,
        z: Math.round(pose.direction.z * 10000) / 10000,
      },
      angularSpeed: Math.round(pose.angularSpeed * 1000) / 1000,
      active: motionEnabled,
    },
    motion: { alpha: Number(alpha || 0), beta: Number(beta || 0), gamma: Number(gamma || 0) },
    diagnostic: diagnosticSample,
    sentAt: Date.now(),
  });
}

function centerSaber() {
  if (latestOrientation) calibration = { ...latestOrientation };
  pose.x = 0.5;
  pose.y = 0.84;
  pose.vx = 0;
  pose.vy = 0;
  pose.angularSpeed = 0;
  pose.angle = 0;
  pose.direction = { ...NEUTRAL_BLADE_DIRECTION };
  pose.lastAt = performance.now();
  saberEl.style.left = "50%";
  saberEl.style.top = "84%";
  saberEl.style.transform = "translate(-50%, -100%) rotate(0deg)";
  bladeEl.style.height = "176px";
  bladeEl.style.width = "20px";
  bladeEl.style.opacity = "1";
  motionStateEl.textContent = "Centered — point, tilt, and swing";
  messageEl.textContent = connected
    ? "Centered. The phone is now the saber handle."
    : "Centered. Waiting for the computer link.";
  navigator.vibrate?.(24);
  sendControl();
}

async function enableMotion() {
  if (!window.isSecureContext) {
    setStatus("error", "NEEDS HTTPS");
    messageEl.textContent = "Scan the secure QR code from the computer again.";
    return;
  }
  try {
    const OrientationEvent = window.DeviceOrientationEvent;
    const MotionEvent = window.DeviceMotionEvent;
    if (typeof OrientationEvent?.requestPermission === "function") {
      const permission = await OrientationEvent.requestPermission();
      if (permission !== "granted") {
        setStatus("error", "MOTION BLOCKED");
        messageEl.textContent = "Reload this page and choose Allow for motion access.";
        return;
      }
    }
    if (typeof MotionEvent?.requestPermission === "function") {
      try { await MotionEvent.requestPermission(); } catch {}
    }
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    window.removeEventListener("deviceorientation", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation, { passive: true });
    window.removeEventListener("devicemotion", handleDeviceMotion);
    window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
    motionEnabled = true;
    enableButton.classList.add("hidden");
    playActions.classList.remove("hidden");
    setStatus(connected ? "online" : "connecting", connected ? "MOTION READY" : "CONNECTING");
    updateButtons();
    send({ type: "controller-ready", room, mode: "motion", sabers: 1, motionEnabled: true });
    centerSaber();
    setTimeout(() => {
      if (!motionSeen) {
        messageEl.textContent = "No orientation signal yet. Check motion permission, then reload.";
      }
    }, 1800);
  } catch {
    setStatus("error", "MOTION ERROR");
    messageEl.textContent = "Use Safari on iPhone or Chrome on Android, then reload.";
  }
}

enableButton.addEventListener("click", enableMotion);
centerButton.addEventListener("click", centerSaber);
diagnosticButton.addEventListener("click", runDiagnosticTest);
markerButton.addEventListener("click", () => {
  if (!send({ type: "diagnostic-marker", marker: "felt-wrong" })) {
    diagnosticStateEl.textContent = "Still connecting — issue was not marked";
    return;
  }
  diagnosticStateEl.textContent = "Marking this moment…";
  navigator.vibrate?.([18, 28, 18]);
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runDiagnosticTest() {
  if (diagnosticTestRunning || !connected || !motionEnabled) return;
  diagnosticTestRunning = true;
  diagnosticButton.disabled = true;
  startButton.disabled = true;
  centerButton.disabled = true;
  markerButton.disabled = true;
  centerSaber();
  const phases = [
    {
      marker: "phase-hold-still-start",
      seconds: 4,
      instruction: "HOLD STILL",
      message: "Keep the phone upright and completely still for 4 seconds.",
    },
    {
      marker: "phase-forward-back",
      seconds: 5,
      instruction: "FORWARD ↔ BACK",
      message: "Point the phone’s top edge toward the computer, then back. Repeat.",
    },
    {
      marker: "phase-left-right",
      seconds: 5,
      instruction: "SWING LEFT ↔ RIGHT",
      message: "Make several comfortable left and right saber swings.",
    },
    {
      marker: "phase-hold-still-end",
      seconds: 4,
      instruction: "HOLD STILL AGAIN",
      message: "Return upright and hold completely still for the final 4 seconds.",
    },
  ];
  send({ type: "diagnostic-marker", marker: "guided-test-start" });
  navigator.vibrate?.([25, 40, 25]);
  for (const phase of phases) {
    send({ type: "diagnostic-marker", marker: phase.marker });
    motionStateEl.textContent = phase.instruction;
    messageEl.textContent = phase.message;
    for (let remaining = phase.seconds; remaining > 0; remaining -= 1) {
      diagnosticStateEl.textContent = `Recording · ${remaining} second${remaining === 1 ? "" : "s"}`;
      await wait(1000);
    }
    navigator.vibrate?.(28);
  }
  send({ type: "diagnostic-marker", marker: "guided-test-complete" });
  diagnosticTestRunning = false;
  diagnosticButton.disabled = false;
  startButton.disabled = !(connected && motionEnabled);
  centerButton.disabled = false;
  markerButton.disabled = false;
  motionStateEl.textContent = "Motion test complete";
  messageEl.textContent = "Recording saved. Return to the computer and tell me the test is done.";
  diagnosticStateEl.classList.add("live");
  diagnosticStateEl.textContent = "Guided motion test recorded locally";
  navigator.vibrate?.([25, 35, 25, 35, 45]);
}
startButton.addEventListener("click", () => {
  if (!send({ type: "start" })) {
    messageEl.textContent = "Still connecting to the computer. Wait for the green status.";
    return;
  }
  messageEl.textContent = "Start sent — watch the computer.";
  navigator.vibrate?.([22, 34, 22]);
});

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && motionEnabled && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  }
});
