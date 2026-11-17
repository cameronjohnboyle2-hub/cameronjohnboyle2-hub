const TO_RADIANS = Math.PI / 180;
const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export const NEUTRAL_BLADE_DIRECTION = Object.freeze(
  normalizeVector({ x: 0, y: 0.86, z: 0.5 }),
);

export function normalizeQuaternion(quaternion) {
  const length = Math.hypot(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w,
  ) || 1;
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  };
}

export function multiplyQuaternions(left, right) {
  return normalizeQuaternion({
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  });
}

export function quaternionFromAxisAngle(axis, degrees) {
  const radians = degrees * TO_RADIANS;
  const half = radians / 2;
  const sine = Math.sin(half);
  return normalizeQuaternion({
    x: axis.x * sine,
    y: axis.y * sine,
    z: axis.z * sine,
    w: Math.cos(half),
  });
}

export function quaternionFromDeviceOrientation(alpha, beta, gamma, screenAngle = 0) {
  const aroundZ = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, alpha);
  const aroundX = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, beta);
  const aroundY = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, gamma);
  const screenCorrection = quaternionFromAxisAngle(
    { x: 0, y: 0, z: 1 },
    -screenAngle,
  );

  // Device Orientation uses intrinsic Z-X'-Y'' rotations.
  return multiplyQuaternions(
    multiplyQuaternions(multiplyQuaternions(aroundZ, aroundX), aroundY),
    screenCorrection,
  );
}

export function inverseQuaternion(quaternion) {
  const normalized = normalizeQuaternion(quaternion);
  return {
    x: -normalized.x,
    y: -normalized.y,
    z: -normalized.z,
    w: normalized.w,
  };
}

export function slerpQuaternions(from, to, amount) {
  const start = normalizeQuaternion(from);
  let end = normalizeQuaternion(to);
  let dot = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;
  if (dot < 0) {
    dot = -dot;
    end = { x: -end.x, y: -end.y, z: -end.z, w: -end.w };
  }
  const t = Math.max(0, Math.min(1, amount));
  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t,
      w: start.w + (end.w - start.w) * t,
    });
  }
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sine = Math.sin(theta);
  const startWeight = Math.sin((1 - t) * theta) / sine;
  const endWeight = Math.sin(t * theta) / sine;
  return normalizeQuaternion({
    x: start.x * startWeight + end.x * endWeight,
    y: start.y * startWeight + end.y * endWeight,
    z: start.z * startWeight + end.z * endWeight,
    w: start.w * startWeight + end.w * endWeight,
  });
}

export function advanceTrackedOrientation(previousRaw, tracked, currentRaw, follow = 1) {
  const rawStep = multiplyQuaternions(currentRaw, inverseQuaternion(previousRaw));
  const guardedStep = slerpQuaternions(IDENTITY_QUATERNION, rawStep, follow);
  return multiplyQuaternions(guardedStep, tracked);
}

export function relativeQuaternion(calibration, current) {
  // Orient the calibrated world-space blade by the phone's change in pose.
  // Device quaternions map device space to world space, so the delta is
  // current * inverse(calibration), not the reverse.
  return multiplyQuaternions(current, inverseQuaternion(calibration));
}

export function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

export function rotateVector(quaternion, vector) {
  const q = normalizeQuaternion(quaternion);
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);
  return normalizeVector({
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  });
}

export function bladeDirectionFromOrientations(calibration, current) {
  return rotateVector(
    relativeQuaternion(calibration, current),
    NEUTRAL_BLADE_DIRECTION,
  );
}

export function amplifyBladeDepth(direction, gain = 1.55) {
  const normalized = normalizeVector(direction);
  const depth = Math.max(
    -0.985,
    Math.min(
      0.995,
      NEUTRAL_BLADE_DIRECTION.z
        + (normalized.z - NEUTRAL_BLADE_DIRECTION.z) * gain,
    ),
  );
  const planarLength = Math.hypot(normalized.x, normalized.y);
  const boostedPlanarLength = Math.sqrt(Math.max(0, 1 - depth * depth));
  if (planarLength < 0.0001) {
    return { x: 0, y: boostedPlanarLength, z: depth };
  }
  return {
    x: normalized.x / planarLength * boostedPlanarLength,
    y: normalized.y / planarLength * boostedPlanarLength,
    z: depth,
  };
}

export function angularDistance(from, to) {
  const dot = Math.max(
    -1,
    Math.min(1, from.x * to.x + from.y * to.y + from.z * to.z),
  );
  return Math.acos(dot);
}
