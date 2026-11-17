/**
 * Game Simulation Controller for Cluck & Squeak Battle Simulator
 * Handles Game Loop, Spatial Grid, Camera, Input, and Possession.
 */

import { Vector2, SpatialGrid } from './math.js';
import { ParticleSystem } from './particles.js';
import { SCENARIOS } from './scenarios.js';
import { FormationGenerator } from './formations.js';
import { Unit } from './unit.js';
import { audio } from './audio.js';

const CluckCore = (typeof globalThis !== 'undefined' && globalThis.CluckCore)
  ? globalThis.CluckCore
  : (typeof require === 'function' ? require('../engine/core.js') : null);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.spatialGrid = new SpatialGrid(60);
    this.particleSystem = new ParticleSystem();

    this.units = [];
    this.projectiles = [];
    this.initialUnitsSnapshot = [];

    // State: 'PLACEMENT' or 'BATTLE'
    this.state = 'PLACEMENT';
    this.timeScale = 1.0;
    this.isPaused = false;
    this.battleTimer = 0;
    this.winner = null;

    // Camera
    this.camera = {
      x: 550,
      y: 400,
      zoom: 1.0,
      targetZoom: 1.0,
      targetX: 550,
      targetY: 400
    };

    // Input state
    this.input = {
      keys: new Set(),
      isMouseDown: false,
      mouseButton: 0,
      screenMouse: new Vector2(0, 0),
      worldMouse: new Vector2(0, 0),
      dragStartWorld: null,
      isPanning: false,
      panStartScreen: new Vector2(0, 0),
      panStartCam: new Vector2(0, 0),
      isDown: (code) => this.input.keys.has(code)
    };

    // Placement Mode Settings
    this.placementTool = {
      activeType: 'rooster_knight',
      activeTeam: 'chicken',
      formation: 'wedge', // 'single', 'line', 'box', 'wedge'
      count: 6
    };
    this.placementPreview = null;

    // Possession
    this.possessedUnit = null;

    // Stats
    this.stats = {
      chickenInitial: 0,
      mouseInitial: 0,
      chickenAlive: 0,
      mouseAlive: 0,
      chickenKills: 0,
      mouseKills: 0
    };

    // Callbacks for UI
    this.onStatsChange = null;
    this.onBattleEnd = null;
    this.onKillFeed = null;

    this.bindEvents();
    this.loadScenario('figma_classic');
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.input.keys.add(e.code);

      // Hotkey: Space = Toggle Pause / Start
      if (e.code === 'Space' && !this.possessedUnit) {
        e.preventDefault();
        this.togglePlayPause();
      }
      // Hotkey: F = Possess unit under cursor or unpossess
      if (e.code === 'KeyF') {
        e.preventDefault();
        this.togglePossessHovered();
      }
      // Hotkey: Escape = Exit possession
      if (e.code === 'Escape' && this.possessedUnit) {
        this.unpossess();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.input.keys.delete(e.code);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      audio.ensureContext();
      this.input.isMouseDown = true;
      this.input.mouseButton = e.button;
      this.updateMouseCoords(e);

      if (e.button === 1 || (e.button === 0 && (e.altKey || this.input.isDown('Space')))) {
        // Middle mouse or Alt-drag = Pan
        this.input.isPanning = true;
        this.input.panStartScreen.set(e.clientX, e.clientY);
        this.input.panStartCam.set(this.camera.x, this.camera.y);
      } else if (e.button === 0 && !this.possessedUnit) {
        // Left click
        if (this.state === 'PLACEMENT') {
          this.input.dragStartWorld = this.input.worldMouse.clone();
        } else {
          // In battle, check unit selection / possession
          const clickedUnit = this.findUnitAt(this.input.worldMouse);
          if (clickedUnit) {
            this.possessUnit(clickedUnit);
          }
        }
      } else if (e.button === 2 && this.state === 'PLACEMENT') {
        // Right click in placement mode = delete clicked unit
        const clickedUnit = this.findUnitAt(this.input.worldMouse);
        if (clickedUnit) {
          this.removeUnit(clickedUnit);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.updateMouseCoords(e);

      if (this.input.isPanning) {
        const dx = (e.clientX - this.input.panStartScreen.x) / this.camera.zoom;
        const dy = (e.clientY - this.input.panStartScreen.y) / this.camera.zoom;
        this.camera.x = this.input.panStartCam.x - dx;
        this.camera.y = this.input.panStartCam.y - dy;
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
      } else if (this.state === 'PLACEMENT' && this.input.dragStartWorld && this.input.mouseButton === 0) {
        this.placementPreview = {
          start: this.input.dragStartWorld,
          current: this.input.worldMouse,
          typeKey: this.placementTool.activeType,
          team: this.placementTool.activeTeam,
          formationType: this.placementTool.formation
        };
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.input.isPanning) {
        this.input.isPanning = false;
      }

      if (this.state === 'PLACEMENT' && this.input.dragStartWorld && this.input.mouseButton === 0) {
        this.finalizePlacement(this.input.dragStartWorld, this.input.worldMouse);
        this.input.dragStartWorld = null;
        this.placementPreview = null;
      }

      this.input.isMouseDown = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.min(2.5, Math.max(0.35, this.camera.zoom * zoomFactor));

      // Zoom towards mouse pointer
      const mouseWorldX = this.input.worldMouse.x;
      const mouseWorldY = this.input.worldMouse.y;

      this.camera.zoom = newZoom;
      this.camera.targetZoom = newZoom;

      // Adjust camera so mouse stays in the same place
      this.camera.x = mouseWorldX - (this.input.screenMouse.x - this.canvas.clientWidth / 2) / newZoom;
      this.camera.y = mouseWorldY - (this.input.screenMouse.y - this.canvas.clientHeight / 2) / newZoom;
      this.camera.targetX = this.camera.x;
      this.camera.targetY = this.camera.y;
    }, { passive: false });
  }

  updateMouseCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    this.input.screenMouse.set(screenX, screenY);

    const worldX = (screenX - rect.width / 2) / this.camera.zoom + this.camera.x;
    const worldY = (screenY - rect.height / 2) / this.camera.zoom + this.camera.y;
    this.input.worldMouse.set(worldX, worldY);
  }

  findUnitAt(pos, maxDist = 25) {
    let closest = null;
    let minDSq = maxDist * maxDist;
    for (const u of this.units) {
      if (u.isDead) continue;
      const dSq = u.pos.distSq(pos);
      if (dSq < minDSq) {
        minDSq = dSq;
        closest = u;
      }
    }
    return closest;
  }

  finalizePlacement(start, end) {
    const { activeType, activeTeam, formation, count } = this.placementTool;
    const dist = start.dist(end);
    const heading = Math.atan2(end.y - start.y, end.x - start.x);

    let newUnits = [];
    if (dist < 15 || formation === 'single') {
      newUnits.push(new Unit(activeType, start.x, start.y, activeTeam, heading));
    } else if (formation === 'line') {
      newUnits = FormationGenerator.createLine(activeType, activeTeam, start.x, start.y, count, 26, heading);
    } else if (formation === 'box') {
      const rows = Math.max(2, Math.floor(Math.sqrt(count)));
      const cols = Math.ceil(count / rows);
      newUnits = FormationGenerator.createBox(activeType, activeTeam, (start.x + end.x) / 2, (start.y + end.y) / 2, rows, cols, 26, heading);
    } else if (formation === 'wedge') {
      newUnits = FormationGenerator.createWedge(activeType, activeTeam, end.x, end.y, count, 26, heading);
    }

    newUnits.forEach(u => this.units.push(u));
    this.updateStats();
    audio.playClash();
  }

  loadScenario(scenarioId) {
    const sc = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
    this.activeScenario = sc;
    this.reinforceTimer = 0;
    this.unpossess();
    this.state = 'PLACEMENT';
    this.winner = null;
    this.battleTimer = 0;
    this.projectiles = [];
    this.particleSystem.clear();

    if (sc.id === 'grand_regiments') {
      this.initLivingWorld();
      this.saveSnapshot();
      this.centerCameraOnArmy();
      this.updateStats();
      return;
    }

    this.coreWorld = null;
    this.units = sc.init();
    this.saveSnapshot();
    this.centerCameraOnArmy();
    this.updateStats();
  }

  initLivingWorld(options = {}) {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (!Core) return;
    const seed = options.seed || 42;
    const bounds = options.bounds || {
      minX: 40,
      maxX: 1240,
      minY: 80,
      maxY: 720,
      corridorCenterY: 400,
      corridorTop: 240,
      corridorBottom: 560
    };
    this.coreWorld = Core.createWorld({ seed, bounds });

    const bases = options.bases || {
      chicken: { cx: 120, cy: 400, width: 440, height: 600 },
      mouse: { cx: 1160, cy: 400, width: 440, height: 600 }
    };
    const resourceNodes = options.resourceNodes || [
      { id: 'res_grain', type: 'grain', name: 'Prairie Grain Field', x: 450, y: 180, capacity: 500 },
      { id: 'res_cheese', type: 'cheese', name: 'Cheddar Quarry', x: 830, y: 620, capacity: 500 }
    ];

    Core.applyCommand(this.coreWorld, {
      type: 'SETUP_BASES',
      bases,
      resourceNodes
    });

    const units = options.units || this.createDefaultLivingUnits();
    Core.applyCommand(this.coreWorld, {
      type: 'DEPLOY_UNITS',
      units
    });

    this.syncUnitsFromCore();
  }

  createDefaultLivingUnits() {
    const sc = SCENARIOS.find(s => s.id === 'grand_regiments');
    if (!sc) return [];
    const rawUnits = sc.init();
    return rawUnits.map((u, idx) => ({
      id: 'u_' + idx,
      name: u.name || u.typeKey || 'Soldier ' + idx,
      team: u.team,
      x: u.pos.x,
      y: u.pos.y,
      hp: u.hp || 100,
      maxHp: u.maxHp || 100,
      morale: u.morale || 100,
      maxMorale: u.maxMorale || 100,
      isCaptain: !!u.isHero || idx === 0,
      isCavalry: u.typeKey === 'rooster_knight' || u.typeKey === 'cheese_knight',
      isSpear: u.typeKey === 'comb_guard' || u.typeKey === 'spearmouse',
      isRanged: u.typeKey === 'egg_lobber' || u.typeKey === 'needle_sniper',
      isSiege: u.typeKey === 'siege_catapult' || u.typeKey === 'trebuchet'
    }));
  }

  syncUnitsFromCore() {
    if (!this.coreWorld) return;
    this.units = this.coreWorld.units.map(u => ({
      id: u.id,
      name: u.name,
      team: u.team,
      pos: { x: u.x, y: u.y },
      size: u.isSiege ? 28 : (u.isCaptain ? 22 : (u.isCavalry ? 20 : 16)),
      heading: Math.atan2(u.vy || 0, u.vx || (u.team === 'chicken' ? 1 : -1)),
      walkAnimPhase: (u.walkAnimPhase || 0) + (u.vx !== 0 || u.vy !== 0 ? 0.2 : 0),
      attackAnimPhase: 0,
      isHero: !!u.isCaptain,
      hasSpear: !!u.isSpear,
      hasShield: !!u.isDefending,
      hasCheeseShield: u.team === 'mouse' && u.isCavalry,
      hasHalberd: u.team === 'chicken' && u.isCavalry,
      projectileType: u.isSiege ? 'egg' : (u.isRanged ? (u.team === 'chicken' ? 'egg' : 'needle') : null),
      flinchAnim: 0,
      isDead: !!u.isDead,
      isRouted: !!u.isRouted,
      isCharging: !!u.isCharging,
      isBraced: !!u.isBraced,
      hp: u.hp,
      maxHp: u.maxHp,
      morale: u.morale,
      maxMorale: u.maxMorale
    }));

    this.projectiles = (this.coreWorld.projectiles || []).map(p => ({
      x: p.startX + (p.targetX - p.startX) * (p.t || 0),
      y: p.startY + (p.targetY - p.startY) * (p.t || 0),
      t: p.t || 0,
      isDead: !!p.isDead,
      render(ctx) {
        const z = 4 * 60 * (p.t || 0) * (1 - (p.t || 0));
        const curX = p.startX + (p.targetX - p.startX) * (p.t || 0);
        const curY = p.startY + (p.targetY - p.startY) * (p.t || 0) - z;
        ctx.save();
        ctx.fillStyle = p.team === 'chicken' ? '#faad14' : '#8c8c8c';
        ctx.beginPath();
        ctx.arc(curX, curY, p.type === 'egg' ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }));
  }

  getSimulationHash() {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (this.coreWorld && Core) {
      return Core.hashWorld(this.coreWorld);
    }
    return 0;
  }

  orderBaseRaid() {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (this.coreWorld && Core) {
      Core.applyCommand(this.coreWorld, { type: 'ORDER_RAID' });
    }
  }

  declareTruce(duration = 25.0) {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (this.coreWorld && Core) {
      Core.declareTruce(this.coreWorld, duration);
    }
  }

  summonCrabs() {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (this.coreWorld && Core) {
      Core.scheduleEvent(this.coreWorld, 0, 'CRAB_HORDE');
    }
  }

  recruitUnit(team) {
    const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
    if (this.coreWorld && Core) {
      Core.applyCommand(this.coreWorld, { type: 'RECRUIT_UNIT', team });
    }
  }

  saveSnapshot() {
    this.initialUnitsSnapshot = this.units.map(u => ({
      typeKey: u.typeKey,
      team: u.team,
      x: u.pos.x,
      y: u.pos.y,
      heading: u.heading
    }));
  }

  restartBattle() {
    this.unpossess();
    this.state = 'PLACEMENT';
    this.winner = null;
    this.battleTimer = 0;
    this.projectiles = [];
    this.particleSystem.clear();

    // Recreate units from snapshot
    this.units = this.initialUnitsSnapshot.map(s => new Unit(s.typeKey, s.x, s.y, s.team, s.heading));
    this.updateStats();
  }

  startBattle() {
    if (this.state === 'BATTLE') return;
    this.saveSnapshot();
    this.state = 'BATTLE';
    this.winner = null;
    this.battleTimer = 0;

    // Play battle trumpet fanfare
    audio.playChargeHorn(true);
    if (Math.random() > 0.4) audio.playRoosterCrow();
  }

  togglePlayPause() {
    if (this.state === 'PLACEMENT') {
      this.startBattle();
    } else {
      this.isPaused = !this.isPaused;
    }
  }

  setTimeScale(scale) {
    this.timeScale = scale;
    this.isPaused = false;
  }

  possessUnit(unit) {
    if (this.possessedUnit) {
      this.possessedUnit.isPossessed = false;
    }
    this.possessedUnit = unit;
    unit.isPossessed = true;
    audio.playCluck(1.2);
  }

  unpossess() {
    if (this.possessedUnit) {
      this.possessedUnit.isPossessed = false;
      this.possessedUnit = null;
    }
  }

  togglePossessHovered() {
    if (this.possessedUnit) {
      this.unpossess();
      return;
    }
    const unit = this.findUnitAt(this.input.worldMouse, 35);
    if (unit) {
      this.possessUnit(unit);
    }
  }

  removeUnit(unit) {
    const idx = this.units.indexOf(unit);
    if (idx !== -1) {
      this.units.splice(idx, 1);
      this.updateStats();
    }
  }

  clearArmy(team = null) {
    if (team) {
      this.units = this.units.filter(u => u.team !== team);
    } else {
      this.units = [];
    }
    this.updateStats();
  }

  centerCameraOnArmy() {
    if (this.units.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.units.forEach(u => {
      minX = Math.min(minX, u.pos.x);
      maxX = Math.max(maxX, u.pos.x);
      minY = Math.min(minY, u.pos.y);
      maxY = Math.max(maxY, u.pos.y);
    });

    this.camera.x = (minX + maxX) / 2;
    this.camera.y = (minY + maxY) / 2;
    this.camera.targetX = this.camera.x;
    this.camera.targetY = this.camera.y;
    this.camera.zoom = 1.0;
  }

  update(rawDt) {
    // Camera smooth follow possessed unit
    if (this.possessedUnit && !this.possessedUnit.isDead) {
      this.camera.targetX = this.possessedUnit.pos.x;
      this.camera.targetY = this.possessedUnit.pos.y;
    }

    // Camera keyboard pan (WASD or Arrow Keys when not possessed)
    if (!this.possessedUnit && !this.input.isPanning) {
      const panSpeed = 600 * rawDt / this.camera.zoom;
      if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) this.camera.x -= panSpeed;
      if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) this.camera.x += panSpeed;
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) this.camera.y -= panSpeed;
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) this.camera.y += panSpeed;
      this.camera.targetX = this.camera.x;
      this.camera.targetY = this.camera.y;
    } else {
      // Smooth lerp to target
      this.camera.x += (this.camera.targetX - this.camera.x) * 0.15;
      this.camera.y += (this.camera.targetY - this.camera.y) * 0.15;
    }

    if (this.isPaused || this.state === 'PLACEMENT') {
      // Update particles even when paused for smooth UI feel
      this.particleSystem.update(rawDt);
      return;
    }

    const dt = Math.min(0.1, rawDt * this.timeScale);
    this.battleTimer += dt;

    // Living World scenario: delegate directly to CluckCore deterministic engine
    if (this.activeScenario?.id === 'grand_regiments' && this.coreWorld) {
      const Core = (typeof globalThis !== 'undefined' && globalThis.CluckCore) ? globalThis.CluckCore : CluckCore;
      if (Core) {
        Core.step(this.coreWorld, dt);
        this.syncUnitsFromCore();
        this.particleSystem.update(dt);
        this.checkBattleStatus();
        return;
      }
    }

    // 1. Rebuild Spatial Hash Grid
    this.spatialGrid.clear();
    for (let i = 0; i < this.units.length; i++) {
      if (!this.units[i].isDead) {
        this.spatialGrid.insert(this.units[i]);
      }
    }

    // 2. Update Units
    for (let i = 0; i < this.units.length; i++) {
      this.units[i].update(dt, this);
    }

    // 3. Update Projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.update(dt, this.spatialGrid, this.particleSystem, this);
      return !p.isDead;
    });

    // 4. Update Particle Systems
    this.particleSystem.update(dt);

    // 5. Update Stats & Check Win Condition
    this.checkBattleStatus();
  }

  spawnCrabHorde(count = 20) {
    audio.playRoar();
    for (let i = 0; i < count; i++) {
      const isNorth = i % 2 === 0;
      const x = 520 + (Math.random() - 0.5) * 280;
      const y = isNorth ? 120 + Math.random() * 80 : 680 + Math.random() * 80;
      const angle = isNorth ? Math.PI / 2 : -Math.PI / 2;
      const crab = new Unit('river_crab', x, y, 'crab', angle);
      this.units.push(crab);
      this.particleSystem.addFloatingText('🦀 CRAB INVASION!', x, y - 15, '#e05263');
    }
  }

  checkBattleStatus() {
    let chickenAlive = 0;
    let mouseAlive = 0;
    let crabAlive = 0;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.isDead && !u.isRouted) {
        if (u.team === 'chicken') chickenAlive++;
        else if (u.team === 'mouse') mouseAlive++;
        else if (u.team === 'crab') crabAlive++;
      }
    }

    this.stats.chickenAlive = chickenAlive;
    this.stats.mouseAlive = mouseAlive;
    this.stats.crabAlive = crabAlive;

    if (this.onStatsChange) {
      this.onStatsChange(this.stats);
    }

    // Check Victory (Endless mode never hard ends, and battle doesn't end while crabs are fighting)
    if (this.state === 'BATTLE' && !this.winner && this.battleTimer > 1.0) {
      if (this.activeScenario?.id === 'grand_regiments') {
        return; // Endless perpetual civilization mode runs continuously!
      }
      if (crabAlive > 0) {
        return; // Crabs are still active!
      }

      if (chickenAlive === 0 && mouseAlive === 0) {
        this.winner = 'draw';
        this.handleBattleEnd();
      } else if (chickenAlive === 0) {
        this.winner = 'mouse';
        audio.playVictory(false);
        this.handleBattleEnd();
      } else if (mouseAlive === 0) {
        this.winner = 'chicken';
        audio.playVictory(true);
        this.handleBattleEnd();
      }
    }
  }

  handleBattleEnd() {
    if (this.onBattleEnd) {
      this.onBattleEnd(this.winner, {
        duration: this.battleTimer,
        chickenAlive: this.stats.chickenAlive,
        mouseAlive: this.stats.mouseAlive
      });
    }
  }

  updateStats() {
    let chickens = 0;
    let mice = 0;
    for (const u of this.units) {
      if (!u.isDead) {
        if (u.team === 'chicken') chickens++;
        else mice++;
      }
    }
    this.stats.chickenInitial = chickens;
    this.stats.mouseInitial = mice;
    this.stats.chickenAlive = chickens;
    this.stats.mouseAlive = mice;

    if (this.onStatsChange) {
      this.onStatsChange(this.stats);
    }
  }
}

Game.VERSION = '1.0.0';
