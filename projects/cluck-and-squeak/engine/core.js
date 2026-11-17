/**
 * engine/core.js
 * Environment-independent deterministic simulation engine for Cluck & Squeak.
 * Free of DOM, audio, and Figma APIs.
 * Universal Module Definition (Node.js CommonJS & Browser global CluckCore).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Settings = require('./settings.js');
    module.exports = factory(Settings);
  } else {
    root.CluckCore = factory(root.CluckSettings);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Settings) {
  'use strict';

  // Fallback settings if not injected
  const S = Settings || {
    SIM_HZ: 20,
    SIM_DT: 0.05,
    RENDER_HZ: 10,
    RENDER_DT: 0.10
  };

  /**
   * Fast 32-bit checksum for strings (FNV-1a).
   */
  function computeChecksum(str) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  /**
   * Safely splits serialized state into 16 KiB chunks and saves to plugin data storage.
   */
  function saveChunkedState(target, rawString, chunkSize = 16384) {
    if (!target || typeof target.setPluginData !== 'function') {
      throw new Error('Target must support setPluginData');
    }
    const checksum = computeChecksum(rawString);
    const totalBytes = rawString.length;
    const chunkCount = Math.max(1, Math.ceil(totalBytes / chunkSize));

    for (let c = 0; c < chunkCount; c++) {
      const chunk = rawString.slice(c * chunkSize, (c + 1) * chunkSize);
      target.setPluginData('cs:chunk_' + c, chunk);
    }

    let prevManifest = null;
    try {
      const prev = target.getPluginData('cs:save_manifest');
      if (prev) prevManifest = JSON.parse(prev);
    } catch (e) {}

    if (prevManifest && prevManifest.count > chunkCount) {
      for (let c = chunkCount; c < prevManifest.count; c++) {
        target.setPluginData('cs:chunk_' + c, '');
      }
    }

    const manifest = {
      count: chunkCount,
      totalBytes,
      chunkSize,
      checksum,
      savedAt: Date.now()
    };
    target.setPluginData('cs:save_manifest', JSON.stringify(manifest));
    return manifest;
  }

  /**
   * Reassembles chunked state from plugin data storage and validates checksum.
   * Returns parsed raw string or null if corrupted/missing.
   */
  function loadChunkedState(target) {
    if (!target || typeof target.getPluginData !== 'function') return null;
    const manifestStr = target.getPluginData('cs:save_manifest');
    if (!manifestStr) return null;

    let manifest;
    try {
      manifest = JSON.parse(manifestStr);
    } catch (e) {
      return null;
    }

    if (!manifest || !manifest.count || manifest.totalBytes === undefined) {
      return null;
    }

    let fullStr = '';
    for (let c = 0; c < manifest.count; c++) {
      const chunk = target.getPluginData('cs:chunk_' + c);
      if (chunk === undefined || chunk === null) {
        return null;
      }
      fullStr += chunk;
    }

    if (fullStr.length !== manifest.totalBytes) {
      return null;
    }

    if (manifest.checksum !== undefined && computeChecksum(fullStr) !== manifest.checksum) {
      return null;
    }

    return fullStr;
  }

  /**
   * Advisory single-host evaluation: determines whether this client is Host or Spectator.
   */
  function evaluateHostRole(target, userId, now = Date.now()) {
    if (!target || typeof target.getPluginData !== 'function') {
      return { role: 'host', hostId: userId, lastSeen: now };
    }

    const hostStr = target.getPluginData('cs:active_host');
    if (hostStr) {
      try {
        const active = JSON.parse(hostStr);
        if (active.userId && active.userId !== userId && (now - active.lastSeen) < 8000) {
          return { role: 'spectator', hostId: active.userId, lastSeen: active.lastSeen };
        }
      } catch (e) {}
    }

    target.setPluginData('cs:active_host', JSON.stringify({ userId, lastSeen: now }));
    return { role: 'host', hostId: userId, lastSeen: now };
  }

  /**
   * Mulberry32 Seeded PRNG
   * Fast, 32-bit state, deterministic across platforms.
   */
  function createPrng(initialSeed) {
    let state = (initialSeed >>> 0) || 1;
    function next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t >>> 0) / 4294967296);
    }
    next.getState = () => state;
    next.setState = (s) => { state = s >>> 0; };
    next.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
    next.float = (min, max) => min + next() * (max - min);
    return next;
  }

  /**
   * Identifies the primary horizontal battle corridor between user content rows.
   * Free of DOM and Figma APIs (operates on node/box geometry { x, y, width, height }).
   */
  function detectCorridor(nodes) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const contentBoxes = [];

    for (let i = 0; i < (nodes || []).length; i++) {
      const n = nodes[i];
      const owner = n.getPluginData ? n.getPluginData('cs:owner') : (n.pluginData ? n.pluginData['cs:owner'] : '');
      if (owner === 'cluck-and-squeak') continue;
      if (n.width && n.height && n.width > 20 && n.height > 20 && 'x' in n && 'y' in n) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + n.width);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y + n.height);
        contentBoxes.push({
          id: n.id,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          top: n.y,
          bottom: n.y + n.height
        });
      }
    }

    if (contentBoxes.length === 0) {
      return {
        hasUserContent: false,
        minX: -600, maxX: 2000,
        minY: 0, maxY: 600,
        corridorTop: 150, corridorBottom: 450,
        corridorCenterY: 300,
        corridorHeight: 300
      };
    }

    // Sort boxes by vertical coordinate to find horizontal gap between rows
    contentBoxes.sort((a, b) => a.top - b.top);

    let maxGap = 0;
    let bestGapTop = minY + (maxY - minY) * 0.4;
    let bestGapBottom = minY + (maxY - minY) * 0.6;

    let currentBottom = contentBoxes[0].bottom;
    for (let i = 1; i < contentBoxes.length; i++) {
      const box = contentBoxes[i];
      const gap = box.top - currentBottom;
      if (gap > maxGap && gap >= 80) {
        maxGap = gap;
        bestGapTop = currentBottom;
        bestGapBottom = box.top;
      }
      currentBottom = Math.max(currentBottom, box.bottom);
    }

    let corridorTop = bestGapTop;
    let corridorBottom = bestGapBottom;
    let corridorCenterY = (corridorTop + corridorBottom) / 2;

    if (maxGap < 80) {
      corridorTop = minY + (maxY - minY) * 0.35;
      corridorBottom = minY + (maxY - minY) * 0.65;
      corridorCenterY = (minY + maxY) / 2;
    }

    return {
      hasUserContent: true,
      minX: minX - 1200,
      maxX: maxX + 1200,
      contentMinX: minX,
      contentMaxX: maxX,
      contentMinY: minY,
      contentMaxY: maxY,
      minY: Math.min(minY - 400, corridorTop - 500),
      maxY: Math.max(maxY + 400, corridorBottom + 500),
      corridorTop,
      corridorBottom,
      corridorCenterY,
      corridorHeight: corridorBottom - corridorTop
    };
  }

  /**
   * Distance between point (px, py) and segment (x1, y1)-(x2, y2).
   */
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function getUnitStatusFactor(u) {
    if (u.isRouted) return 1.35;
    if (u.isCharging) return 1.45;
    if (u.counterZealTimer > 0) return 1.30;
    if (u.isCrusading) return 1.15;
    if (u.isSiege) return 0.65;
    if (u.isFallingBack) return 0.85;
    if (u.hasPlunder) return 0.90;
    return 1.0;
  }

  function getUnitSpeedCeiling(u, roadFactor = 1.0) {
    const baseCeil = u.isCrusading ? 5.8 : (u.isCharging ? 6.5 : (u.isRouted ? 5.8 : (u.hasPlunder ? 5.5 : (u.isSiege ? 3.0 : 4.5))));
    return baseCeil * roadFactor;
  }

  function canDamage(attackerTeam, target, isTruce, hasCrabs = false) {
    if (isTruce) return false;
    if (!target || target.isDead) return false;
    if (target.team === attackerTeam) return false;
    if (hasCrabs) return true; // Crabs fight all, all fight crabs
    return true;
  }

  /**
   * 2D Uniform Spatial Hash Grid for high-performance deterministic neighbor queries.
   * Supports both .x/.y and .pos.x/.pos.y.
   * Handles arbitrary negative and positive world coordinates.
   * Deterministically breaks distance ties by logical ID.
   */
  class SpatialGrid {
    constructor(cellSize = 64) {
      this.cellSize = cellSize;
      this.grid = new Map();
    }

    _key(cx, cy) {
      return (cx | 0) + ':' + (cy | 0);
    }

    clear() {
      this.grid.clear();
    }

    insert(entity) {
      if (!entity || entity.isDead) return;
      const ex = entity.x !== undefined ? entity.x : (entity.pos ? entity.pos.x : 0);
      const ey = entity.y !== undefined ? entity.y : (entity.pos ? entity.pos.y : 0);
      const cx = Math.floor(ex / this.cellSize);
      const cy = Math.floor(ey / this.cellSize);
      const key = this._key(cx, cy);
      let list = this.grid.get(key);
      if (!list) {
        list = [];
        this.grid.set(key, list);
      }
      list.push(entity);
    }

    build(entities) {
      this.clear();
      for (let i = 0; i < entities.length; i++) {
        this.insert(entities[i]);
      }
    }

    queryRadius(x, y, radius, filterFn = null) {
      const minCx = Math.floor((x - radius) / this.cellSize);
      const maxCx = Math.floor((x + radius) / this.cellSize);
      const minCy = Math.floor((y - radius) / this.cellSize);
      const maxCy = Math.floor((y + radius) / this.cellSize);
      const rSq = radius * radius;
      const candidates = [];

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const list = this.grid.get(this._key(cx, cy));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (item.isDead) continue;
            const ix = item.x !== undefined ? item.x : (item.pos ? item.pos.x : 0);
            const iy = item.y !== undefined ? item.y : (item.pos ? item.pos.y : 0);
            const dx = ix - x;
            const dy = iy - y;
            const dSq = dx * dx + dy * dy;
            if (dSq <= rSq) {
              if (!filterFn || filterFn(item)) {
                candidates.push({ item, distSq: dSq });
              }
            }
          }
        }
      }

      // Deterministic sort: distance first, breaking ties deterministically by logical ID
      candidates.sort((a, b) => {
        if (Math.abs(a.distSq - b.distSq) > 0.0001) {
          return a.distSq - b.distSq;
        }
        const idA = String(a.item.id || '');
        const idB = String(b.item.id || '');
        return idA.localeCompare(idB);
      });

      return candidates.map(c => c.item);
    }
  }

  /**
   * Coarse A* Grid Route Finder on 64px cells.
   * Enables captains/workers to navigate around complex/U-shaped obstacles without getting stuck.
   */
  function findCoarseRoute(startX, startY, targetX, targetY, obstacles = [], bounds = null, moverRadius = 24) {
    const CS = 64;
    const startGx = Math.round(startX / CS);
    const startGy = Math.round(startY / CS);
    const targetGx = Math.round(targetX / CS);
    const targetGy = Math.round(targetY / CS);

    if (startGx === targetGx && startGy === targetGy) {
      return [{ x: targetX, y: targetY }];
    }

    function isBlocked(gx, gy) {
      const px = gx * CS;
      const py = gy * CS;
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const pad = moverRadius + 6;
        if (px >= obs.x - pad && px <= obs.x + obs.width + pad &&
            py >= obs.y - pad && py <= obs.y + obs.height + pad) {
          return true;
        }
      }
      return false;
    }

    const keyOf = (gx, gy) => `${gx}:${gy}`;
    const startKey = keyOf(startGx, startGy);
    const targetKey = keyOf(targetGx, targetGy);

    const openSet = [{ gx: startGx, gy: startGy, g: 0, f: Math.hypot(targetGx - startGx, targetGy - startGy) }];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(startKey, 0);

    let iterations = 0;
    const MAX_ITER = 350;

    while (openSet.length > 0 && iterations++ < MAX_ITER) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();

      if (current.gx === targetGx && current.gy === targetGy) {
        const path = [{ x: targetX, y: targetY }];
        let currKey = keyOf(current.gx, current.gy);
        while (cameFrom.has(currKey)) {
          const prev = cameFrom.get(currKey);
          path.unshift({ x: prev.gx * CS, y: prev.gy * CS });
          currKey = keyOf(prev.gx, prev.gy);
        }
        return path;
      }

      const neighbors = [
        { gx: current.gx + 1, gy: current.gy },
        { gx: current.gx - 1, gy: current.gy },
        { gx: current.gx, gy: current.gy + 1 },
        { gx: current.gx, gy: current.gy - 1 }
      ];

      for (let n = 0; n < neighbors.length; n++) {
        const nb = neighbors[n];
        if (isBlocked(nb.gx, nb.gy) && keyOf(nb.gx, nb.gy) !== targetKey) {
          continue;
        }
        const tentativeG = current.g + 1;
        const nbKey = keyOf(nb.gx, nb.gy);
        if (tentativeG < (gScore.has(nbKey) ? gScore.get(nbKey) : Infinity)) {
          cameFrom.set(nbKey, current);
          gScore.set(nbKey, tentativeG);
          const h = Math.hypot(targetGx - nb.gx, targetGy - nb.gy);
          openSet.push({ gx: nb.gx, gy: nb.gy, g: tentativeG, f: tentativeG + h });
        }
      }
    }

    return null; // Route blocked
  }

  /**
   * Evaluates the active campaign phase of the world:
   * 'RECOVERY' | 'RAID' | 'CLASH' | 'ADVANCE' | 'MUSTER'
   */
  function calculateCampaignPhase(world) {
    if (!world) return 'MUSTER';
    if (world.isTruce || (world.exhaustionSustainTimer && world.exhaustionSustainTimer > 0)) {
      return 'RECOVERY';
    }

    const units = world.units || [];
    const living = units.filter(u => !u.isDead);
    if (living.length === 0) {
      return 'MUSTER';
    }

    // RAID: Any living unit carrying plunder, or incursion inside enemy capital base (< 220px)
    const hasPlunder = living.some(u => u.hasPlunder);
    let enemyBaseBreach = false;
    if (world.bases && world.bases.chicken && world.bases.mouse) {
      for (let i = 0; i < living.length; i++) {
        const u = living[i];
        if (u.isHarvester || u.isRouted) continue;
        const eBase = u.team === 'chicken' ? world.bases.mouse : (u.team === 'mouse' ? world.bases.chicken : null);
        if (eBase) {
          const d = Math.hypot(u.x - eBase.cx, u.y - eBase.cy);
          if (d < 220) {
            enemyBaseBreach = true;
            break;
          }
        }
      }
    }
    if (hasPlunder || enemyBaseBreach) {
      return 'RAID';
    }

    // CLASH: In-flight missiles or living opposing combatants within 90px
    if (world.projectiles && world.projectiles.length > 0) {
      return 'CLASH';
    }
    let inClash = false;
    for (let i = 0; i < living.length; i++) {
      const u = living[i];
      if (u.isHarvester || u.isRouted) continue;
      for (let j = i + 1; j < living.length; j++) {
        const o = living[j];
        if (o.isHarvester || o.isRouted || o.team === u.team) continue;
        if (Math.hypot(u.x - o.x, u.y - o.y) < 90) {
          inClash = true;
          break;
        }
      }
      if (inClash) break;
    }
    if (inClash) {
      return 'CLASH';
    }

    // ADVANCE: Regiments marching or units advancing with forward velocity
    const hasMarchingRegiment = world.regiments && world.regiments.some(r => r.state === 'LOCKSTEP_MARCH' || r.state === 'ENGAGING');
    const hasAdvancingUnits = living.some(u => !u.isHarvester && !u.isHoldingLine && Math.hypot(u.vx || 0, u.vy || 0) > 0.4);
    if (hasMarchingRegiment || hasAdvancingUnits) {
      return 'ADVANCE';
    }

    return 'MUSTER';
  }

  /**
   * Initializes a brand-new logical simulation world.
   */
  function createWorld(customSettings = {}, seed = 42) {
    const settings = Object.assign({}, S, customSettings);
    const rng = createPrng(seed);

    return {
      seed,
      tick: 0,
      time: 0.0,
      accumulator: 0.0,
      simDt: settings.SIM_DT || 0.05,
      rng,
      settings,
      units: [],
      pendingSpawns: new Map(), // requestId -> payload
      regiments: [],
      retiredRegiments: [],
      projectiles: [],
      obstacles: [],
      roads: [],
      resourceNodes: [],
      bases: {
        chicken: { cx: 200, cy: 300, width: 440, height: 600 },
        mouse: { cx: 1300, cy: 300, width: 440, height: 600 }
      },
      economy: {
        chicken: { grain: 60 },
        mouse: { cheese: 60 }
      },
      techEra: 1,
      eraUnlocksAwarded: new Set(),
      isTruce: false,
      truceTimer: 0.0,
      truceCooldown: 0.0,
      campaignCombatants: 0,
      combatDeaths: 0,
      exhaustionSustainTimer: 0.0,
      scheduledEvents: [],
      recentEvents: [],
      volleysFiredCount: 0,
      underdogCooldownChicken: 0.0,
      underdogCooldownMouse: 0.0,
      passiveEconomyTimer: 0.0,
      chickenRecruitTimer: 0.0,
      mouseRecruitTimer: 0.0,
      regimentCounterChicken: 1,
      regimentCounterMouse: 1
    };
  }

  /**
   * Schedules an event on the simulation timeline.
   */
  function scheduleEvent(world, delaySeconds, type, payload = {}) {
    const executeAtTick = world.tick + Math.max(1, Math.round(delaySeconds / world.simDt));
    world.scheduledEvents.push({ executeAtTick, type, payload });
  }

  /**
   * Emits a user-facing event into the simulation log.
   */
  function emitLog(world, text, kind = 'info') {
    world.recentEvents.push({ tick: world.tick, time: world.time, text, kind });
    if (world.recentEvents.length > 40) {
      world.recentEvents.shift();
    }
  }

  /**
   * Advances the simulation by a fixed delta time (dt = 0.05).
   */
  function tickSim(world, dt) {
    world.tick++;
    world.time += dt;

    // 1. Process scheduled timeline events
    if (world.scheduledEvents.length > 0) {
      const remaining = [];
      for (let i = 0; i < world.scheduledEvents.length; i++) {
        const ev = world.scheduledEvents[i];
        if (ev.executeAtTick <= world.tick) {
          executeTimelineEvent(world, ev);
        } else {
          remaining.push(ev);
        }
      }
      world.scheduledEvents = remaining;
    }

    // 2. Passive economy generation (+1 per second, capped at 300)
    world.passiveEconomyTimer += dt;
    if (world.passiveEconomyTimer >= 1.0) {
      world.passiveEconomyTimer -= 1.0;
      world.economy.chicken.grain = Math.min(300, world.economy.chicken.grain + 1);
      world.economy.mouse.cheese = Math.min(300, world.economy.mouse.cheese + 1);
    }

    // Auto-recruitment when food reserves >= 15 (Cap 85 per side)
    world.chickenRecruitTimer = (world.chickenRecruitTimer || 0) + dt;
    world.mouseRecruitTimer = (world.mouseRecruitTimer || 0) + dt;
    const totalChickens = world.units.filter(u => u.team === 'chicken' && !u.isDead).length;
    const totalMice = world.units.filter(u => u.team === 'mouse' && !u.isDead).length;

    if (world.chickenRecruitTimer > 2.0 && totalChickens < 85 && world.economy.chicken.grain >= 15) {
      world.chickenRecruitTimer = 0;
      applyCommand(world, { type: 'RECRUIT_UNIT', team: 'chicken' });
    }
    if (world.mouseRecruitTimer > 2.0 && totalMice < 85 && world.economy.mouse.cheese >= 15) {
      world.mouseRecruitTimer = 0;
      applyCommand(world, { type: 'RECRUIT_UNIT', team: 'mouse' });
    }

    // Harvester maintenance (1-2 workers per team)
    const cHarv = world.units.filter(u => u.team === 'chicken' && u.isHarvester && !u.isDead).length;
    const mHarv = world.units.filter(u => u.team === 'mouse' && u.isHarvester && !u.isDead).length;
    if (cHarv < 2 && totalChickens > 0 && world.rng() < 0.04) {
      const b = world.bases.chicken;
      const sx = b ? b.cx + 50 : 200;
      const sy = b ? b.cy : 300;
      world.units.push({
        id: 'harv_chicken_' + world.tick + '_' + (world.rng() * 10000 | 0),
        name: 'Worker Chick', team: 'chicken',
        x: sx, y: sy, startX: sx, startY: sy,
        vx: 0, vy: 0, facingX: 1, facingY: 0,
        hp: 100, maxHp: 100, morale: 100, maxMorale: 100,
        isDead: false, isRouted: false, isHarvester: true,
        harvestTimer: 0, hasCargo: false, decayTimer: 8.0, speedMultiplier: 1.0
      });
    }
    if (mHarv < 2 && totalMice > 0 && world.rng() < 0.04) {
      const b = world.bases.mouse;
      const sx = b ? b.cx - 50 : 1200;
      const sy = b ? b.cy : 300;
      world.units.push({
        id: 'harv_mouse_' + world.tick + '_' + (world.rng() * 10000 | 0),
        name: 'Forager Mouse', team: 'mouse',
        x: sx, y: sy, startX: sx, startY: sy,
        vx: 0, vy: 0, facingX: -1, facingY: 0,
        hp: 100, maxHp: 100, morale: 100, maxMorale: 100,
        isDead: false, isRouted: false, isHarvester: true,
        harvestTimer: 0, hasCargo: false, decayTimer: 8.0, speedMultiplier: 1.0
      });
    }

    // Emergency Underdog Relief (300s cooldown, 6 units, only in dire existential crisis)
    if (world.underdogCooldownChicken > 0) world.underdogCooldownChicken = Math.max(0, world.underdogCooldownChicken - dt);
    if (world.underdogCooldownMouse > 0) world.underdogCooldownMouse = Math.max(0, world.underdogCooldownMouse - dt);

    if (world.underdogCooldownChicken <= 0 && totalChickens <= 6 && totalMice >= 24) {
      world.underdogCooldownChicken = 300.0;
      for (let k = 0; k < 6; k++) {
        const b = world.bases.chicken;
        const sx = b ? b.cx + 60 : 200;
        const sy = b ? b.cy : 300;
        world.units.push({
          id: 'templar_chicken_' + world.tick + '_' + k,
          name: 'Royal Templar',
          team: 'chicken',
          x: sx, y: sy + (k - 2.5) * 24, startX: sx, startY: sy,
          vx: 0, vy: 0, facingX: 1, facingY: 0,
          hp: 140, maxHp: 140, morale: 150, maxMorale: 150,
          isCaptain: k === 0, isCavalry: true, isCrusading: true,
          isDead: false, isRouted: false, isCharging: false, chargeCd: 0,
          decayTimer: 8.0, speedMultiplier: 1.15, targetedCount: 0
        });
      }
      emitLog(world, '👑📯 ROYAL TEMPLAR RELIEF! 6 Paladins deployed!', 'crusade');
    }

    if (world.underdogCooldownMouse <= 0 && totalMice <= 6 && totalChickens >= 24) {
      world.underdogCooldownMouse = 300.0;
      for (let k = 0; k < 6; k++) {
        const b = world.bases.mouse;
        const sx = b ? b.cx - 60 : 1200;
        const sy = b ? b.cy : 300;
        world.units.push({
          id: 'templar_mouse_' + world.tick + '_' + k,
          name: 'Cheddar Templar',
          team: 'mouse',
          x: sx, y: sy + (k - 2.5) * 24, startX: sx, startY: sy,
          vx: 0, vy: 0, facingX: -1, facingY: 0,
          hp: 130, maxHp: 130, morale: 150, maxMorale: 150,
          isCaptain: k === 0, isCavalry: true, isCrusading: true,
          isDead: false, isRouted: false, isCharging: false, chargeCd: 0,
          decayTimer: 8.0, speedMultiplier: 1.15, targetedCount: 0
        });
      }
      emitLog(world, '🧀⚡ CHEDDAR CITADEL RELIEF! 6 Heavy Templars deployed!', 'crusade');
    }

    // 3. Dynamic forward and perpendicular battle vectors
    let forwardDir = { x: 1, y: 0 };
    let perpDir = { x: 0, y: 1 };
    if (world.bases.chicken && world.bases.mouse) {
      const bdx = world.bases.mouse.cx - world.bases.chicken.cx;
      const bdy = world.bases.mouse.cy - world.bases.chicken.cy;
      const bdist = Math.hypot(bdx, bdy) || 1;
      forwardDir = { x: bdx / bdist, y: bdy / bdist };
      perpDir = { x: -bdy / bdist, y: bdx / bdist };
    }

    // 4. Update regiments
    for (let r = 0; r < world.regiments.length; r++) {
      const reg = world.regiments[r];
      if (typeof reg.update === 'function') {
        reg.update(dt, forwardDir, perpDir, world);
      }
    }

    // 5. Truce & exhaustion calculation
    if (world.truceCooldown > 0) world.truceCooldown = Math.max(0, world.truceCooldown - dt);

    const totalCombatUnits = world.units.filter(u => !u.isDead && !u.isHarvester).length;
    if (totalCombatUnits > world.campaignCombatants) {
      world.campaignCombatants = totalCombatUnits;
    }

    const casualtyRatio = world.campaignCombatants > 0 ? (world.combatDeaths / world.campaignCombatants) : 0;
    const isExhausted = (world.combatDeaths >= 8 && casualtyRatio >= 0.65) ||
                        (totalCombatUnits < 4 && totalCombatUnits > 0 && world.combatDeaths >= 4);

    if (isExhausted) {
      world.exhaustionSustainTimer += dt;
    } else {
      world.exhaustionSustainTimer = 0;
    }

    if (!world.isTruce && world.truceCooldown <= 0 && world.exhaustionSustainTimer >= 3.0) {
      declareTruce(world, 25.0);
      world.campaignCombatants = totalCombatUnits;
      world.combatDeaths = 0;
      world.exhaustionSustainTimer = 0;
    }

    if (world.isTruce) {
      world.truceTimer = Math.max(0, world.truceTimer - dt);
      world.units.forEach(u => {
        if (!u.isDead && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + 18.0 * dt);
        }
      });

      if (world.truceTimer <= 0) {
        world.isTruce = false;
        world.truceTimer = 0.0;
        world.truceCooldown = 80.0;
        advanceTechEra(world);
        const living = world.units.filter(u => !u.isDead && !u.isHarvester).length;
        world.campaignCombatants = living;
        world.combatDeaths = 0;
        world.exhaustionSustainTimer = 0;
      }
    }

    // 6. Update in-flight projectiles
    updateProjectiles(world, dt);

    // 7. Update unit physics, collision & steering
    const hasCrabs = world.units.some(u => u.team === 'crab' && !u.isDead);
    for (let i = 0; i < world.units.length; i++) {
      world.units[i].targetedCount = 0;
    }

    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];

      if (u.isDead) {
        u.decayTimer -= dt;
        if (u.decayTimer <= 0) {
          world.units.splice(i, 1);
          i--;
        }
        continue;
      }

      if (u.chargeCd > 0) u.chargeCd = Math.max(0, u.chargeCd - dt);
      if (u.stunTimer > 0) {
        u.stunTimer = Math.max(0, u.stunTimer - dt);
        u.vx *= 0.50;
        u.vy *= 0.50;
        u.x += u.vx;
        u.y += u.vy;
        continue;
      }

      // Check connector road boost
      let onRoad = false;
      for (let r = 0; r < world.roads.length; r++) {
        const rd = world.roads[r];
        if (distToSegment(u.x, u.y, rd.x1, rd.y1, rd.x2, rd.y2) < 45) {
          onRoad = true;
          break;
        }
      }
      const roadFactor = onRoad ? 1.70 : 1.0;
      const statusFactor = getUnitStatusFactor(u);
      u.speedMultiplier = statusFactor * roadFactor;

      // Harvester logic
      if (u.isHarvester) {
        updateHarvesterUnit(world, u, dt, roadFactor);
        continue;
      }

      // Combatant steering & engagement
      updateCombatantUnit(world, u, dt, roadFactor, hasCrabs);
    }

    // 8. Anti-clumping unit separation
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (u.isDead) continue;
      for (let j = i + 1; j < world.units.length; j++) {
        const other = world.units[j];
        if (other.isDead) continue;

        const sx = u.x - other.x;
        const sy = u.y - other.y;
        const sDist = Math.hypot(sx, sy);
        const desiredDist = 44;
        if (sDist < desiredDist && sDist > 0.001) {
          const overlap = desiredDist - sDist;
          const push = sDist < 28 ? Math.min(8.0, (overlap / sDist) * 0.45) : (overlap / desiredDist) * 0.22;

          if (!(u.isCaptain && other.team === u.team)) {
            u.vx += (sx / sDist) * push;
            u.vy += (sy / sDist) * push;
          }
          if (!(other.isCaptain && other.team === u.team)) {
            other.vx -= (sx / sDist) * push;
            other.vy -= (sy / sDist) * push;
          }
        }
      }
    }

    // 9. Obstacle steering & velocity clamping
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (u.isDead) continue;

      for (let k = 0; k < world.obstacles.length; k++) {
        const obs = world.obstacles[k];
        const pad = 24;
        const left = obs.x - pad;
        const right = obs.x + obs.width + pad;
        const top = obs.y - pad;
        const bottom = obs.y + obs.height + pad;

        if (u.x > left && u.x < right && u.y > top && u.y < bottom) {
          const obsCy = obs.cy !== undefined ? obs.cy : (obs.y + obs.height / 2);
          const steerDir = (u.y < obsCy) ? -1 : 1;
          u.vy += steerDir * 55 * dt * 2.5;

          const dLeft = Math.abs(u.x - left);
          const dRight = Math.abs(u.x - right);
          const dTop = Math.abs(u.y - top);
          const dBottom = Math.abs(u.y - bottom);
          const minD = Math.min(dLeft, dRight, dTop, dBottom);

          if (minD === dLeft) { u.x = left - 2; u.vx = Math.min(0, u.vx); }
          else if (minD === dRight) { u.x = right + 2; u.vx = Math.max(0, u.vx); }
          else if (minD === dTop) { u.y = top - 2; u.vy = Math.min(0, u.vy); }
          else { u.y = bottom + 2; u.vy = Math.max(0, u.vy); }
        }
      }

      // Playfield / corridor containment
      if (world.bounds) {
        if (world.bounds.minY !== undefined && u.y < world.bounds.minY) {
          u.y = world.bounds.minY;
          u.vy = Math.max(0, u.vy) + 2.0;
        } else if (world.bounds.maxY !== undefined && u.y > world.bounds.maxY) {
          u.y = world.bounds.maxY;
          u.vy = Math.min(0, u.vy) - 2.0;
        }

        if (world.bounds.minX !== undefined && u.x < world.bounds.minX) {
          u.x = world.bounds.minX;
          u.vx = Math.max(0, u.vx) + 2.0;
        } else if (world.bounds.maxX !== undefined && u.x > world.bounds.maxX) {
          u.x = world.bounds.maxX;
          u.vx = Math.min(0, u.vx) - 2.0;
        }
      }

      u.vx *= 0.80;
      u.vy *= 0.80;
      const roadF = u.speedMultiplier && u.speedMultiplier > 1.3 ? 1.7 : 1.0;
      const maxSpd = getUnitSpeedCeiling(u, roadF);
      const curSpd = Math.hypot(u.vx, u.vy);
      if (curSpd > maxSpd) {
        u.vx = (u.vx / curSpd) * maxSpd;
        u.vy = (u.vy / curSpd) * maxSpd;
      }
      u.x += u.vx;
      u.y += u.vy;

      // 9b. Capital Base Protection Circle
      if (world.bases) {
        const cBase = world.bases.chicken;
        const mBase = world.bases.mouse;

        // Friendly base healing & morale recovery (+12 HP/s, +15 Morale/s)
        const friendlyBase = u.team === 'chicken' ? cBase : (u.team === 'mouse' ? mBase : null);
        if (friendlyBase) {
          const fRadius = Math.max(160, Math.min(friendlyBase.width || 440, friendlyBase.height || 600) * 0.45);
          const dFriendly = Math.hypot(u.x - friendlyBase.cx, u.y - friendlyBase.cy);
          if (dFriendly <= fRadius) {
            u.hp = Math.min(u.maxHp, u.hp + 12.0 * dt);
            u.morale = Math.min(u.maxMorale, u.morale + 15.0 * dt);
          }
        }

        // Enemy capital wall arrow / trap defense attrition (-15 HP/s, -8 Morale/s)
        if (!world.isTruce) {
          const enemyBase = u.team === 'chicken' ? mBase : (u.team === 'mouse' ? cBase : null);
          const basesToDamage = enemyBase ? [enemyBase] : (u.team === 'crab' ? [cBase, mBase].filter(Boolean) : []);
          for (let bIdx = 0; bIdx < basesToDamage.length; bIdx++) {
            const eB = basesToDamage[bIdx];
            const eRadius = Math.max(160, Math.min(eB.width || 440, eB.height || 600) * 0.45);
            const dEnemy = Math.hypot(u.x - eB.cx, u.y - eB.cy);
            if (dEnemy <= eRadius) {
              u.hp -= 15.0 * dt;
              u.morale = Math.max(0, u.morale - 8.0 * dt);
              if (u.morale <= 0) {
                u.isRouted = true;
              }
              if (u.hp <= 0) {
                recordCasualty(world, u);
              }
              break;
            }
          }
        }
      }
    }

    // 9c. Resolve simultaneous accumulated damage intents
    resolveDamageIntents(world);

    // 10. Prune retired regiments
    pruneRegiments(world);
  }

  function updateHarvesterUnit(world, u, dt, roadFactor) {
    let baseRadius = 180;
    let homeX = u.startX, homeY = u.startY;
    if (world.bases) {
      const myBase = u.team === 'chicken' ? world.bases.chicken : world.bases.mouse;
      if (myBase) {
        homeX = myBase.cx;
        homeY = myBase.cy;
        baseRadius = Math.max(160, Math.min(myBase.width, myBase.height) * 0.45);
      }
    }

    if (u.isRouted) {
      const dx = homeX - u.x;
      const dy = homeY - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      u.vx += (dx / dist) * 95 * dt * 2.2;
      u.vy += (dy / dist) * 95 * dt * 2.2;
      if (dist < baseRadius) {
        u.isRouted = false;
      }
    } else if (!u.hasCargo) {
      const targetNode = getResourceNodeForTeam(world, u.team, u);
      if (targetNode) {
        const dx = targetNode.x - u.x;
        const dy = targetNode.y - u.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > 35) {
          u.vx += (dx / dist) * 95 * dt * 2.2;
          u.vy += (dy / dist) * 95 * dt * 2.2;
          u.facingX = dx / dist;
          u.facingY = dy / dist;
        } else {
          u.harvestTimer = (u.harvestTimer || 0) + dt;
          u.vx *= 0.6; u.vy *= 0.6;
          const harvestRate = world.isTruce ? 0.7 : 1.2;
          if (u.harvestTimer >= harvestRate) {
            u.hasCargo = true;
            u.harvestTimer = 0;
            targetNode.capacity = Math.max(0, targetNode.capacity - 25);
            emitLog(world, `🚜 ${u.name} gathered resource cargo!`, 'harvest');
          }
        }
      }
    } else {
      const dx = homeX - u.x;
      const dy = homeY - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > baseRadius) {
        u.vx += (dx / dist) * 95 * dt * 2.2;
        u.vy += (dy / dist) * 95 * dt * 2.2;
        u.facingX = dx / dist;
        u.facingY = dy / dist;
      } else {
        u.hasCargo = false;
        u.isRouted = false;
        const amount = world.isTruce ? 35 : 25;
        if (u.team === 'chicken') world.economy.chicken.grain = Math.min(300, world.economy.chicken.grain + amount);
        else world.economy.mouse.cheese = Math.min(300, world.economy.mouse.cheese + amount);
        emitLog(world, `🌾 Granary +${amount} by ${u.name}!`, 'harvest');
      }
    }
    u.vx *= 0.80; u.vy *= 0.80;
    u.x += u.vx; u.y += u.vy;
  }

  function updateCombatantUnit(world, u, dt, roadFactor, hasCrabs) {
    if (u.isRouted) {
      let homeX = u.startX;
      let homeY = u.startY;
      if (world.bases) {
        const b = u.team === 'chicken' ? world.bases.chicken : world.bases.mouse;
        if (b) { homeX = b.cx; homeY = b.cy; }
      }
      const dx = homeX - u.x;
      const dy = homeY - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      u.vx += (dx / dist) * 85 * dt * 2.2;
      u.vy += (dy / dist) * 85 * dt * 2.2;
      u.facingX = dx / dist;
      u.facingY = dy / dist;
      u.morale = Math.min(u.maxMorale, u.morale + 12 * dt);
      if (dist < 180 && u.morale >= u.maxMorale * 0.70) {
        u.isRouted = false;
      }
      return;
    }

    // Find nearest target
    let nearest = null;
    let minScore = Infinity;
    for (let j = 0; j < world.units.length; j++) {
      const other = world.units[j];
      if (!canDamage(u.team, other, world.isTruce, hasCrabs)) continue;

      const dx = other.x - u.x;
      const dy = other.y - u.y;
      const dist = Math.hypot(dx, dy);

      // Tactical vision radius: do not chase individual targets across the entire canvas!
      // When enemies are beyond local tactical vision, units march toward the enemy citadel!
      const maxTacticalVision = u.isCavalry ? 550 : 380;
      if (dist > maxTacticalVision) continue;

      if (u.isHoldingLine && dist > 46) continue;

      if (other.isRouted) {
        let alliesNear = 0;
        let standingEnemies = 0;
        for (let k = 0; k < world.units.length; k++) {
          const bu = world.units[k];
          if (bu.isDead) continue;
          if (Math.hypot(bu.x - u.x, bu.y - u.y) < 260) {
            if (bu.team === u.team) alliesNear++;
            else if (!bu.isRouted) standingEnemies++;
          }
        }
        if (!(alliesNear >= 3 && standingEnemies === 0) && !(u.isCavalry && standingEnemies === 0)) {
          continue; // Discretionary pursuit
        }
      }

      const score = dist + (other.targetedCount || 0) * 80 + (other.isRouted ? 60 : 0);
      if (score < minScore) {
        minScore = score;
        nearest = other;
      }
    }

    if (nearest) {
      nearest.targetedCount = (nearest.targetedCount || 0) + 1;
      const dx = nearest.x - u.x;
      const dy = nearest.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      u.facingX = dirX;
      u.facingY = dirY;

      if (u.isCavalry && !u.isCharging && u.chargeCd <= 0 && dist > 80 && dist < 280) {
        u.isCharging = true;
      }

      const cruiseMultiplier = dist > 700 ? 1.6 : (dist > 350 ? 1.25 : 1.0);
      const baseSpeed = (u.isCharging ? 130 : (u.isCavalry ? 80 : 55)) * cruiseMultiplier;
      const speed = baseSpeed * (u.speedMultiplier || 1.0);

      if (u.isRanged) {
        if (u.shootCd > 0) u.shootCd = Math.max(0, u.shootCd - dt);
        const minRange = 90;
        const maxRange = u.isSiege ? 520 : 340;
        if (dist >= minRange && dist <= maxRange) {
          u.vx *= 0.65; u.vy *= 0.65;
          if (u.shootCd <= 0 && !world.isTruce) {
            u.shootCd = u.isSiege ? (3.2 + world.rng() * 0.8) : (2.1 + world.rng() * 0.7);
            const pType = u.isSiege ? (u.team === 'chicken' ? 'egg' : 'cheese') : (u.team === 'chicken' ? 'arrow' : 'stone');
            const pDmg = u.isSiege ? 65 : (u.team === 'chicken' ? 28 : 24);
            spawnSimProjectile(world, u.team, u.x, u.y, nearest.x, nearest.y, pType, pDmg);
          }
        } else if (dist < minRange) {
          u.vx -= dirX * 35 * dt * 2.2;
          u.vy -= dirY * 35 * dt * 2.2;
        } else {
          u.vx += dirX * speed * dt * 2.2;
          u.vy += dirY * speed * dt * 2.2;
        }
      } else if (dist > 36) {
        u.vx += dirX * speed * dt * 2.5;
        u.vy += dirY * speed * dt * 2.5;
      } else if (!world.isTruce) {
        // Melee clash
        const attackAlignment = dirX * (nearest.facingX || 1) + dirY * (nearest.facingY || 0);
        const isFlank = attackAlignment >= -0.3 && attackAlignment <= 0.4;
        const isRear = attackAlignment > 0.4;
        const angleMultiplier = isRear ? 1.65 : (isFlank ? 1.25 : 1.0);

        if (u.isCharging) {
          u.isCharging = false;
          u.chargeCd = 4.5;
          if (nearest.isBraced && attackAlignment < -0.3) {
            u.stunTimer = 1.8;
            recordDamageIntent(world, u, 85, 50, -dirX * 24, -dirY * 24);
          } else {
            const baseDmg = u.team === 'chicken' ? 65 : 55;
            recordDamageIntent(world, nearest, baseDmg * angleMultiplier, 35 * angleMultiplier, dirX * 22, dirY * 22);
          }
        } else {
          const defArmor = nearest.isDefending ? 0.40 : 1.0;
          const armor = (nearest.isCrab ? 0.75 : 1.0) * defArmor;
          const baseDmg = (u.team === 'chicken' ? 26 : 22) * angleMultiplier;
          const counterBonus = u.counterZealTimer > 0 ? 1.30 : 1.0;
          const veteranBonus = u.isVeteran ? 1.20 : 1.0;
          const dmg = (u.isCrusading ? baseDmg * 1.15 : baseDmg) * counterBonus * veteranBonus;
          recordDamageIntent(world, nearest, dmg * dt * 2.0 * armor, dmg * dt * 0.18 * angleMultiplier);
        }
      }
    } else if (!u.isHoldingLine) {
      // Advance toward enemy base
      let targetX = u.x + (u.team === 'chicken' ? 600 : -600);
      let targetY = u.y;
      if (world.bases) {
        const eBase = u.team === 'chicken' ? world.bases.mouse : world.bases.chicken;
        if (eBase) { targetX = eBase.cx; targetY = eBase.cy; }
      }
      const tdx = targetX - u.x;
      const tdy = targetY - u.y;
      const tdist = Math.hypot(tdx, tdy) || 1;
      const cruiseSpeed = 65 * (u.speedMultiplier || 1.0);
      u.vx += (tdx / tdist) * cruiseSpeed * dt * 2.0;
      u.vy += (tdy / tdist) * cruiseSpeed * dt * 2.0;
      u.facingX = tdx / tdist;
      u.facingY = tdy / tdist;
    }
  }

  function recordDamageIntent(world, target, damage, moraleLoss = 0, vx = 0, vy = 0) {
    if (!world._pendingDamages) {
      world._pendingDamages = new Map();
    }
    const cur = world._pendingDamages.get(target) || { damage: 0, moraleLoss: 0, vx: 0, vy: 0 };
    cur.damage += damage;
    cur.moraleLoss += moraleLoss;
    cur.vx += vx;
    cur.vy += vy;
    world._pendingDamages.set(target, cur);
  }

  function resolveDamageIntents(world) {
    if (!world._pendingDamages || world._pendingDamages.size === 0) return;
    const casualties = [];
    world._pendingDamages.forEach((intent, target) => {
      if (target.isDead) return;
      target.hp -= intent.damage;
      target.morale -= intent.moraleLoss;
      if (intent.vx) target.vx += intent.vx;
      if (intent.vy) target.vy += intent.vy;
      if (target.morale <= 0) target.isRouted = true;
      if (target.hp <= 0) {
        casualties.push(target);
      }
    });
    world._pendingDamages.clear();
    for (let i = 0; i < casualties.length; i++) {
      recordCasualty(world, casualties[i]);
    }
  }

  function recordCasualty(world, unit) {
    if (unit.isDead) return;
    unit.isDead = true;
    if (!unit.isHarvester) {
      world.combatDeaths++;
    }
    // Morale shock
    world.units.forEach(ally => {
      if (ally.team === unit.team && !ally.isDead && !ally.isRouted) {
        if (Math.hypot(ally.x - unit.x, ally.y - unit.y) < 140) {
          ally.morale -= (unit.isCaptain ? 20 : 4);
          if (ally.morale <= 0) ally.isRouted = true;
        }
      }
    });
  }

  function spawnSimProjectile(world, team, startX, startY, targetX, targetY, type, damage) {
    world.volleysFiredCount++;
    const isSiege = type === 'egg' || type === 'cheese';
    const scatterRange = isSiege ? 18 : 4;
    const scatterX = (world.rng() - 0.5) * scatterRange;
    const scatterY = (world.rng() - 0.5) * scatterRange;
    const dist = Math.hypot(targetX - startX, targetY - startY) || 1;
    const duration = Math.min(0.95, Math.max(0.40, dist / 390));

    world.projectiles.push({
      id: 'proj_' + world.tick + '_' + (world.rng() * 1000000 | 0),
      team,
      startX, startY,
      targetX: targetX + scatterX,
      targetY: targetY + scatterY,
      t: 0,
      duration,
      damage,
      type,
      active: true,
      x: startX,
      y: startY,
      z: 0
    });
  }

  function updateProjectiles(world, dt) {
    for (let p = 0; p < world.projectiles.length; p++) {
      const proj = world.projectiles[p];
      if (!proj.active) continue;
      proj.t += dt;
      const prog = Math.min(1.0, proj.t / proj.duration);
      proj.x = proj.startX + (proj.targetX - proj.startX) * prog;
      proj.y = proj.startY + (proj.targetY - proj.startY) * prog;
      const peakH = (proj.type === 'egg' || proj.type === 'cheese') ? 65 : 45;
      proj.z = 4 * peakH * prog * (1 - prog);

      if (prog >= 1.0) {
        proj.active = false;
        const isSiege = proj.type === 'egg' || proj.type === 'cheese';
        const splashRadius = isSiege ? 60 : 36;

        if (isSiege) {
          for (let i = 0; i < world.units.length; i++) {
            const u = world.units[i];
            if (!canDamage(proj.team, u, world.isTruce)) continue;
            if (Math.hypot(u.x - proj.x, u.y - proj.y) < splashRadius) {
              applyProjectileImpact(world, u, proj);
            }
          }
        } else {
          let closest = null;
          let minD = splashRadius;
          for (let i = 0; i < world.units.length; i++) {
            const u = world.units[i];
            if (!canDamage(proj.team, u, world.isTruce)) continue;
            const d = Math.hypot(u.x - proj.x, u.y - proj.y);
            if (d < minD) {
              minD = d;
              closest = u;
            }
          }
          if (closest) {
            applyProjectileImpact(world, closest, proj);
          }
        }
      }
    }
    world.projectiles = world.projectiles.filter(p => p.active);
  }

  function applyProjectileImpact(world, target, proj) {
    const isDefended = target.isBraced || target.isDefending;
    const reduction = isDefended ? 0.30 : 1.0;
    target.hp -= proj.damage * reduction;
    if (!isDefended) {
      target.morale -= 14;
      if (target.morale <= 0) target.isRouted = true;
    }
    if (target.hp <= 0) {
      recordCasualty(world, target);
    }
  }

  function getResourceNodeForTeam(world, team, u) {
    const targetType = team === 'chicken' ? 'grain' : 'cheese';
    let best = null;
    let minD = Infinity;
    for (let n = 0; n < world.resourceNodes.length; n++) {
      const rn = world.resourceNodes[n];
      if (rn.type === targetType && rn.capacity > 0) {
        const d = Math.hypot(rn.x - u.x, rn.y - u.y);
        if (d < minD) { minD = d; best = rn; }
      }
    }
    if (best) return best;
    if (world.bases && world.bases.chicken && world.bases.mouse) {
      const bdx = world.bases.mouse.cx - world.bases.chicken.cx;
      const bdy = world.bases.mouse.cy - world.bases.chicken.cy;
      return team === 'chicken'
        ? { name: 'Prairie Grain Field', x: world.bases.chicken.cx + bdx * 0.35, y: world.bases.chicken.cy + bdy * 0.35 - 180, capacity: 500, type: 'grain' }
        : { name: 'Cheddar Rock Quarry', x: world.bases.chicken.cx + bdx * 0.65, y: world.bases.chicken.cy + bdy * 0.65 + 180, capacity: 500, type: 'cheese' };
    }
    return { name: 'Local Forage', x: u.startX + (team === 'chicken' ? 450 : -450), y: u.startY - 150, capacity: 500, type: targetType };
  }

  function declareTruce(world, duration = 25.0) {
    if (world.isTruce) return;
    world.isTruce = true;
    world.truceTimer = duration;
    world.projectiles = []; // cancel in-flight projectiles
    world.regiments.forEach(reg => {
      if (reg.state === 'ENGAGING' || reg.state === 'LOCKSTEP_MARCH') {
        reg.state = 'HOLDING_LINE';
      }
    });
    emitLog(world, `🕊️ TRUCE OF THE RETRO! ${Math.round(duration)}s Ceasefire declared!`, 'truce');
  }

  function advanceTechEra(world) {
    if (world.techEra >= 3) return;
    world.techEra += 1;
    if (world.techEra === 2 && !world.eraUnlocksAwarded.has(2)) {
      world.eraUnlocksAwarded.add(2);
      emitLog(world, '⚔️ ADVANCED TO ERA II: Feudal Regiments unlocked!', 'era');
    } else if (world.techEra === 3 && !world.eraUnlocksAwarded.has(3)) {
      world.eraUnlocksAwarded.add(3);
      emitLog(world, '💣 ADVANCED TO ERA III: Imperial Siege Engines unlocked!', 'era');
      applyCommand(world, { type: 'SPAWN_SIEGE_ENGINES' });
    }
  }

  function pruneRegiments(world) {
    const remaining = [];
    for (let i = 0; i < world.regiments.length; i++) {
      const r = world.regiments[i];
      if (r.state === 'MERGED' || r.state === 'BROKEN') {
        world.retiredRegiments.push(r);
      } else {
        remaining.push(r);
      }
    }
    if (world.retiredRegiments.length > 30) {
      world.retiredRegiments.splice(0, world.retiredRegiments.length - 30);
    }
    world.regiments = remaining;
  }

  function executeTimelineEvent(world, event) {
    if (event.type === 'DISPATCH_REGIMENT') {
      const reg = world.regiments.find(r => r.id === event.payload.regimentId);
      if (reg && typeof reg.dispatch === 'function') {
        reg.dispatch();
        emitLog(world, `📯 ${reg.name} dispatched to the front!`, 'march');
      }
    }
  }

  /**
   * Advances the world simulation deterministically using the accumulator.
   */
  function step(world, elapsedSeconds) {
    world.accumulator += elapsedSeconds;
    // Cap accumulator at 500ms to prevent spiral-of-death under heavy freeze
    if (world.accumulator > 0.5) world.accumulator = 0.5;

    while (world.accumulator >= world.simDt) {
      tickSim(world, world.simDt);
      world.accumulator -= world.simDt;
    }
  }

  /**
   * Applies a structured command to mutate the logical simulation state.
   */
  function applyCommand(world, command) {
    if (!command || !command.type) return;

    switch (command.type) {
      case 'SETUP_BASES': {
        if (command.bases) world.bases = JSON.parse(JSON.stringify(command.bases));
        if (command.resourceNodes) world.resourceNodes = JSON.parse(JSON.stringify(command.resourceNodes));
        if (command.bounds) world.bounds = Object.assign({}, command.bounds);
        emitLog(world, '🏛️ Civilization bases established.', 'setup');
        break;
      }

      case 'SET_BOUNDS': {
        world.bounds = command.bounds;
        break;
      }

      case 'DEPLOY_UNITS': {
        // Idempotent reconciliation: don't duplicate existing logical units
        const existingMap = new Map(world.units.map(u => [u.id, u]));
        const incoming = command.units || [];
        for (let i = 0; i < incoming.length; i++) {
          const uData = incoming[i];
          if (!existingMap.has(uData.id)) {
            world.units.push(Object.assign({
              x: uData.x || 0,
              y: uData.y || 0,
              startX: uData.x || 0,
              startY: uData.y || 0,
              vx: 0,
              vy: 0,
              facingX: uData.team === 'chicken' ? 1 : -1,
              facingY: 0,
              hp: uData.hp || 100,
              maxHp: uData.maxHp || uData.hp || 100,
              morale: uData.morale || 100,
              maxMorale: uData.maxMorale || 100,
              isDead: false,
              isRouted: false,
              isCharging: false,
              chargeCd: 0,
              shootCd: uData.shootCd !== undefined ? uData.shootCd : (world.rng() * 2.0),
              decayTimer: 8.0,
              speedMultiplier: 1.0,
              targetedCount: 0
            }, uData));
          }
        }
        world.campaignCombatants = world.units.filter(u => !u.isDead && !u.isHarvester).length;
        world.combatDeaths = 0;
        world.exhaustionSustainTimer = 0;
        emitLog(world, `⚔️ Deployed ${world.units.length} troops on battlefield.`, 'deploy');
        break;
      }

      case 'ACKNOWLEDGE_UNIT': {
        const reqId = command.requestId;
        if (world.pendingSpawns.has(reqId)) {
          const uData = world.pendingSpawns.get(reqId);
          world.pendingSpawns.delete(reqId);
          uData.id = command.nodeId || uData.id;
          if (!world.units.some(u => u.id === uData.id)) {
            world.units.push(uData);
          }
        }
        break;
      }

      case 'SPAWN_SIEGE_ENGINES': {
        const cBase = world.bases.chicken;
        const mBase = world.bases.mouse;
        const cX = cBase ? cBase.cx + 80 : 280;
        const cY = cBase ? cBase.cy : 300;
        const mX = mBase ? mBase.cx - 80 : 1200;
        const mY = mBase ? mBase.cy : 300;

        world.units.push({
          id: 'siege_chick_' + world.tick + '_' + (world.rng() * 10000 | 0),
          name: 'Egg Trebuchet', team: 'chicken',
          x: cX, y: cY, startX: cX, startY: cY,
          vx: 0, vy: 0, facingX: 1, facingY: 0,
          hp: 280, maxHp: 280, morale: 200, maxMorale: 200,
          isDead: false, isRouted: false, isRanged: true, isSiege: true,
          shootCd: 3.5, decayTimer: 10, speedMultiplier: 0.65
        });

        world.units.push({
          id: 'siege_mouse_' + world.tick + '_' + (world.rng() * 10000 | 0),
          name: 'Cheddar Catapult', team: 'mouse',
          x: mX, y: mY, startX: mX, startY: mY,
          vx: 0, vy: 0, facingX: -1, facingY: 0,
          hp: 280, maxHp: 280, morale: 200, maxMorale: 200,
          isDead: false, isRouted: false, isRanged: true, isSiege: true,
          shootCd: 3.5, decayTimer: 10, speedMultiplier: 0.65
        });
        break;
      }

      case 'DECLARE_TRUCE': {
        declareTruce(world, command.duration || 25.0);
        break;
      }

      case 'RECRUIT_UNIT': {
        const team = command.team || 'chicken';
        const cost = command.cost !== undefined ? command.cost : (S.ECONOMY ? S.ECONOMY.RECRUIT_COST_FOOD : 15);
        const food = team === 'chicken' ? world.economy.chicken.grain : world.economy.mouse.cheese;
        if (food >= cost) {
          if (team === 'chicken') world.economy.chicken.grain -= cost;
          else world.economy.mouse.cheese -= cost;

          const b = team === 'chicken' ? world.bases.chicken : world.bases.mouse;
          const sx = b ? b.cx : (team === 'chicken' ? 200 : 1300);
          const sy = b ? b.cy : 300;
          world.units.push({
            id: 'rec_' + team + '_' + world.tick + '_' + (world.rng() * 10000 | 0),
            name: team === 'chicken' ? 'Peck Infantry' : 'Whisker Skirmisher',
            team,
            x: sx, y: sy, startX: sx, startY: sy,
            vx: 0, vy: 0, facingX: team === 'chicken' ? 1 : -1, facingY: 0,
            hp: 100, maxHp: 100, morale: 100, maxMorale: 100,
            isDead: false, isRouted: false, isCharging: false, chargeCd: 0,
            decayTimer: 8.0, speedMultiplier: 1.0, targetedCount: 0
          });
          emitLog(world, `⚔️ Recruited unit for ${team} (-${cost} food)`, 'recruit');
          return true;
        }
        return false;
      }

      case 'ADVANCE_ERA': {
        advanceTechEra(world);
        break;
      }

      case 'UPDATE_OBSTACLES': {
        world.obstacles = command.obstacles || [];
        world.roads = command.roads || [];
        break;
      }

      case 'RESET_POSITIONS': {
        world.units.forEach(u => {
          u.x = u.startX;
          u.y = u.startY;
          u.vx = 0;
          u.vy = 0;
          u.hp = u.maxHp;
          u.isDead = false;
          u.isRouted = false;
          u.isCharging = false;
          u.speedMultiplier = 1.0;
        });
        world.projectiles = [];
        world.campaignCombatants = world.units.filter(u => !u.isDead && !u.isHarvester).length;
        world.combatDeaths = 0;
        world.exhaustionSustainTimer = 0;
        break;
      }

      default:
        break;
    }
  }

  /**
   * Serializes the world state into a JSON-safe plain object.
   */
  function serializeWorld(world) {
    return {
      version: 1,
      seed: world.seed,
      rngState: world.rng.getState(),
      tick: world.tick,
      time: world.time,
      accumulator: world.accumulator,
      simDt: world.simDt,
      economy: JSON.parse(JSON.stringify(world.economy)),
      techEra: world.techEra,
      eraUnlocksAwarded: Array.from(world.eraUnlocksAwarded),
      isTruce: world.isTruce,
      truceTimer: world.truceTimer,
      truceCooldown: world.truceCooldown,
      campaignCombatants: world.campaignCombatants,
      combatDeaths: world.combatDeaths,
      exhaustionSustainTimer: world.exhaustionSustainTimer,
      volleysFiredCount: world.volleysFiredCount,
      chickenRecruitTimer: world.chickenRecruitTimer,
      mouseRecruitTimer: world.mouseRecruitTimer,
      bases: JSON.parse(JSON.stringify(world.bases)),
      resourceNodes: JSON.parse(JSON.stringify(world.resourceNodes)),
      obstacles: JSON.parse(JSON.stringify(world.obstacles)),
      roads: JSON.parse(JSON.stringify(world.roads)),
      units: JSON.parse(JSON.stringify(world.units)),
      projectiles: JSON.parse(JSON.stringify(world.projectiles)),
      scheduledEvents: JSON.parse(JSON.stringify(world.scheduledEvents))
    };
  }

  /**
   * Restores a running simulation world from a serialized snapshot.
   */
  function restoreWorld(snapshot, customSettings = {}) {
    const world = createWorld(customSettings, snapshot.seed || 42);
    if (snapshot.rngState !== undefined) {
      world.rng.setState(snapshot.rngState);
    }
    world.tick = snapshot.tick || 0;
    world.time = snapshot.time || 0.0;
    world.accumulator = snapshot.accumulator || 0.0;
    world.simDt = snapshot.simDt || 0.05;
    world.economy = snapshot.economy || { chicken: { grain: 60 }, mouse: { cheese: 60 } };
    world.techEra = snapshot.techEra || 1;
    world.eraUnlocksAwarded = new Set(snapshot.eraUnlocksAwarded || []);
    world.isTruce = !!snapshot.isTruce;
    world.truceTimer = snapshot.truceTimer || 0.0;
    world.truceCooldown = snapshot.truceCooldown || 0.0;
    world.campaignCombatants = snapshot.campaignCombatants || 0;
    world.combatDeaths = snapshot.combatDeaths || 0;
    world.exhaustionSustainTimer = snapshot.exhaustionSustainTimer || 0.0;
    world.volleysFiredCount = snapshot.volleysFiredCount || 0;
    world.chickenRecruitTimer = snapshot.chickenRecruitTimer || 0.0;
    world.mouseRecruitTimer = snapshot.mouseRecruitTimer || 0.0;
    world.bases = snapshot.bases || world.bases;
    world.resourceNodes = snapshot.resourceNodes || [];
    world.obstacles = snapshot.obstacles || [];
    world.roads = snapshot.roads || [];
    world.units = snapshot.units || [];
    world.projectiles = snapshot.projectiles || [];
    world.scheduledEvents = snapshot.scheduledEvents || [];
    return world;
  }

  /**
   * Deterministic 32-bit FNV-1a state checksum.
   */
  function hashWorld(world) {
    let hash = 2166136261 >>> 0;
    function mixStr(str) {
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
    }
    function mixInt(val) {
      const v = Math.round(val) | 0;
      hash ^= (v & 0xFF);
      hash = Math.imul(hash, 16777619) >>> 0;
      hash ^= ((v >> 8) & 0xFF);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    mixInt(world.tick);
    mixInt(world.economy.chicken.grain);
    mixInt(world.economy.mouse.cheese);
    mixInt(world.techEra);
    mixInt(world.isTruce ? 1 : 0);
    mixInt(world.units.length);

    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      mixInt(u.x * 10);
      mixInt(u.y * 10);
      mixInt(u.hp);
      mixInt(u.morale);
      mixInt(u.isDead ? 1 : 0);
      mixInt(u.isRouted ? 1 : 0);
    }
    return hash >>> 0;
  }

  return {
    VERSION: '1.0.0',
    createWorld,
    createPrng,
    step,
    tickSim,
    applyCommand,
    scheduleEvent,
    declareTruce,
    advanceTechEra,
    serializeWorld,
    restoreWorld,
    hashWorld,
    distToSegment,
    detectCorridor,
    getUnitStatusFactor,
    getUnitSpeedCeiling,
    canDamage,
    calculateCampaignPhase,
    SpatialGrid,
    findCoarseRoute,
    recordDamageIntent,
    resolveDamageIntents,
    computeChecksum,
    saveChunkedState,
    loadChunkedState,
    evaluateHostRole
  };
});
