/**
 * Cluck & Squeak - FigJam Browser Overlay Bundle
 * Engine Version: 1.0.0
 * 
 * NOTE: This is a client-side browser DOM canvas overlay for FigJam,
 * NOT a native Figma widget (which uses Figma's declarative JSX widget API).
 * For the native FigJam experience, use the figma-plugin/ native plugin.
 * 
 * Powered by CluckCore deterministic simulation engine.
 */
(() => {
  /* __BUNDLE_ENGINE_SETTINGS__ */
  /* __BUNDLE_ENGINE_CORE__ */

  // Singleton guard to stop prior loop
  if (typeof window !== 'undefined') {
    if (window.__CLUCK_SQUEAK_ANIM_ID__) {
      cancelAnimationFrame(window.__CLUCK_SQUEAK_ANIM_ID__);
      window.__CLUCK_SQUEAK_ANIM_ID__ = null;
    }
  }

  const RUN_INSTANCE_ID = Date.now() + Math.random();
  if (typeof window !== 'undefined') {
    window.__CLUCK_SQUEAK_CURRENT_INSTANCE__ = RUN_INSTANCE_ID;
  }

  const Core = typeof CluckCore !== 'undefined' ? CluckCore : (typeof globalThis !== 'undefined' ? globalThis.CluckCore : null);

  // Initialize Core World
  const coreWorld = Core ? Core.createWorld({
    seed: 42,
    bounds: {
      minX: 60,
      maxX: 1220,
      minY: 60,
      maxY: 660,
      corridorCenterY: 360,
      corridorTop: 200,
      corridorBottom: 520
    }
  }) : null;

  if (Core && coreWorld) {
    Core.applyCommand(coreWorld, {
      type: 'SETUP_BASES',
      bases: {
        chicken: { cx: 160, cy: 360, width: 440, height: 600 },
        mouse: { cx: 1120, cy: 360, width: 440, height: 600 }
      },
      resourceNodes: [
        { id: 'res_grain', type: 'grain', name: 'Prairie Grain Field', x: 460, y: 180, capacity: 500 },
        { id: 'res_cheese', type: 'cheese', name: 'Cheddar Quarry', x: 820, y: 540, capacity: 500 }
      ]
    });

    // Deploy standard formations
    const initialUnits = [];
    for (let i = 0; i < 12; i++) {
      initialUnits.push({
        id: 'c_' + i,
        name: (i === 0 ? 'General Cluck' : (i >= 8 ? 'Rooster Knight' : (i >= 4 ? 'Egg Lobber' : 'Comb Guard'))),
        team: 'chicken',
        x: 280 + (i % 3) * 32,
        y: 300 + Math.floor(i / 3) * 32,
        hp: 100, maxHp: 100, morale: 100, maxMorale: 100,
        isCaptain: i === 0,
        isCavalry: i >= 8,
        isRanged: i >= 4 && i < 8,
        isSpear: i < 4
      });
    }
    for (let i = 0; i < 12; i++) {
      initialUnits.push({
        id: 'm_' + i,
        name: (i === 0 ? 'General Squeak' : (i >= 8 ? 'Cheese Knight' : (i >= 4 ? 'Needle Sniper' : 'Spearmouse'))),
        team: 'mouse',
        x: 1000 - (i % 3) * 32,
        y: 300 + Math.floor(i / 3) * 32,
        hp: 100, maxHp: 100, morale: 100, maxMorale: 100,
        isCaptain: i === 0,
        isCavalry: i >= 8,
        isRanged: i >= 4 && i < 8,
        isSpear: i < 4
      });
    }

    Core.applyCommand(coreWorld, {
      type: 'DEPLOY_UNITS',
      units: initialUnits
    });
  }

  // Export overlay adapter facade
  const overlayAdapter = {
    version: Core ? Core.VERSION : '1.0.0',
    coreWorld,
    step: (dt) => { if (Core && coreWorld) Core.step(coreWorld, dt); },
    getSimulationHash: () => { return (Core && coreWorld) ? Core.hashWorld(coreWorld) : 0; },
    applyCommand: (cmd) => { if (Core && coreWorld) Core.applyCommand(coreWorld, cmd); }
  };

  if (typeof window !== 'undefined') {
    window.__CLUCK_SQUEAK_OVERLAY__ = overlayAdapter;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__CLUCK_SQUEAK_OVERLAY__ = overlayAdapter;
  }

  // DOM Container Setup (if running in a browser document)
  if (typeof document !== 'undefined' && document.createElement) {
    const WIDGET_ID = 'cluck-squeak-figjam-widget';
    const existing = document.getElementById(WIDGET_ID);
    if (existing) existing.remove();
    const existingPill = document.getElementById('cluck-squeak-min-pill');
    if (existingPill) existingPill.remove();

    const container = document.createElement('div');
    container.id = WIDGET_ID;
    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      width: min(850px, calc(100vw - 32px));
      height: min(480px, calc(100vh - 40px));
      max-height: calc(100vh - 32px);
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(20px);
      border: 1.5px solid #d0d5dd;
      border-radius: 16px;
      box-shadow: 0 24px 48px -4px rgba(16, 24, 40, 0.35);
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: Inter, system-ui, sans-serif;
      font-size: 12px;
      color: #101828;
    `;

    container.innerHTML = `
      <div id="cs-header" style="height: 52px; background: #ffffff; border-bottom: 1px solid #eaecf0; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; cursor: grab;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 22px;">🐔🏰🦀🐭</span>
          <div>
            <div style="font-weight: 800; font-size: 13.5px; color: #101828;">Cluck & Squeak: Browser Living World</div>
            <div style="font-size: 9.5px; font-weight: 600; color: #12b76a; text-transform: uppercase;">Browser Overlay Adapter • v1.0.0</div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 3px; width: 280px;">
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700;">
            <span style="color: #f04438;">🐔 Dominion: <b id="cs-chicken-pop">0</b></span>
            <span style="color: #475467;" id="cs-territory-status">🛡️ Campaign: MUSTER</span>
            <span style="color: #0ba5ec;"><b id="cs-mouse-pop">0</b> :Kingdom 🐭</span>
          </div>
          <div style="height: 8px; background: #eaecf0; border-radius: 99px; display: flex; overflow: hidden;">
            <div id="cs-bar-chicken" style="width: 50%; background: #f04438; transition: width 0.3s ease;"></div>
            <div id="cs-bar-crab" style="width: 0%; background: #e05263; transition: width 0.3s ease;"></div>
            <div id="cs-bar-mouse" style="width: 50%; background: #0ba5ec; transition: width 0.3s ease;"></div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="cs-btn-crabs" style="background: #fff0f1; border: 1.5px solid #ff4d4f; color: #cf1322; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">🦀 Crabs</button>
          <button id="cs-btn-min" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #667085;">—</button>
          <button id="cs-btn-close" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #667085;">✕</button>
        </div>
      </div>
      <div style="flex: 1; position: relative; background: #f8f9fa; overflow: hidden;">
        <canvas id="cs-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
        <div id="cs-regiment-banner" style="position: absolute; top: 12px; left: 16px; background: rgba(255, 255, 255, 0.94); border: 1px solid #d0d5dd; border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 600; color: #344054;">
          🎺 Living World running on CluckCore deterministic engine.
        </div>
        <div style="position: absolute; bottom: 12px; right: 16px; width: 140px; height: 50px; background: rgba(255, 255, 255, 0.92); border: 1px solid #d0d5dd; border-radius: 6px; overflow: hidden;">
          <canvas id="cs-minimap" style="width: 100%; height: 100%; display: block;"></canvas>
        </div>
      </div>
      <div style="height: 50px; background: #ffffff; border-top: 1px solid #eaecf0; padding: 0 16px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="cs-btn-play" style="background: #12b76a; color: #ffffff; border: none; border-radius: 6px; padding: 8px 16px; font-weight: 700; font-size: 12px; cursor: pointer;">⏸ PAUSE WAR</button>
          <button id="cs-btn-raid-mode" style="background: #ffffff; border: 1px solid #d0d5dd; border-radius: 6px; padding: 6px 12px; font-weight: 600; font-size: 11.5px; cursor: pointer;">⚔️ Order Raid</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    let isRunning = true;
    const btnPlay = document.getElementById('cs-btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        isRunning = !isRunning;
        btnPlay.textContent = isRunning ? '⏸ PAUSE WAR' : '▶ RESUME WAR';
        btnPlay.style.background = isRunning ? '#12b76a' : '#f04438';
      });
    }

    const btnRaid = document.getElementById('cs-btn-raid-mode');
    if (btnRaid && Core && coreWorld) {
      btnRaid.addEventListener('click', () => {
        Core.applyCommand(coreWorld, { type: 'ORDER_RAID' });
      });
    }

    const btnCrabs = document.getElementById('cs-btn-crabs');
    if (btnCrabs && Core && coreWorld) {
      btnCrabs.addEventListener('click', () => {
        Core.scheduleEvent(coreWorld, 0, 'CRAB_HORDE');
      });
    }

    const btnClose = document.getElementById('cs-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        container.remove();
      });
    }

    // Render loop
    const canvas = document.getElementById('cs-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const minimapCanvas = document.getElementById('cs-minimap');
    const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    let lastTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    function loop(now) {
      if (window.__CLUCK_SQUEAK_CURRENT_INSTANCE__ !== RUN_INSTANCE_ID) return;
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.1, rawDt);

      if (isRunning && Core && coreWorld) {
        Core.step(coreWorld, dt);
      }

      // Update counters
      if (coreWorld) {
        const chickens = coreWorld.units.filter(u => u.team === 'chicken' && !u.isDead).length;
        const mice = coreWorld.units.filter(u => u.team === 'mouse' && !u.isDead).length;
        const crabs = coreWorld.units.filter(u => u.team === 'crab' && !u.isDead).length;
        const total = chickens + mice + crabs || 1;

        const elC = document.getElementById('cs-chicken-pop');
        const elM = document.getElementById('cs-mouse-pop');
        const barC = document.getElementById('cs-bar-chicken');
        const barCrab = document.getElementById('cs-bar-crab');
        const barM = document.getElementById('cs-bar-mouse');
        const elStatus = document.getElementById('cs-territory-status');

        if (elC) elC.textContent = chickens;
        if (elM) elM.textContent = mice;
        if (barC) barC.style.width = `${(chickens / total) * 100}%`;
        if (barCrab) barCrab.style.width = `${(crabs / total) * 100}%`;
        if (barM) barM.style.width = `${(mice / total) * 100}%`;
        if (elStatus && Core.calculateCampaignPhase) {
          elStatus.textContent = `Campaign: ${Core.calculateCampaignPhase(coreWorld)}`;
        }
      }

      // Draw Main Canvas
      if (ctx && canvas && coreWorld) {
        if (canvas.width !== canvas.clientWidth) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
        }
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw bases
        if (coreWorld.bases) {
          if (coreWorld.bases.chicken) {
            ctx.fillStyle = '#fee4e2';
            ctx.strokeStyle = '#f04438';
            ctx.strokeRect(coreWorld.bases.chicken.cx - 50, coreWorld.bases.chicken.cy - 50, 100, 100);
            ctx.font = '24px sans-serif';
            ctx.fillText('🐔🏰', coreWorld.bases.chicken.cx - 24, coreWorld.bases.chicken.cy + 8);
          }
          if (coreWorld.bases.mouse) {
            ctx.fillStyle = '#e0f2fe';
            ctx.strokeStyle = '#0ba5ec';
            ctx.strokeRect(coreWorld.bases.mouse.cx - 50, coreWorld.bases.mouse.cy - 50, 100, 100);
            ctx.font = '24px sans-serif';
            ctx.fillText('🐭🏰', coreWorld.bases.mouse.cx - 24, coreWorld.bases.mouse.cy + 8);
          }
        }

        // Draw units
        for (let i = 0; i < coreWorld.units.length; i++) {
          const u = coreWorld.units[i];
          if (u.isDead) continue;
          ctx.font = u.isCaptain ? '18px sans-serif' : '14px sans-serif';
          const icon = u.team === 'chicken' ? '🐔' : (u.team === 'mouse' ? '🐭' : '🦀');
          ctx.fillText(icon, u.x - 7, u.y + 7);
        }
      }

      // Draw Minimap
      if (minimapCtx && minimapCanvas && coreWorld) {
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        const sx = minimapCanvas.width / 1300;
        const sy = minimapCanvas.height / 750;

        for (let i = 0; i < coreWorld.units.length; i++) {
          const u = coreWorld.units[i];
          if (u.isDead) continue;
          minimapCtx.fillStyle = u.team === 'chicken' ? '#f04438' : (u.team === 'mouse' ? '#0ba5ec' : '#e05263');
          minimapCtx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
        }
      }

      window.__CLUCK_SQUEAK_ANIM_ID__ = requestAnimationFrame(loop);
    }

    window.__CLUCK_SQUEAK_ANIM_ID__ = requestAnimationFrame(loop);
  }
})();
