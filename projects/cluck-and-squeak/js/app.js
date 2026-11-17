/**
 * App Controller and UI Wiring for Cluck & Squeak Battle Simulator
 */

import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { SCENARIOS } from './scenarios.js';
import { UNIT_CONFIGS } from './unit.js';
import { audio } from './audio.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('battle-canvas');
  const game = new Game(canvas);
  const renderer = new Renderer(canvas);

  // Resize canvas dynamically
  window.addEventListener('resize', () => {
    renderer.resize();
  });

  // --- UI Elements ---
  const scenarioSelect = document.getElementById('scenario-select');
  const playBtn = document.getElementById('btn-play');
  const resetBtn = document.getElementById('btn-reset');
  const clearBtn = document.getElementById('btn-clear');
  const possessBtn = document.getElementById('btn-possess');
  const speedBtns = document.querySelectorAll('.speed-btn');
  const themeSelect = document.getElementById('theme-select');
  const audioToggle = document.getElementById('audio-toggle');
  const chickenCountEl = document.getElementById('chicken-count');
  const mouseCountEl = document.getElementById('mouse-count');
  const chickenBar = document.getElementById('chicken-bar');
  const mouseBar = document.getElementById('mouse-bar');
  const placementPanel = document.getElementById('placement-panel');
  const possessionHud = document.getElementById('possession-hud');
  const victoryModal = document.getElementById('victory-modal');
  const victoryTitle = document.getElementById('victory-title');
  const victorySub = document.getElementById('victory-sub');
  const btnVictoryReset = document.getElementById('btn-victory-reset');
  const btnVictoryEdit = document.getElementById('btn-victory-edit');
  const guideBtn = document.getElementById('btn-guide');
  const guideModal = document.getElementById('guide-modal');
  const guideClose = document.getElementById('btn-guide-close');

  if (guideBtn && guideModal && guideClose) {
    guideBtn.addEventListener('click', () => {
      guideModal.classList.remove('hidden');
    });
    guideClose.addEventListener('click', () => {
      guideModal.classList.add('hidden');
    });
  }

  // Populate Scenario Dropdown
  SCENARIOS.forEach(sc => {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = sc.name;
    scenarioSelect.appendChild(opt);
  });

  scenarioSelect.addEventListener('change', (e) => {
    game.loadScenario(e.target.value);
    updateUIState();
  });

  // Play / Pause Button
  playBtn.addEventListener('click', () => {
    audio.ensureContext();
    if (game.state === 'PLACEMENT') {
      game.startBattle();
    } else {
      game.isPaused = !game.isPaused;
    }
    updateUIState();
  });

  // Reset Button
  resetBtn.addEventListener('click', () => {
    game.restartBattle();
    victoryModal.classList.add('hidden');
    updateUIState();
  });

  // Clear Button
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all units on battlefield?')) {
      game.clearArmy();
      updateUIState();
    }
  });

  // Crab Horde Button
  const crabHordeBtn = document.getElementById('btn-crab-horde');
  if (crabHordeBtn) {
    crabHordeBtn.addEventListener('click', () => {
      audio.ensureContext();
      game.spawnCrabHorde(20);
    });
  }

  // Possess Button
  possessBtn.addEventListener('click', () => {
    if (game.possessedUnit) {
      game.unpossess();
    } else {
      // Possess first living chicken or mouse
      const living = game.units.find(u => !u.isDead);
      if (living) {
        game.possessUnit(living);
      }
    }
    updateUIState();
  });

  // Speed Buttons
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const speed = parseFloat(btn.dataset.speed);
      game.setTimeScale(speed);
    });
  });

  // Theme Select
  themeSelect.addEventListener('change', (e) => {
    renderer.setTheme(e.target.value);
  });

  // Audio Toggle
  audioToggle.addEventListener('click', () => {
    const isEnabled = audio.toggleMute();
    audioToggle.textContent = isEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
    audioToggle.classList.toggle('muted', !isEnabled);
  });

  // --- Unit Palette Setup ---
  const teamTabs = document.querySelectorAll('.team-tab');
  const unitListEl = document.getElementById('unit-list');
  const formationBtns = document.querySelectorAll('.formation-btn');
  const countSlider = document.getElementById('squad-count-slider');
  const countVal = document.getElementById('squad-count-val');

  let currentPaletteTeam = 'chicken';

  function renderUnitList() {
    unitListEl.innerHTML = '';
    const units = Object.entries(UNIT_CONFIGS).filter(([k, v]) => v.team === currentPaletteTeam);

    units.forEach(([key, config], idx) => {
      const card = document.createElement('div');
      card.className = `unit-card ${game.placementTool.activeType === key ? 'active' : ''}`;
      card.innerHTML = `
        <span class="unit-icon">${config.icon}</span>
        <div class="unit-info">
          <div class="unit-name">${config.name}</div>
          <div class="unit-meta">${config.category.toUpperCase()} • HP: ${config.hp} • DMG: ${config.damage}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        game.placementTool.activeType = key;
        game.placementTool.activeTeam = config.team;
      });
      unitListEl.appendChild(card);

      if (idx === 0 && game.placementTool.activeTeam !== currentPaletteTeam) {
        card.click();
      }
    });
  }

  teamTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      teamTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPaletteTeam = tab.dataset.team;
      renderUnitList();
    });
  });

  formationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formationBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      game.placementTool.formation = btn.dataset.formation;
    });
  });

  countSlider.addEventListener('input', (e) => {
    countVal.textContent = e.target.value;
    game.placementTool.count = parseInt(e.target.value, 10);
  });

  // Stats Callback
  game.onStatsChange = (stats) => {
    chickenCountEl.textContent = stats.chickenAlive;
    mouseCountEl.textContent = stats.mouseAlive;

    const total = (stats.chickenAlive + stats.mouseAlive) || 1;
    const chickenPct = (stats.chickenAlive / total) * 100;
    const mousePct = (stats.mouseAlive / total) * 100;

    chickenBar.style.width = `${chickenPct}%`;
    mouseBar.style.width = `${mousePct}%`;
  };

  // Victory End Callback
  game.onBattleEnd = (winner, stats) => {
    victoryModal.classList.remove('hidden');
    if (winner === 'chicken') {
      victoryTitle.innerHTML = '🐔 THE FEATHERY HORDE WINS!';
      victoryTitle.style.color = '#ff4d4f';
      victorySub.textContent = `The chickens ruled the roost in ${stats.duration.toFixed(1)}s! (${stats.chickenAlive} surviving chickens)`;
    } else if (winner === 'mouse') {
      victoryTitle.innerHTML = '🐭 THE WHISKER LEGION WINS!';
      victoryTitle.style.color = '#1890ff';
      victorySub.textContent = `The mice secured the cheddar in ${stats.duration.toFixed(1)}s! (${stats.mouseAlive} surviving mice)`;
    } else {
      victoryTitle.innerHTML = '⚖️ MUTUAL DESTRUCTION!';
      victoryTitle.style.color = '#faad14';
      victorySub.textContent = 'Both sides fought bravely to the bitter end!';
    }
  };

  btnVictoryReset.addEventListener('click', () => {
    victoryModal.classList.add('hidden');
    game.restartBattle();
    game.startBattle();
    updateUIState();
  });

  btnVictoryEdit.addEventListener('click', () => {
    victoryModal.classList.add('hidden');
    game.restartBattle();
    updateUIState();
  });

  function updateUIState() {
    if (game.state === 'PLACEMENT') {
      playBtn.innerHTML = '⚔️ START BATTLE';
      playBtn.className = 'btn btn-primary';
      placementPanel.classList.remove('hidden');
    } else {
      placementPanel.classList.add('hidden');
      if (game.isPaused) {
        playBtn.innerHTML = '▶ RESUME';
        playBtn.className = 'btn btn-warning';
      } else {
        playBtn.innerHTML = '⏸ PAUSE';
        playBtn.className = 'btn btn-secondary';
      }
    }

    // Possession HUD
    if (game.possessedUnit && !game.possessedUnit.isDead) {
      possessionHud.classList.remove('hidden');
      possessBtn.textContent = 'Exit Possession (Esc)';
      possessBtn.classList.add('active');
    } else {
      possessionHud.classList.add('hidden');
      possessBtn.textContent = '🎮 Possess Unit (F)';
      possessBtn.classList.remove('active');
    }
  }

  // Initial render setup
  renderUnitList();
  updateUIState();

  // --- Main Game Loop ---
  let lastTime = performance.now();
  function gameLoop(now) {
    const rawDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    game.update(rawDt);
    renderer.render(game);
    updateUIState();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
