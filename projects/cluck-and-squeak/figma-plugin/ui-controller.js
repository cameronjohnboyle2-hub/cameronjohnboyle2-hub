/**
     * ============================================================================
     * CLUCK & SQUEAK: PERPETUAL CIVILIZATION & ENDLESS WAR ENGINE (UI BACKEND)
     * ============================================================================
     * Architecture: Plugin UI Iframe Thread
     * File: figma-plugin/ui.html
     *
     * OVERVIEW:
     * This file hosts both the user interface and the core 20 FPS simulation engine
     * for the perpetual FigJam civilization war. It contains the complete physics,
     * tactical AI, formations, ballistics, diplomacy, and procedural audio systems.
     *
     * CORE SUBSYSTEMS & STATE MACHINES:
     * 1. REGIMENT FORMATION SYSTEM (class Regiment):
     *    - States: ASSEMBLING -> LOCKSTEP_MARCH -> ENGAGING -> HOLDING_LINE -> MERGED / BROKEN
     *    - Formations: Wedge (Cavalry shock), Box Phalanx (Spear / Infantry wall), Line (Skirmishers)
     *    - Captain Leadership: Captains steer directly toward enemy base coordinates to eliminate
     *      lateral drift. Captains have pushing immunity from allied troops.
     *
     * 2. REALISTIC TACTICAL DOCTRINES:
     *    - Stand & Fight: Soldiers never turn their backs to run mid-skirmish.
     *    - Post-Skirmish Casualty Decision:
     *      * Heavy Losses (>= 1/3 casualties or <= 4 units): Squad halts and locks into HOLDING_LINE.
     *        They hold the conquered forward ground, brace spearmen, receive field triage (+6 HP/s),
     *        and wait for oncoming allied reinforcements to merge with them!
     *      * Light Losses (< 1/3 casualties): Squad maintains full momentum in LOCKSTEP_MARCH.
     *    - Discretionary Pursuit: Soldiers ignore fleeing routers unless they possess a clear
     *      tactical advantage (3+ allies and no standing threats, or healthy cavalry).
     *    - Veteran Reinforcement Merging: Survivors merge seamlessly into the rear ranks of
     *      oncoming friendly waves, gaining +20% veteran damage and morale recovery.
     *
     * 3. COMBINED ARMS, BALLISTICS & DEFENSIVE COUNTERS:
     *    - Spear Bracing: Charging cavalry impale themselves on braced spearmen (85 dmg, 1.8s stun).
     *    - Shield Wall: Blocks 70% missile damage and reduces melee damage by 60%.
     *    - Parabolic Ballistics: Projectiles travel with true parabolic arcs: z(t) = 4*h*t*(1-t).
     *    - Flank & Rear Multipliers: Rear strikes inflict 1.65x damage and instant morale shock.
     *
     * 4. CANVAS GEOGRAPHY & HIGHWAY CORRIDORS:
     *    - Connectors and lines grant +70% march velocity as paved roads.
     *    - Obstacles are navigated via smooth lateral steering without snagging.
     *
     * 5. CIVILIZATION ECONOMY & LOGISTICS:
     *    - Passive estate income (+1 Grain/s, +1 Cheese/s).
     *    - Worker Harvesters cycle between neutral resource patches and bases with dynamic virtual fallbacks.
     *    - Intercepted couriers hold their cargo while fleeing to safety.
     *
     * 6. DIPLOMACY, TRUCES & TECH ERAS:
     *    - Auto-Truce: Triggers a 25s ceasefire when casualties reach >= 65%.
     *    - Peace Treaty Benefits: Units heal (+8 HP/s) and harvest yield increases by +40%.
     *    - Tech Eras: Era I (Tribal) -> Era II (Feudal) -> Era III (Imperial Siege Engines).
     *
     * 7. EVENT MECHANICS & BALANCE:
     *    - Grand Crusade Relief: 3-minute grace period, 5-minute cooldown, 6 Royal Templars (+15% stats).
     *      Only triggers in true existential crises (defenders <= 6 vs enemies >= 24).
     *    - The Great Crab Invasion: 16 River Crabs invade, uniting Chickens and Mice in mutual defense.
     * ============================================================================
     */

    const finiteBattle = typeof classroomHooks !== "undefined";

    // Audio synthesizer (Sound defaults to OFF as a personal preference)
    let isSoundEnabled = false;
    let audioCtx = null;
    function initAudio() {
      if (!isSoundEnabled || audioCtx) return;
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (AudioClass) {
          audioCtx = new AudioClass();
        }
      } catch (e) {}
    }
    function playTone(freq, duration, type = 'sine', gainVal = 0.15) {
      if (!isSoundEnabled || !audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration + 0.05);
    }
    function playChargeHorn() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(330, 0.12, 'sawtooth');
      setTimeout(() => playTone(440, 0.12, 'sawtooth'), 110);
      setTimeout(() => playTone(550, 0.28, 'sawtooth'), 220);
    }
    function playImpactThud(vol = 0.8) {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(150, 0.16, 'triangle', vol * 0.25);
    }

    function playCrabAlarm() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(180, 0.15, 'sawtooth', 0.25);
      setTimeout(() => playTone(140, 0.2, 'sawtooth', 0.25), 140);
    }

    function playBowTwang() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(540, 0.08, 'sawtooth', 0.12);
    }
    function playArrowHit() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(280, 0.07, 'triangle', 0.18);
    }
    function playHarvestChime() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(740, 0.12, 'sine', 0.12);
    }
    function playPeaceFlute() {
      if (!isSoundEnabled) return;
      initAudio();
      playTone(440, 0.28, 'sine', 0.16);
      setTimeout(() => playTone(554.37, 0.32, 'sine', 0.14), 220);
      setTimeout(() => playTone(659.25, 0.45, 'sine', 0.12), 440);
    }

    function getUnitMaxMorale(team, isCaptain, isCavalry, isSpear, isCrab, isCrusading = false) {
      if (isCrab) return 300;
      let morale = 125; // Raised so soldiers hold the line stubbornly and don't panic from light hits
      if (isCaptain) morale = 180;
      else if (isCavalry) morale = 150;
      else if (isSpear) morale = 140;
      if (isCrusading) morale += 20;
      return morale;
    }

function getUnitMaxHp(team, isCaptain, isCavalry, isSpear, isCrab, isCrusading = false) {
      let hp = 100;
      if (isCrab) hp = 240;
      else if (team === "chicken") {
        if (isCaptain) hp = 360;
        else if (isCavalry) hp = 200;
        else if (isSpear) hp = 135;
        else hp = 125;
      } else {
        if (isCaptain) hp = 320;
        else if (isCavalry) hp = 175;
        else if (isSpear) hp = 110;
        else hp = 95;
      }
      if (isCrusading) hp = Math.round(hp * 1.15);
      return hp;
    }

    // ----------------------------------------------------
    // REGIMENT FORMATION CLASS
    // ----------------------------------------------------
    /**
     * Represents an organized tactical military unit (e.g. Royal Lancers, Iron Spearmice).
     * Manages cohesion, formation slot offsets relative to captain, tactical state machine,
     * post-skirmish line-holding, and reinforcement merging.
     */
    class Regiment {
      constructor(team, name, formationType, captain = null, musterX = 0, musterY = 0) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.team = team;
        this.name = name;
        this.formationType = formationType; // 'wedge' (cavalry), 'phalanx' (box infantry/spears), 'line' (skirmishers)
        this.state = 'LOCKSTEP_MARCH'; // 'ASSEMBLING' | 'LOCKSTEP_MARCH' | 'ENGAGING' | 'HOLDING_LINE' | 'MERGED' | 'BROKEN'
        this.targetSize = formationType === 'wedge' ? 14 : 16;
        this.initialSize = this.targetSize;
        this.units = [];
        this.captain = captain;
        this.musterX = musterX;
        this.musterY = musterY;
        this.isCrusading = false;
        this.holdTimer = 0;
      }

      /**
       * Slots a new soldier into the regiment's geometric formation offsets.
       * Wedge: Triangular tiers spreading out behind the point captain.
       * Phalanx: Compact rectangular grid ranks with frontline spear hedge.
       */
      addUnit(u, forwardDir, perpDir) {
        this.units.push(u);
        u.regiment = this;
        if (this.isCrusading) {
          u.isCrusading = true;
          u.speedMultiplier = 1.15;
        }
        const idx = this.units.length - 1;

        const marchSign = this.team === 'chicken' ? 1 : -1;
        const dirX = forwardDir ? forwardDir.x : marchSign;
        const dirY = forwardDir ? forwardDir.y : 0;
        const pX = perpDir ? perpDir.x : 0;
        const pY = perpDir ? perpDir.y : 1;

        let fwd = 0, side = 0;
        if (this.formationType === 'wedge') {
          if (idx > 0) {
            const tier = Math.ceil(idx / 2);
            const sideSign = idx % 2 === 1 ? -1 : 1;
            fwd = -tier * 32;
            side = sideSign * tier * 22;
          }
        } else {
          if (idx === 0) {
            fwd = 20; side = 0;
          } else {
            const r = Math.floor((idx - 1) / 4);
            const c = (idx - 1) % 4;
            fwd = -r * 30;
            side = (c - 1.5) * 32;
          }
        }

        const mX = this.musterX || u.x;
        const mY = this.musterY || u.y;
        u.slotX = mX + (dirX * marchSign * fwd + pX * side);
        u.slotY = mY + (dirY * marchSign * fwd + pY * side);
        u.formationOffsetX = dirX * marchSign * fwd + pX * side;
        u.formationOffsetY = dirY * marchSign * fwd + pY * side;

        if (!this.captain && (u.isCaptain || idx === 0)) {
          this.captain = u;
          u.isCaptain = true;
        }
      }

      dispatch() {
        if (this.state !== 'ASSEMBLING') return;
        this.state = 'LOCKSTEP_MARCH';
        this.initialSize = this.units.length; // Lock initial deployment strength
        if (!this.captain && this.units.length > 0) {
          this.captain = this.units[0];
          this.captain.isCaptain = true;
        }
        if (this.captain) {
          this.units.forEach(u => {
            u.formationOffsetX = (u.slotX !== undefined ? u.slotX : u.x) - this.captain.x;
            u.formationOffsetY = (u.slotY !== undefined ? u.slotY : u.y) - this.captain.y;
          });
        }
        playChargeHorn();
      }

      update(dt, forwardDir, perpDir) {
        if (this.state === 'ASSEMBLING' || this.state === 'MERGED' || this.state === 'BROKEN') return;

        const living = this.units.filter(u => !u.isDead);
        if (living.length === 0) {
          this.state = 'BROKEN';
          return;
        }

        // Maintain accurate initial size tracker
        if (!this.initialSize || living.length > this.initialSize) {
          this.initialSize = Math.max(living.length, this.targetSize || 14);
        }

        // If captain died, elect next living soldier as captain
        if (!this.captain || this.captain.isDead) {
          this.captain = living[0];
          this.captain.isCaptain = true;
          living.forEach(u => {
            u.formationOffsetX = u.x - this.captain.x;
            u.formationOffsetY = u.y - this.captain.y;
          });
        }

        const marchSign = this.team === 'chicken' ? 1 : -1;

        // Calculate center of living regiment members
        let regCx = 0, regCy = 0;
        for (let k = 0; k < living.length; k++) {
          regCx += living[k].x;
          regCy += living[k].y;
        }
        regCx /= living.length;
        regCy /= living.length;

        if (this.state === 'LOCKSTEP_MARCH') {
          // Check distance to enemy units or enemy citadel
          let minEDist = Infinity;
          for (let j = 0; j < battleUnits.length; j++) {
            const other = battleUnits[j];
            if (other.isDead) continue;
            if (other.team !== this.team) {
              const d = Math.hypot(other.x - this.captain.x, other.y - this.captain.y);
              if (d < minEDist) minEDist = d;
            }
          }

          let distEnemyBase = Infinity;
          let targetBaseX = this.team === 'chicken' ? 3400 : 200;
          let targetBaseY = 1000;
          if (liveBases) {
            const eBase = this.team === 'chicken' ? liveBases.mouse : liveBases.chicken;
            if (eBase) {
              targetBaseX = eBase.cx;
              targetBaseY = eBase.cy;
              distEnemyBase = Math.hypot(eBase.cx - this.captain.x, eBase.cy - this.captain.y);
            }
          }

          if (finiteBattle && this.advancePoint) {
            targetBaseX = this.advancePoint.x;
            targetBaseY = this.advancePoint.y;
            distEnemyBase = Infinity;
          }

          // Steer directly toward enemy citadel
          const toBaseDx = targetBaseX - this.captain.x;
          const toBaseDy = targetBaseY - this.captain.y;
          const toBaseDist = Math.hypot(toBaseDx, toBaseDy) || 1;
          const marchDirX = toBaseDx / toBaseDist;
          const marchDirY = toBaseDy / toBaseDist;

          // Adaptive march velocity: cruise at high speed across wide open canvas!
          let marchSpeed = 24;
          if (minEDist > 850) {
            marchSpeed = 68; // Rapid open-field cruising across long FigJam distances
          } else if (minEDist > 400) {
            marchSpeed = 38; // Tactical approach speed
          }
          if (this.isCrusading) marchSpeed *= 1.15;

          // Captain leads the march directly toward enemy citadel without lateral jitter
          this.captain.vx = (this.captain.vx * 0.65) + (marchDirX * marchSpeed * dt * 2.2 * 0.35);
          this.captain.vy = (this.captain.vy * 0.65) + (marchDirY * marchSpeed * dt * 2.2 * 0.35);

          // Living soldiers follow captain in lockstep
          living.forEach(u => {
            if (u === this.captain) return;
            if (finiteBattle && u.isRouted) return;
            u.isRouted = false; // Disciplined soldiers marching with their captain do not panic

            const targetX = this.captain.x + (u.formationOffsetX || 0);
            const targetY = this.captain.y + (u.formationOffsetY || 0);

            const dx = targetX - u.x;
            const dy = targetY - u.y;

            // March-axis displacement: if ahead of slot, NEVER pull them backward!
            const fwdDisplacement = dx * marchDirX + dy * marchDirY;
            if (finiteBattle) {
              u.vx = this.captain.vx + dx * .16;
              u.vy = this.captain.vy + dy * .16;
            } else if (fwdDisplacement < -8) {
              u.vx *= 0.88;
              u.vy *= 0.88;
            } else {
              const distToSlot = Math.hypot(dx, dy);
              if (distToSlot > 0) {
                const pull = Math.min(22.0, distToSlot * 0.12);
                u.vx += (dx / distToSlot) * pull;
                u.vy += (dy / distToSlot) * pull;
              }
            }

            // In formation march, soldiers face forward in the march direction
            u.facingX = marchDirX;
            u.facingY = marchDirY;
          });

          // Check if we reached an allied squad holding the forward line
          for (let r = 0; r < activeRegiments.length; r++) {
            const otherR = activeRegiments[r];
            if (otherR === this || otherR.team !== this.team || otherR.state !== 'HOLDING_LINE') continue;
            const oLead = otherR.captain || otherR.units.find(u => !u.isDead);
            if (oLead) {
              const dToHold = Math.hypot(oLead.x - this.captain.x, oLead.y - this.captain.y);
              if (dToHold < 220) {
                // REINFORCEMENTS ARRIVED AT THE FORWARD POSITION!
                // Merge veterans into this advancing regiment and push the frontline forward together!
                const vLiving = otherR.units.filter(u => !u.isDead);
                const vCount = vLiving.length;
                const startIndex = this.units.length;
                vLiving.forEach((u, vIdx) => {
                  u.regiment = this;
                  this.units.push(u);
                  u.isHoldingLine = false;
                  u.isVeteran = true;
                  u.morale = u.maxMorale;
                  u.hp = Math.min(u.maxHp, u.hp + 35); // Field aid
                  u.speedMultiplier = 1.0;
                  if (!u.name.includes('Veteran')) u.name = 'Veteran ' + u.name;

                  // Structured non-overlapping placement in formation ranks behind the vanguard
                  const slotIdx = startIndex + vIdx;
                  let fwd = 0, side = 0;
                  if (this.formationType === 'wedge') {
                    const tier = Math.ceil(slotIdx / 2);
                    const sideSign = slotIdx % 2 === 1 ? -1 : 1;
                    fwd = -tier * 32;
                    side = sideSign * tier * 24;
                  } else {
                    const row = Math.floor(slotIdx / 4);
                    const col = slotIdx % 4;
                    fwd = -row * 32;
                    side = (col - 1.5) * 34;
                  }
                  const marchSign = this.team === 'chicken' ? 1 : -1;
                  u.formationOffsetX = fwd * marchSign;
                  u.formationOffsetY = side;
                  u.vx = this.captain.vx;
                  u.vy = this.captain.vy;
                });
                otherR.state = 'MERGED';
                playChargeHorn();
                dispatchBanner.textContent = `📯⚡ REINFORCEMENTS ARRIVED! ${vCount} veterans joined ${this.name} on the front line! PUSHING FORWARD!`;
                break;
              }
            }
          }

          if (minEDist < 280 || distEnemyBase < 280 || (finiteBattle && toBaseDist < 20)) {
            this.state = 'ENGAGING';
            living.forEach(u => {
              if (u.isCavalry) u.isCharging = true;
            });
          }
        } else if (this.state === 'ENGAGING') {
          // Classroom regiments keep fighting after first contact. No hold or reformation.
          if (finiteBattle) return;
          // Count active enemies within tactical combat radius
          let enemiesNearby = 0;
          let closestEnemyDist = Infinity;
          for (let j = 0; j < battleUnits.length; j++) {
            const other = battleUnits[j];
            if (other.isDead) continue;
            if (other.team !== this.team) {
              const d = Math.hypot(other.x - regCx, other.y - regCy);
              if (d < 360) enemiesNearby++;
              if (d < closestEnemyDist) closestEnemyDist = d;
            }
          }

          // In melee combat, soldiers STAND AND FIGHT face-to-face!
          // They do NOT turn their backs and run mid-fight.
          living.forEach(u => {
            u.isHoldingLine = false;
            u.isFallingBack = false;
            u.isRouted = false;
          });

          // POST-SKIRMISH: When all immediate enemies are defeated (no enemies within 360px):
          if (enemiesNearby === 0 && closestEnemyDist > 360) {
            const lostThirdOrMore = living.length <= Math.floor(this.initialSize * 0.67) || living.length <= 4;

            if (lostThirdOrMore) {
              // Battered from the skirmish (lost 1/3+ of squad):
              // STOP AND HOLD THE FORWARD GROUND in defensive position, awaiting reinforcements!
              this.state = 'HOLDING_LINE';
              this.holdTimer = 0;
              playTone(440, 0.22, 'triangle');
              dispatchBanner.textContent = `🛡️ GROUND SECURED! ${this.name} (${living.length}/${this.initialSize} left) holds defensive line, awaiting reinforcements!`;

              living.forEach(u => {
                u.isHoldingLine = true;
                u.isRouted = false;
                u.isCharging = false;
                u.morale = u.maxMorale; // Morale boosted by victory
                // Face forward toward enemy territory
                u.facingX = forwardDir ? (forwardDir.x * marchSign) : marchSign;
                u.facingY = forwardDir ? (forwardDir.y * marchSign) : 0;
                // Spearmen immediately brace
                if (u.isSpear) u.isBraced = true;
              });
              return;
            } else {
              // Decisive victory with light casualties (< 1/3 lost):
              // KEEP PRESSING FORWARD WITH FULL MOMENTUM!
              this.state = 'LOCKSTEP_MARCH';
              dispatchBanner.textContent = `⚔️ DECISIVE VICTORY! ${this.name} (${living.length}/${this.initialSize} strong) keeps pressing forward into enemy territory!`;
              living.forEach(u => {
                u.isHoldingLine = false;
                u.isRouted = false;
                u.morale = u.maxMorale;
                if (u.isCavalry && Math.random() < 0.5) u.isCharging = true;
              });
            }
          }
        } else if (this.state === 'HOLDING_LINE') {
          this.holdTimer = (this.holdTimer || 0) + dt;

          // Check if enemies approach our defensive position
          let enemiesNearby = 0;
          let closestEnemyDist = Infinity;
          for (let j = 0; j < battleUnits.length; j++) {
            const other = battleUnits[j];
            if (other.isDead) continue;
            if (other.team !== this.team) {
              const d = Math.hypot(other.x - regCx, other.y - regCy);
              if (d < 280) enemiesNearby++;
              if (d < closestEnemyDist) closestEnemyDist = d;
            }
          }

          // If enemy counter-attacks, re-engage immediately from fortified stance!
          if (enemiesNearby > 0 || closestEnemyDist < 260) {
            this.state = 'ENGAGING';
            dispatchBanner.textContent = `⚔️ ${this.name} repels enemy counter-attack from fortified forward line!`;
            living.forEach(u => {
              u.isHoldingLine = false;
            });
            return;
          }

          // While holding the forward ground:
          // 1. Maintain compact forward-facing defensive perimeter
          // 2. Spearmen stay braced facing enemy forward direction
          // 3. Field triage: heal wounds (+6 HP/s) while holding ground
          living.forEach(u => {
            u.isHoldingLine = true;
            u.facingX = forwardDir.x * marchSign;
            u.facingY = forwardDir.y * marchSign;
            if (u.isSpear) u.isBraced = true;
            if (u.hp < u.maxHp) {
              u.hp = Math.min(u.maxHp, u.hp + 6.0 * dt);
            }
            // Compact defensive cluster around center
            u.vx *= 0.60;
            u.vy *= 0.60;
            u.vx += (regCx - u.x) * 0.12;
            u.vy += (regCy - u.y) * 0.12;
          });

          // Check if an oncoming allied regiment reached us
          for (let r = 0; r < activeRegiments.length; r++) {
            const oncomingReg = activeRegiments[r];
            if (oncomingReg === this || oncomingReg.team !== this.team) continue;
            if (oncomingReg.state === 'LOCKSTEP_MARCH') {
              const oLead = oncomingReg.captain || oncomingReg.units.find(u => !u.isDead);
              if (oLead) {
                const od = Math.hypot(oLead.x - regCx, oLead.y - regCy);
                if (od < 220) {
                  // MERGE INTO THE ONCOMING WAVE!
                  const vCount = living.length;
                  const startIndex = oncomingReg.units.length;
                  living.forEach((u, vIdx) => {
                    u.regiment = oncomingReg;
                    oncomingReg.units.push(u);
                    u.isHoldingLine = false;
                    u.isVeteran = true;
                    u.morale = u.maxMorale;
                    u.hp = Math.min(u.maxHp, u.hp + 35);
                    u.speedMultiplier = 1.0;
                    if (!u.name.includes('Veteran')) u.name = 'Veteran ' + u.name;

                    // Structured non-overlapping placement in formation ranks behind the vanguard
                    const slotIdx = startIndex + vIdx;
                    let fwd = 0, side = 0;
                    if (oncomingReg.formationType === 'wedge') {
                      const tier = Math.ceil(slotIdx / 2);
                      const sideSign = slotIdx % 2 === 1 ? -1 : 1;
                      fwd = -tier * 32;
                      side = sideSign * tier * 24;
                    } else {
                      const row = Math.floor(slotIdx / 4);
                      const col = slotIdx % 4;
                      fwd = -row * 32;
                      side = (col - 1.5) * 34;
                    }
                    const marchSign = oncomingReg.team === 'chicken' ? 1 : -1;
                    u.formationOffsetX = fwd * marchSign;
                    u.formationOffsetY = side;
                    u.vx = oncomingReg.captain ? oncomingReg.captain.vx : 0;
                    u.vy = oncomingReg.captain ? oncomingReg.captain.vy : 0;
                  });
                  this.state = 'MERGED';
                  playChargeHorn();
                  dispatchBanner.textContent = `📯⚡ REINFORCEMENTS ARRIVED! ${vCount} veterans joined ${oncomingReg.name} on the front line! PUSHING FORWARD!`;
                  return;
                }
              }
            }
          }
        }
      }
    }

    // ----------------------------------------------------
    // STATE & CONTROLLER
    // ----------------------------------------------------
    let isWarRunning = false;
    let simTimer = null;
    let battleUnits = [];
    let boardObstacles = [];
    let liveBases = null;

    let activeRegiments = [];
    let regimentCounterChicken = 1;
    let regimentCounterMouse = 1;
    let assemblingChicken = null;
    let assemblingMouse = null;

    let chickenRecruitTimer = 0;
    let mouseRecruitTimer = 0;
    let crabTimer = 0;
    const CRAB_INTERVAL = 420; // 7 minutes
    let underdogCooldownChicken = 180.0; // 3-minute opening grace period before any crusade can occur
    let underdogCooldownMouse = 180.0;
    const CRUSADE_COOLDOWN = 300.0; // 5-minute cooldown between crusades (prevents momentum ping-pong!)
    let passiveEconomyTimer = 0;
    // Defensive formations & merging are handled organically via Regiment state machine
    let defensiveStandChicken = { active: false };
    let defensiveStandMouse = { active: false };

    // UI Elements
    const btnPlay = document.getElementById('btn-play');
    const btnFocus = document.getElementById('btn-focus');
    const btnSound = document.getElementById('btn-sound');
    const btnSpawnBases = document.getElementById('btn-spawn-bases');
    const btnSpawnArmy = document.getElementById('btn-spawn-army');
    const btnResync = document.getElementById('btn-resync');
    const btnScan = document.getElementById('btn-scan');
    const btnScanObs = document.getElementById('btn-scan-obs');
    const btnCrabs = document.getElementById('btn-crabs');
    const btnRaid = document.getElementById('btn-raid');
    const btnReset = document.getElementById('btn-reset');
    const btnClean = document.getElementById('btn-clean');
    const lblChicken = document.getElementById('lbl-chicken');
    const lblMouse = document.getElementById('lbl-mouse');
    const lblStatus = document.getElementById('lbl-status');
    const barChicken = document.getElementById('bar-chicken');
    const barCrab = document.getElementById('bar-crab');
    const barMouse = document.getElementById('bar-mouse');
    const _rawDispatchBanner = document.getElementById('dispatch-banner');
    const dispatchBanner = finiteBattle || _rawDispatchBanner ? {
      get style() { return _rawDispatchBanner?.style; },
      get textContent() { return _rawDispatchBanner?.textContent; },
      set textContent(val) {
        addRecentEvent(val, 1);
      }
    } : null;
    const baseStatusRow = document.getElementById('base-status-row');
    const regimentRoster = document.getElementById('regiment-roster');
    const recentEventsList = document.getElementById('recent-events-list');
    const diagReadout = document.getElementById('diag-readout');

    // Recent events history & priority banner hold (Phase 8)
    let bannerLockUntil = 0;
    let bannerPriority = 0;
    const recentEvents = [];

    function addRecentEvent(text, priority = 1) {
      if (finiteBattle) {
        classroomHooks.onEvent(text, priority);
        return;
      }
      const now = Date.now();
      if (_rawDispatchBanner) {
        if (priority >= bannerPriority || now >= bannerLockUntil) {
          _rawDispatchBanner.textContent = text;
          bannerPriority = priority;
          if (priority >= 2) {
            bannerLockUntil = now + 4000; // Hold critical messages for 4 seconds
          } else {
            bannerLockUntil = 0;
          }
        }
      }

      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      recentEvents.unshift({ time: timeStr, text, priority });
      if (recentEvents.length > 20) {
        recentEvents.length = 20; // Bounded at 20 entries
      }

      if (recentEventsList) {
        recentEventsList.innerHTML = recentEvents.map(e => {
          const isCrit = e.priority >= 2;
          const col = isCrit ? '#b42318' : '#475467';
          const weight = isCrit ? '600' : '400';
          return `<div style="color:${col}; font-weight:${weight};"><span style="color:#98a2b3;">[${e.time}]</span> ${e.text}</div>`;
        }).join('');
      }
    }

    // Logistics, Ballistics, Roads & Eras State
    let boardRoads = [];
    let resourceNodes = [];
    let activeProjectiles = [];
    let chickenGrain = 60;
    let mouseCheese = 60;
    let techEra = 1; // 1 = Tribal, 2 = Feudal, 3 = Imperial
    let isTruce = false;
    let truceTimer = 0;
    let truceCooldown = 0;
    let volleysFiredCount = 0;
    let campaignCombatants = 0;
    let combatDeaths = 0;
    let exhaustionSustainTimer = 0;
    const eraUnlocksAwarded = new Set();
    const pendingSpawnRequests = new Set();
    let retiredRegiments = [];
    let boardBounds = null;
    let autoSaveTimer = 0;
    let boardSummaryTimer = 0.0;

    // Document-Write Control & Throttled Rendering State (Phase 7)
    let renderSequence = 0;
    let isRenderInFlight = false;
    let renderInFlightTimer = 0.0;
    let renderAccumulator = 0.0;
    let pendingRenderSnapshot = null;
    const lastAcknowledgedSnapshot = new Map();
    let sidebarUiTimer = 0.0;

    function sendRenderSnapshot(updatesToSend, projs) {
      renderSequence++;
      isRenderInFlight = true;
      renderInFlightTimer = 0.0;
      for (let i = 0; i < updatesToSend.length; i++) {
        const u = updatesToSend[i];
        lastAcknowledgedSnapshot.set(u.id, {
          x: u.x,
          y: u.y,
          isDead: u.isDead,
          isRouted: u.isRouted,
          isBraced: u.isBraced,
          isDefending: u.isDefending
        });
      }
      parent.postMessage({
        pluginMessage: {
          type: 'SYNC_MOVE_NODES',
          sequence: renderSequence,
          updates: updatesToSend,
          projectiles: projs
        }
      }, '*');
    }

    function serializeCurrentUiState() {
      return {
        version: 1,
        savedAt: Date.now(),
        chickenGrain,
        mouseCheese,
        techEra,
        eraUnlocksAwarded: Array.from(eraUnlocksAwarded),
        isTruce,
        truceTimer,
        truceCooldown,
        campaignCombatants,
        combatDeaths,
        liveBases,
        boardBounds,
        units: battleUnits.map(u => ({
          id: u.id,
          name: u.name,
          team: u.team,
          x: Math.round(u.x),
          y: Math.round(u.y),
          startX: Math.round(u.startX || u.x),
          startY: Math.round(u.startY || u.y),
          hp: Math.round(u.hp),
          maxHp: u.maxHp,
          morale: Math.round(u.morale),
          maxMorale: u.maxMorale,
          isCaptain: !!u.isCaptain,
          isCavalry: !!u.isCavalry,
          isSpear: !!u.isSpear,
          isRanged: !!u.isRanged,
          isSiege: !!u.isSiege,
          isHarvester: !!u.isHarvester,
          isVeteran: !!u.isVeteran,
          isCrusading: !!u.isCrusading,
          isDead: !!u.isDead,
          isRouted: !!u.isRouted,
          speedMultiplier: u.speedMultiplier || 1.0
        }))
      };
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

    function canDamage(attackerTeam, target, isCurrentTruce) {
      if (isCurrentTruce) return false;
      if (!target || target.isDead) return false;
      if (target.team === attackerTeam) return false;
      return true;
    }

    // UI Elements for Logistics & Eras
    const lblGrain = document.getElementById('lbl-grain');
    const lblCheese = document.getElementById('lbl-cheese');
    const lblEra = document.getElementById('lbl-era');
    const lblVolleys = document.getElementById('lbl-volleys');
    const btnTruce = document.getElementById('btn-truce');
    const btnUpgradeEra = document.getElementById('btn-upgrade-era');

    // Find physical or virtual resource node for harvesters
    function getResourceNodeForTeam(team, u) {
      const targetType = team === 'chicken' ? 'grain' : 'cheese';
      let best = null;
      let minD = Infinity;

      for (let n = 0; n < resourceNodes.length; n++) {
        const rn = resourceNodes[n];
        if (rn.type === targetType && rn.capacity > 0) {
          const d = Math.hypot(rn.x - u.x, rn.y - u.y);
          if (d < minD) { minD = d; best = rn; }
        }
      }
      if (best) return best;
      if (resourceNodes.length > 0) return resourceNodes[0];

      // Dynamic virtual fallback node between bases
      if (liveBases && liveBases.chicken && liveBases.mouse) {
        const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
        const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
        if (team === 'chicken') {
          return { name: 'Prairie Grain Field', x: liveBases.chicken.cx + bdx * 0.35, y: liveBases.chicken.cy + bdy * 0.35 - 180, capacity: 500, type: 'grain' };
        } else {
          return { name: 'Cheddar Rock Quarry', x: liveBases.chicken.cx + bdx * 0.65, y: liveBases.chicken.cy + bdy * 0.65 + 180, capacity: 500, type: 'cheese' };
        }
      }

      return { name: 'Local Forage Fields', x: u.startX + (team === 'chicken' ? 450 : -450), y: u.startY - 150, capacity: 500, type: targetType };
    }

    function spawnHarvester(team) {
      let spawnX = team === 'chicken' ? 200 : 1300;
      let spawnY = 300;
      if (liveBases) {
        const b = team === 'chicken' ? liveBases.chicken : liveBases.mouse;
        if (b) {
          spawnX = b.cx + (Math.random() - 0.5) * (b.width * 0.3);
          spawnY = b.cy + (Math.random() - 0.5) * (b.height * 0.3);
        }
      }
      const char = team === 'chicken' ? '🚜' : '⛏️';
      const name = team === 'chicken' ? 'Worker Chick' : 'Burrow Miner';
      const reqId = 'req_harv_' + team + '_' + Math.random().toString(36).substr(2, 7);
      const logicalId = 'harv_' + team + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      pendingSpawnRequests.add(reqId);

      parent.postMessage({
        pluginMessage: {
          type: 'SPAWN_NEW_UNIT',
          char,
          name,
          team,
          x: Math.round(spawnX),
          y: Math.round(spawnY),
          isCavalry: false,
          isSpear: false,
          isCrab: false,
          isCaptain: false,
          isCrusading: false,
          isRanged: false,
          isSiege: false,
          isHarvester: true,
          regimentId: null,
          requestId: reqId,
          logicalId
        }
      }, '*');
    }

    // Distance to line segment for connector highways
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

    function updateEconomyDisplay() {
      if (lblGrain) lblGrain.textContent = chickenGrain;
      if (lblCheese) lblCheese.textContent = mouseCheese;
    }

    function updateEraDisplay() {
      if (!lblEra) return;
      if (techEra === 1) {
        lblEra.textContent = '🏛️ Era I: Tribal';
        lblEra.style.background = '#f3e8ff';
        lblEra.style.color = '#7e22ce';
      } else if (techEra === 2) {
        lblEra.textContent = '⚔️ Era II: Feudal';
        lblEra.style.background = '#e0f2fe';
        lblEra.style.color = '#0369a1';
      } else {
        lblEra.textContent = '💣 Era III: Imperial';
        lblEra.style.background = '#fef3c7';
        lblEra.style.color = '#b45309';
      }
    }

    function declareTruce(duration = 25.0) {
      if (isTruce) return;
      isTruce = true;
      truceTimer = duration;
      activeProjectiles = [];
      playPeaceFlute();
      addRecentEvent(`🕊️ TRUCE OF THE RETRO! ${Math.round(duration)}s Ceasefire declared! Troops heal (+18 HP/s), harvesters gather resources!`, 2);
      if (dispatchBanner) {
        dispatchBanner.style.background = '#f0fdf4';
        dispatchBanner.style.borderColor = '#86efac';
      }

      activeRegiments.forEach(reg => {
        if (reg.state === 'ENGAGING' || reg.state === 'LOCKSTEP_MARCH') {
          reg.state = 'HOLDING_LINE';
        }
      });
    }

    function advanceTechEra() {
      if (techEra >= 3) return;
      const nextEra = techEra + 1;
      techEra = nextEra;
      playChargeHorn();
      updateEraDisplay();

      if (techEra === 2 && !eraUnlocksAwarded.has(2)) {
        eraUnlocksAwarded.add(2);
        addRecentEvent('⚔️ ADVANCED TO ERA II: FEUDAL REGIMENTS! Armored Knights, Shield Walls & Ranger Screens deploy!', 2);
      } else if (techEra === 3 && !eraUnlocksAwarded.has(3)) {
        eraUnlocksAwarded.add(3);
        addRecentEvent('💣 ADVANCED TO ERA III: IMPERIAL WAR MACHINE! Siege Catapults & Egg Trebuchets unlocked!', 2);
        spawnSiegeEngines();
      }
    }

    function spawnSiegeEngines() {
      let cSpawnX = 280, cSpawnY = 300;
      let mSpawnX = 1200, mSpawnY = 300;
      if (liveBases) {
        if (liveBases.chicken) {
          cSpawnX = liveBases.chicken.cx + 80;
          cSpawnY = liveBases.chicken.cy;
        }
        if (liveBases.mouse) {
          mSpawnX = liveBases.mouse.cx - 80;
          mSpawnY = liveBases.mouse.cy;
        }
      }

      const chickLogicalId = 'siege_chick_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const chickReqId = 'req_' + chickLogicalId;
      pendingSpawnRequests.add(chickReqId);

      parent.postMessage({
        pluginMessage: {
          type: 'SPAWN_NEW_UNIT',
          char: '🥚💣',
          name: 'Egg Trebuchet',
          team: 'chicken',
          x: Math.round(cSpawnX),
          y: Math.round(cSpawnY),
          isCavalry: false,
          isSpear: false,
          isCrab: false,
          isCaptain: false,
          isCrusading: false,
          isRanged: true,
          isSiege: true,
          isHarvester: false,
          regimentId: null,
          requestId: chickReqId,
          logicalId: chickLogicalId
        }
      }, '*');

      const mouseLogicalId = 'siege_mouse_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const mouseReqId = 'req_' + mouseLogicalId;
      pendingSpawnRequests.add(mouseReqId);

      parent.postMessage({
        pluginMessage: {
          type: 'SPAWN_NEW_UNIT',
          char: '🧀💣',
          name: 'Cheddar Catapult',
          team: 'mouse',
          x: Math.round(mSpawnX),
          y: Math.round(mSpawnY),
          isCavalry: false,
          isSpear: false,
          isCrab: false,
          isCaptain: false,
          isCrusading: false,
          isRanged: true,
          isSiege: true,
          isHarvester: false,
          regimentId: null,
          requestId: mouseReqId,
          logicalId: mouseLogicalId
        }
      }, '*');
    }

    function spawnProjectile(team, startX, startY, targetX, targetY, type = 'arrow', damage = 28) {
      volleysFiredCount++;
      if (lblVolleys) lblVolleys.textContent = `🏹 Volleys: ${volleysFiredCount}`;
      const isSiege = type === 'egg' || type === 'cheese';
      const scatterRange = isSiege ? 18 : 4;
      const scatterX = (Math.random() - 0.5) * scatterRange;
      const scatterY = (Math.random() - 0.5) * scatterRange;
      const dist = Math.hypot(targetX - startX, targetY - startY) || 1;
      const duration = Math.min(0.95, Math.max(0.40, dist / 390));
      activeProjectiles.push({
        id: Math.random().toString(36).substr(2, 9),
        team,
        startX,
        startY,
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

    function applyMissileHit(u, proj) {
      const isDefended = u.isBraced || u.isDefending;
      const reduction = isDefended ? 0.30 : 1.0;
      const actualDmg = proj.damage * reduction;
      u.hp -= actualDmg;

      if (isDefended) {
        dispatchBanner.textContent = `🛡️ SHIELD WALL! ${u.name} deflected 70% missile damage!`;
      } else {
        u.morale -= 14;
        if (u.morale <= 0 && !u.isRouted) {
          u.isRouted = true;
          u.speedMultiplier = 1.35;
          dispatchBanner.textContent = `🏳️ ${u.name} broke formation under missile barrage!`;
        }
      }

      if (u.hp <= 0) {
        u.isDead = true;
        if (typeof triggerCasualtyShock === 'function') triggerCasualtyShock(u);
      }
    }

    function updateProjectiles(dt) {
      for (let p = 0; p < activeProjectiles.length; p++) {
        const proj = activeProjectiles[p];
        if (!proj.active) continue;
        proj.t += dt;
        const prog = Math.min(1.0, proj.t / proj.duration);
        proj.x = proj.startX + (proj.targetX - proj.startX) * prog;
        proj.y = proj.startY + (proj.targetY - proj.startY) * prog;
        const peakH = (proj.type === 'egg' || proj.type === 'cheese') ? 65 : 45;
        proj.z = 4 * peakH * prog * (1 - prog);

        if (prog >= 1.0) {
          proj.active = false;
          playArrowHit();

          const isSiegeSplash = proj.type === 'egg' || proj.type === 'cheese';
          const splashRadius = isSiegeSplash ? 60 : 36;

          if (isSiegeSplash) {
            for (let i = 0; i < battleUnits.length; i++) {
              const u = battleUnits[i];
              if (!canDamage(proj.team, u, isTruce)) continue;
              const d = Math.hypot(u.x - proj.x, u.y - proj.y);
              if (d < splashRadius) {
                applyMissileHit(u, proj);
              }
            }
          } else {
            let closest = null;
            let minD = splashRadius;
            for (let i = 0; i < battleUnits.length; i++) {
              const u = battleUnits[i];
              if (!canDamage(proj.team, u, isTruce)) continue;
              const d = Math.hypot(u.x - proj.x, u.y - proj.y);
              if (d < minD) {
                minD = d;
                closest = u;
              }
            }
            if (closest) {
              applyMissileHit(closest, proj);
            }
          }
        }
      }
      activeProjectiles = activeProjectiles.filter(p => p.active);
    }

    function getOrdinal(n) {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function createNextRegiment(team) {
      const counter = team === 'chicken' ? regimentCounterChicken++ : regimentCounterMouse++;
      const isCavalry = counter % 2 === 0;
      const formationType = isCavalry ? 'wedge' : 'phalanx';
      const name = team === 'chicken' 
        ? `${getOrdinal(counter)} Royal ${isCavalry ? 'Lancers (Wedge)' : 'Phalanx (Box)'}`
        : `${getOrdinal(counter)} Whisker ${isCavalry ? 'Cheese Knights (Wedge)' : 'Iron Spearmice (Box)'}`;

      let musterX = team === 'chicken' ? 350 : 1150;
      let musterY = 320;
      if (liveBases && liveBases.chicken && liveBases.mouse) {
        const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
        const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
        const bdist = Math.hypot(bdx, bdy) || 1;
        const fDir = { x: bdx / bdist, y: bdy / bdist };

        const b = team === 'chicken' ? liveBases.chicken : liveBases.mouse;
        const sign = team === 'chicken' ? 1 : -1;
        musterX = b.cx + fDir.x * sign * (b.width * 0.5 + 40);
        musterY = b.cy + fDir.y * sign * (b.height * 0.5 + 40);
      }

      const reg = new Regiment(team, name, formationType, null, musterX, musterY);
      reg.state = 'ASSEMBLING';
      reg.targetSize = isCavalry ? 14 : 16;
      activeRegiments.push(reg);
      return reg;
    }

    function spawnRecruit(team, isElite = false, crusadeReg = null) {
      let spawnX = team === 'chicken' ? 200 : 1300;
      let spawnY = 300;
      if (liveBases) {
        const b = team === 'chicken' ? liveBases.chicken : liveBases.mouse;
        if (b) {
          spawnX = b.cx + (Math.random() - 0.5) * (b.width * 0.4);
          spawnY = b.cy + (Math.random() - 0.5) * (b.height * 0.4);
        }
      }

      const isCav = isElite || Math.random() < 0.35;
      const assembling = team === 'chicken' ? assemblingChicken : assemblingMouse;
      const isCap = (!assembling || assembling.units.length === 0) && !crusadeReg;

      let char, name, isSpear = false;
      const isCrusader = !!crusadeReg;
      if (team === 'chicken') {
        char = isCap ? '🐓' : (isCrusader ? '🐓' : (isCav ? '🐓' : '🐔'));
        name = isCrusader ? (isCav ? 'Rooster Paladin' : 'Dominion Crusader') : (isCap ? 'Rooster General' : (isCav ? 'Rooster Knight' : (Math.random() < 0.4 ? 'Comb Guard' : 'Chicken Infantry')));
        isSpear = name === 'Comb Guard';
      } else {
        char = isCap ? '🐭' : (isCrusader ? '🧀' : (isCav ? '🧀' : '🐭'));
        name = isCrusader ? (isCav ? 'Cheddar Paladin' : 'Citadel Crusader') : (isCap ? 'Mouse Warlord' : (isCav ? 'Cheese Knight' : (Math.random() < 0.5 ? 'Spearmouse' : 'Mouse Swarmer')));
        isSpear = name === 'Spearmouse';
      }

      parent.postMessage({
        pluginMessage: {
          type: 'SPAWN_NEW_UNIT',
          char,
          name,
          team,
          x: Math.round(spawnX),
          y: Math.round(spawnY),
          isCavalry: isCav,
          isSpear,
          isCrab: false,
          isCaptain: isCap,
          isCrusading: isCrusader,
          regimentId: crusadeReg ? crusadeReg.id : null
        }
      }, '*');
    }

    function spawnGrandCrusade(team, count = 6) {
      const counter = team === 'chicken' ? regimentCounterChicken++ : regimentCounterMouse++;
      const name = team === 'chicken' 
        ? `${getOrdinal(counter)} Royal Templar Relief (Wedge)` 
        : `${getOrdinal(counter)} Whisker Templar Relief (Wedge)`;

      let musterX = team === 'chicken' ? 350 : 1150;
      let musterY = 320;
      if (liveBases && liveBases.chicken && liveBases.mouse) {
        const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
        const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
        const bdist = Math.hypot(bdx, bdy) || 1;
        const fDir = { x: bdx / bdist, y: bdy / bdist };
        const b = team === 'chicken' ? liveBases.chicken : liveBases.mouse;
        const sign = team === 'chicken' ? 1 : -1;
        musterX = b.cx + fDir.x * sign * (b.width * 0.5 + 40);
        musterY = b.cy + fDir.y * sign * (b.height * 0.5 + 40);
      }

      const crusadeReg = new Regiment(team, name, 'wedge', null, musterX, musterY);
      crusadeReg.targetSize = count;
      crusadeReg.isCrusading = true;
      activeRegiments.push(crusadeReg);

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          spawnRecruit(team, i % 2 === 0, crusadeReg);
        }, i * 90);
      }

      setTimeout(() => {
        crusadeReg.dispatch();
        dispatchBanner.textContent = `🚩 ${name} DISPATCHED! 6 Royal Templars deployed to relieve the siege!`;
      }, count * 90 + 350);
    }

    function createBattleUnit(n) {
        const maxHp = getUnitMaxHp(n.team, n.isCaptain, n.isCavalry, n.isSpear, n.isCrab);
        const maxMorale = getUnitMaxMorale(n.team, n.isCaptain, n.isCavalry, n.isSpear, n.isCrab);
        const initialFacingX = n.team === 'chicken' ? 1 : -1;
        return {
          id: n.id,
          name: n.name,
          team: n.team,
          x: n.x,
          y: n.y,
          startX: n.x,
          startY: n.y,
          vx: 0,
          vy: 0,
          facingX: initialFacingX,
          facingY: 0,
          hp: maxHp,
          maxHp: maxHp,
          morale: maxMorale,
          maxMorale: maxMorale,
          isDead: false,
          isRouted: false,
          canBrace: !!n.isSpear,
          isBraced: false, isDefending: false, counterZealTimer: 0,
          isFallingBack: false, isHoldingLine: false, isVeteran: false,
          braceTimer: 0,
          stunTimer: 0,
          isCavalry: n.isCavalry,
          isSpear: n.isSpear,
          isCrab: n.isCrab,
          isCaptain: n.isCaptain,
          isRanged: !!n.isRanged,
          isHarvester: !!n.isHarvester,
          isSiege: !!n.isSiege,
          shootCd: Math.random() * 2.0,
          hasCargo: false,
          harvestTimer: 0,
          isCharging: false,
          chargeCd: 0,
          decayTimer: 8.0,
          hasPlunder: false,
          speedMultiplier: 1.0,
          regiment: null
        };
    }

    if (!finiteBattle) {
    // Button Listeners
    if (btnFocus) {
      btnFocus.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'FOCUS_BATTLE' } }, '*');
        addRecentEvent('🔍 Centered camera on battle lines without disturbing cards.', 1);
      });
    }

    if (btnSound) {
      btnSound.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        if (isSoundEnabled) {
          initAudio();
          btnSound.textContent = '🔊 Sound: ON';
          btnSound.style.background = '#e0f2fe';
          btnSound.style.borderColor = '#7dd3fc';
          addRecentEvent('🔊 Sound effects enabled.', 1);
        } else {
          if (audioCtx) {
            try { audioCtx.close(); } catch (e) {}
            audioCtx = null;
          }
          btnSound.textContent = '🔇 Sound: OFF';
          btnSound.style.background = '';
          btnSound.style.borderColor = '';
          addRecentEvent('🔇 Sound effects muted.', 1);
        }
      });
    }

    btnSpawnBases.addEventListener('click', () => {
      initAudio();
      parent.postMessage({ pluginMessage: { type: 'SPAWN_CIVILIZATION_BASE' } }, '*');
    });

    btnSpawnArmy.addEventListener('click', () => {
      initAudio();
      activeRegiments = [];
      parent.postMessage({ pluginMessage: { type: 'SPAWN_FORMATION' } }, '*');
    });

    btnResync.addEventListener('click', () => {
      parent.postMessage({ pluginMessage: { type: 'RESYNC_CANVAS_POSITIONS' } }, '*');
      addRecentEvent('🎯 Resyncing live positions of bases and stickers...', 1);
    });

    btnScan.addEventListener('click', () => {
      initAudio();
      parent.postMessage({ pluginMessage: { type: 'SCAN_SELECTION' } }, '*');
    });

    btnScanObs.addEventListener('click', () => {
      parent.postMessage({ pluginMessage: { type: 'SCAN_BOARD_OBSTACLES' } }, '*');
    });

    btnCrabs.addEventListener('click', () => {
      spawnCrabHorde(16);
    });

    btnRaid.addEventListener('click', () => {
      playChargeHorn();
      addRecentEvent('🚩 ALL REGIMENTS CHARGE! Advancing directly to enemy citadels!', 2);
      activeRegiments.forEach(reg => {
        reg.state = 'ENGAGING';
      });
      battleUnits.forEach(u => {
        if (!u.isDead && Math.random() < 0.7) {
          u.isCharging = true;
          u.speedMultiplier = 1.45;
        }
      });
    });

    btnReset.addEventListener('click', () => {
      stopWar();
      activeRegiments = [];
      battleUnits.forEach(u => {
        u.x = u.startX;
        u.y = u.startY;
        u.vx = 0;
        u.vy = 0;
        u.hp = u.maxHp;
        u.isDead = false;
        u.hasPlunder = false;
        u.speedMultiplier = 1.0;
      });
      parent.postMessage({ pluginMessage: { type: 'RESET_POSITIONS' } }, '*');
      organizeInitialRegiments();
      campaignCombatants = battleUnits.filter(u => !u.isDead && !u.isHarvester).length;
      combatDeaths = 0;
      exhaustionSustainTimer = 0;
      updateMeters();
      btnPlay.textContent = '▶ START / RESUME WORLD';
      btnPlay.style.background = '#12b76a';
      addRecentEvent('🔄 Regiments restored to base starting lines.', 1);
    });

    btnClean.addEventListener('click', () => {
      stopWar();
      battleUnits = [];
      activeRegiments = [];
      activeProjectiles = [];
      parent.postMessage({ pluginMessage: { type: 'CLEANUP_ALL' } }, '*');
      updateMeters();
      btnPlay.textContent = '▶ START / RESUME WORLD';
      btnPlay.style.background = '#12b76a';
      addRecentEvent('🧹 Cleared all battle stickers from canvas.', 1);
    });

    if (btnTruce) {
      btnTruce.addEventListener('click', () => {
        declareTruce(25.0);
      });
    }

    if (btnUpgradeEra) {
      btnUpgradeEra.addEventListener('click', () => {
        advanceTechEra();
      });
    }

    btnPlay.addEventListener('click', () => {
      initAudio();
      if (battleUnits.length === 0) {
        if (!liveBases || (!liveBases.chicken && !liveBases.mouse)) {
          parent.postMessage({ pluginMessage: { type: 'SPAWN_CIVILIZATION_BASE' } }, '*');
        }
        parent.postMessage({ pluginMessage: { type: 'SPAWN_FORMATION' } }, '*');
        addRecentEvent('🚀 Spawning bases & deploying armies on canvas...', 2);
        dispatchBanner.textContent = '⏳ Deploying armies to board... Please wait a moment!';
        window._pendingAutoStart = true;
        return;
      }

      if (isWarRunning) {
        stopWar();
        btnPlay.textContent = '▶ RESUME WORLD';
        btnPlay.style.background = '#12b76a';
        addRecentEvent('⏸ World paused. Retrospective cards and tokens can be freely edited.', 1);
      } else {
        startWar();
        btnPlay.textContent = '⏸ PAUSE WORLD';
        btnPlay.style.background = '#f04438';
        addRecentEvent('⚔️ Generals leading regiments across FigJam in perpetual war!', 1);
      }
    });

    // Handle messages from Figma code.js
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'SCAN_RESULT') {
        if (!msg.nodes || msg.nodes.length === 0) {
          dispatchBanner.textContent = msg.error || 'No items selected!';
          return;
        }

        if (msg.bases) updateBaseInfo(msg.bases);

        battleUnits = msg.nodes.map(createBattleUnit);

        organizeInitialRegiments();
        campaignCombatants = battleUnits.filter(u => !u.isDead && !u.isHarvester).length;
        combatDeaths = 0;
        exhaustionSustainTimer = 0;
        updateMeters();
        updateEconomyDisplay();
        updateEraDisplay();
        dispatchBanner.textContent = `⚔️ Deployed ${battleUnits.length} troops organized into tactical wings & logistics harvesters! Ready.`;
        if (window._pendingAutoStart) {
          window._pendingAutoStart = false;
          startWar();
          btnPlay.textContent = '⏸ PAUSE WORLD';
          btnPlay.style.background = '#f04438';
          addRecentEvent('⚔️ Generals leading regiments across FigJam in perpetual war!', 1);
        }
        parent.postMessage({ pluginMessage: { type: 'SCAN_BOARD_OBSTACLES' } }, '*');
      }

      else if (msg.type === 'BASES_CREATED') {
        if (msg.bases) updateBaseInfo(msg.bases);
        if (msg.resourceNodes) resourceNodes = msg.resourceNodes;
        if (msg.bounds) boardBounds = msg.bounds;
        dispatchBanner.textContent = '🏛️ Civilization bases & canvas resource patches built! Drag them anywhere, then click Deploy Regiments.';
        parent.postMessage({ pluginMessage: { type: 'SCAN_BOARD_OBSTACLES' } }, '*');
      }

      else if (msg.type === 'OBSTACLES_RESULT') {
        boardObstacles = msg.obstacles || [];
        if (msg.roads) boardRoads = msg.roads;
        if (msg.bases) updateBaseInfo(msg.bases);
        if (msg.bounds) boardBounds = msg.bounds;
        dispatchBanner.textContent = boardRoads.length > 0 
          ? `🗺️ Detected ${boardObstacles.length} barriers & ${boardRoads.length} paved highways!`
          : `🗺️ Battlefield scanned! ${boardObstacles.length} terrain props active.`;
      }

      else if (msg.type === 'WORLD_STATE_SAVED') {
        dispatchBanner.textContent = '💾 Game state durably saved to FigJam document!';
      }

      else if (msg.type === 'WORLD_STATE_LOADED') {
        if (msg.role === 'spectator') {
          dispatchBanner.textContent = `👁️ SPECTATOR MODE — Active Host: ${msg.hostId || 'User'}. Controls disabled.`;
          dispatchBanner.style.background = '#fef3c7';
          btnPlay.disabled = true;
          btnSpawnBases.disabled = true;
          btnSpawnArmy.disabled = true;
        }

        if (msg.serializedState) {
          try {
            const data = typeof msg.serializedState === 'string' ? JSON.parse(msg.serializedState) : msg.serializedState;
            if (data && data.units && data.units.length > 0) {
              chickenGrain = data.chickenGrain !== undefined ? data.chickenGrain : chickenGrain;
              mouseCheese = data.mouseCheese !== undefined ? data.mouseCheese : mouseCheese;
              techEra = data.techEra !== undefined ? data.techEra : techEra;
              if (data.eraUnlocksAwarded) {
                eraUnlocksAwarded.clear();
                data.eraUnlocksAwarded.forEach(e => eraUnlocksAwarded.add(e));
              }
              isTruce = !!data.isTruce;
              truceTimer = data.truceTimer || 0;
              truceCooldown = data.truceCooldown || 0;
              campaignCombatants = data.campaignCombatants || 0;
              combatDeaths = data.combatDeaths || 0;
              if (data.liveBases) updateBaseInfo(data.liveBases);
              if (data.boardBounds) boardBounds = data.boardBounds;

              battleUnits = data.units.map(u => ({
                id: u.id,
                name: u.name,
                team: u.team,
                x: u.x,
                y: u.y,
                startX: u.startX || u.x,
                startY: u.startY || u.y,
                vx: 0,
                vy: 0,
                facingX: u.team === 'chicken' ? 1 : -1,
                facingY: 0,
                hp: u.hp,
                maxHp: u.maxHp || u.hp,
                morale: u.morale,
                maxMorale: u.maxMorale || u.morale,
                isCaptain: !!u.isCaptain,
                isCavalry: !!u.isCavalry,
                isSpear: !!u.isSpear,
                isRanged: !!u.isRanged,
                isSiege: !!u.isSiege,
                isHarvester: !!u.isHarvester,
                isVeteran: !!u.isVeteran,
                isCrusading: !!u.isCrusading,
                isDead: !!u.isDead,
                isRouted: !!u.isRouted,
                isCharging: false,
                chargeCd: 0,
                decayTimer: 8.0,
                speedMultiplier: u.speedMultiplier || 1.0,
                regiment: null
              }));

              organizeInitialRegiments();
              updateMeters();
              updateEconomyDisplay();
              updateEraDisplay();
              dispatchBanner.textContent = '🏛️ Restored perpetual world state from FigJam document storage!';
            }
          } catch (e) {
            console.error('Failed to parse loaded world state:', e);
          }
        }
      }

      else if (msg.type === 'LIVE_BASES_UPDATE') {
        if (msg.bases) updateBaseInfo(msg.bases);
      }

      else if (msg.type === 'CANVAS_POSITIONS_SYNCED') {
        if (msg.bases) updateBaseInfo(msg.bases);
        if (msg.nodes) {
          const map = new Map(msg.nodes.map(n => [n.id, n]));
          battleUnits.forEach(u => {
            const live = map.get(u.id);
            if (live) {
              u.x = live.x;
              u.y = live.y;
              u.startX = live.x;
              u.startY = live.y;
              u.vx = 0;
              u.vy = 0;
            }
          });

          // Recalibrate formation offsets relative to captains
          activeRegiments.forEach(reg => {
            if (reg.captain && !reg.captain.isDead) {
              reg.units.forEach(u => {
                u.formationOffsetX = u.x - reg.captain.x;
                u.formationOffsetY = u.y - reg.captain.y;
              });
            }
          });
        }
        dispatchBanner.textContent = '🎯 Positions locked! Regiments will advance from their new coordinates.';
      }

      else if (msg.type === 'OBSTACLES_RESULT') {
        boardObstacles = msg.obstacles || [];
        if (msg.bases) updateBaseInfo(msg.bases);
      }

      else if (msg.type === 'UNIT_SPAWNED' || msg.type === 'ENTITY_CREATED') {
        const n = msg.unitData;
        if (!n || !n.id) return;
        if (n.requestId) pendingSpawnRequests.delete(n.requestId);
        if (battleUnits.some(u => u.id === n.id)) return;

        const isCrusading = !!n.isCrusading;
        const isHarvester = !!n.isHarvester;
        const isSiege = !!n.isSiege;
        const isRanged = !!n.isRanged;
        const isVeteran = !!n.isVeteran || isSiege;

        let maxHp = getUnitMaxHp(n.team, n.isCaptain, n.isCavalry, n.isSpear, n.isCrab, isCrusading);
        let maxMorale = getUnitMaxMorale(n.team, n.isCaptain, n.isCavalry, n.isSpear, n.isCrab, isCrusading);
        if (isHarvester) { maxHp = 120; maxMorale = 100; }
        if (isSiege) { maxHp = 280; maxMorale = 200; }

        const initialFacingX = n.team === 'chicken' ? 1 : -1;
        const newUnit = {
          id: n.id,
          name: n.name,
          team: n.team,
          x: n.x,
          y: n.y,
          startX: n.x,
          startY: n.y,
          vx: 0,
          vy: 0,
          facingX: initialFacingX,
          facingY: 0,
          hp: maxHp,
          maxHp: maxHp,
          morale: maxMorale,
          maxMorale: maxMorale,
          isDead: false,
          isRouted: false,
          canBrace: !!n.isSpear,
          isBraced: false,
          isDefending: false,
          counterZealTimer: 0,
          isFallingBack: false,
          isHoldingLine: false,
          isVeteran: isVeteran,
          braceTimer: 0,
          stunTimer: 0,
          isCavalry: !!n.isCavalry,
          isSpear: !!n.isSpear,
          isCrab: !!n.isCrab,
          isCaptain: !!n.isCaptain,
          isCrusading: isCrusading,
          isRanged: isRanged,
          isHarvester: isHarvester,
          isSiege: isSiege,
          shootCd: isSiege ? 3.5 : (Math.random() * 2.0),
          hasCargo: false,
          harvestTimer: 0,
          isCharging: false,
          chargeCd: 0,
          decayTimer: 8.0,
          hasPlunder: false,
          speedMultiplier: isSiege ? 0.65 : (isCrusading ? 1.15 : 1.0),
          regiment: null
        };
        battleUnits.push(newUnit);

        if (!isHarvester && !isSiege) {
          let forwardDir = { x: 1, y: 0 };
          let perpDir = { x: 0, y: 1 };
          if (liveBases && liveBases.chicken && liveBases.mouse) {
            const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
            const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
            const bdist = Math.hypot(bdx, bdy) || 1;
            forwardDir = { x: bdx / bdist, y: bdy / bdist };
            perpDir = { x: -bdy / bdist, y: bdx / bdist };
          }

          // If part of an active crusade regiment
          let targetReg = null;
          if (n.regimentId) {
            targetReg = activeRegiments.find(r => r.id === n.regimentId);
          }

          if (targetReg) {
            targetReg.addUnit(newUnit, forwardDir, perpDir);
          } else if (n.team === 'chicken') {
            if (!assemblingChicken || assemblingChicken.state !== 'ASSEMBLING') {
              assemblingChicken = createNextRegiment('chicken');
            }
            assemblingChicken.addUnit(newUnit, forwardDir, perpDir);
            if (assemblingChicken.units.length >= assemblingChicken.targetSize) {
              assemblingChicken.dispatch();
              dispatchBanner.textContent = `📯 ${assemblingChicken.name} fully assembled (${assemblingChicken.units.length} troops) and marching out!`;
              assemblingChicken = createNextRegiment('chicken');
            }
          } else if (n.team === 'mouse') {
            if (!assemblingMouse || assemblingMouse.state !== 'ASSEMBLING') {
              assemblingMouse = createNextRegiment('mouse');
            }
            assemblingMouse.addUnit(newUnit, forwardDir, perpDir);
            if (assemblingMouse.units.length >= assemblingMouse.targetSize) {
              assemblingMouse.dispatch();
              dispatchBanner.textContent = `📯 ${assemblingMouse.name} fully assembled (${assemblingMouse.units.length} troops) and marching out!`;
              assemblingMouse = createNextRegiment('mouse');
            }
          }
        }

        updateMeters();
      }

      else if (msg.type === 'RENDER_APPLIED') {
        isRenderInFlight = false;
        renderInFlightTimer = 0.0;
        if (pendingRenderSnapshot) {
          const nextSnap = pendingRenderSnapshot;
          pendingRenderSnapshot = null;
          sendRenderSnapshot(nextSnap.updates, nextSnap.projectiles);
        }
      }

      else if (msg.type === 'RENDER_ERROR') {
        isRenderInFlight = false;
        renderInFlightTimer = 0.0;
        dispatchBanner.textContent = `⚠️ Renderer warning: ${msg.error || 'Mapped node missing'}`;
      }
    };

    } // Perpetual host controls

    function organizeInitialRegiments() {
      activeRegiments = [];

      ['chicken', 'mouse'].forEach(team => {
        const teamUnits = battleUnits.filter(u => u.team === team && !u.isDead && !u.isHarvester);
        if (teamUnits.length === 0) return;

        // Find captain nodes or designate leaders
        let captains = teamUnits.filter(u => u.isCaptain);
        if (captains.length === 0) {
          // If no marked captain, pick front-most unit as captain
          const sorted = [...teamUnits].sort((a, b) => team === 'chicken' ? b.x - a.x : a.x - b.x);
          sorted[0].isCaptain = true;
          captains = [sorted[0]];
        }

        // Create a Regiment for each captain
        const regiments = captains.map(cap => {
          const isCav = cap.isCavalry;
          const fType = isCav ? 'wedge' : 'phalanx';
          const counter = team === 'chicken' ? regimentCounterChicken++ : regimentCounterMouse++;
          const name = team === 'chicken'
            ? `${getOrdinal(counter)} Royal ${isCav ? 'Lancers (Wedge)' : 'Phalanx (Box)'}`
            : `${getOrdinal(counter)} Whisker ${isCav ? 'Cheese Knights (Wedge)' : 'Iron Spearmice (Box)'}`;
          const reg = new Regiment(team, name, fType, cap);
          activeRegiments.push(reg);
          return { reg, cap };
        });

        // Group units to closest captain
        teamUnits.forEach(u => {
          let bestReg = regiments[0].reg;
          let minDist = Infinity;
          regiments.forEach(({ reg, cap }) => {
            const d = Math.hypot(u.x - cap.x, u.y - cap.y);
            if (d < minDist) {
              minDist = d;
              bestReg = reg;
            }
          });
          bestReg.addUnit(u);
        });

        // Dispatch all regiments into lockstep march
        regiments.forEach(({ reg }) => reg.dispatch());
      });
    }

    function updateBaseInfo(bases) {
      liveBases = bases;
      if (bases && bases.chicken && bases.mouse) {
        baseStatusRow.innerHTML = `
          <span>🐔 West: (${Math.round(bases.chicken.cx)}, ${Math.round(bases.chicken.cy)})</span>
          <span>🐭 East: (${Math.round(bases.mouse.cx)}, ${Math.round(bases.mouse.cy)})</span>
        `;
      }
    }

    function spawnCrabHorde(count = 16) {
      playCrabAlarm();
      addRecentEvent(`⚠️ THE CRAB INVASION! ${count} River Crabs arrived! Chickens & Mice united!`, 2);

      let midX = 800, midY = 400;
      let perpX = 0, perpY = 1;

      if (liveBases && liveBases.chicken && liveBases.mouse) {
        midX = (liveBases.chicken.cx + liveBases.mouse.cx) * 0.5;
        midY = (liveBases.chicken.cy + liveBases.mouse.cy) * 0.5;
        const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
        const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
        const bdist = Math.hypot(bdx, bdy) || 1;
        perpX = -bdy / bdist;
        perpY = bdx / bdist;
      }

      for (let i = 0; i < count; i++) {
        const isNorth = i % 2 === 0;
        const offset = (isNorth ? 1 : -1) * 260 + (Math.random() - 0.5) * 60;
        const x = midX + perpX * offset + (Math.random() - 0.5) * 80;
        const y = midY + perpY * offset + (Math.random() - 0.5) * 80;
        parent.postMessage({
          pluginMessage: {
            type: 'SPAWN_NEW_UNIT',
            char: '🦀',
            name: 'River Crab',
            team: 'crab',
            x,
            y,
            isCavalry: false,
            isSpear: false,
            isCrab: true,
            isCaptain: false
          }
        }, '*');
      }
    }

    function startWar() {
      if (isWarRunning) return;
      isWarRunning = true;
      playChargeHorn();

      const dt = 0.05; // 20 FPS (optimal for Figma cloud sync)
      simTimer = setInterval(() => {
        tickPerpetualWar(dt);
      }, 50);
    }

    function stopWar() {
      isWarRunning = false;
      if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
      }
    }

    function updateMeters() {
      const chickens = battleUnits.filter(u => u.team === 'chicken' && !u.isDead).length;
      const mice = battleUnits.filter(u => u.team === 'mouse' && !u.isDead).length;
      const crabs = battleUnits.filter(u => u.team === 'crab' && !u.isDead).length;

      lblChicken.textContent = chickens;
      lblMouse.textContent = mice;

      const total = chickens + mice + crabs || 1;
      barChicken.style.width = `${(chickens / total) * 100}%`;
      barCrab.style.width = `${(crabs / total) * 100}%`;
      barMouse.style.width = `${(mice / total) * 100}%`;

      const phaseFn = (typeof CluckCore !== 'undefined' && CluckCore.calculateCampaignPhase) ? CluckCore.calculateCampaignPhase : null;
      const campaignPhase = phaseFn ? phaseFn({
        isTruce,
        exhaustionSustainTimer,
        units: battleUnits,
        bases: liveBases,
        projectiles: activeProjectiles,
        regiments: activeRegiments
      }) : (isTruce ? 'RECOVERY' : 'CLASH');

      if (crabs > 0) {
        lblStatus.textContent = `🦀 Crab Invasion (${crabs} alive) • [${campaignPhase}]`;
        lblStatus.style.color = '#e05263';
      } else {
        let phaseIcon = '🛡️';
        let phaseColor = '#475467';
        if (campaignPhase === 'RECOVERY') { phaseIcon = '🕊️'; phaseColor = '#7b61ff'; }
        else if (campaignPhase === 'RAID') { phaseIcon = '🏛️'; phaseColor = '#f04438'; }
        else if (campaignPhase === 'CLASH') { phaseIcon = '⚔️'; phaseColor = '#d92d20'; }
        else if (campaignPhase === 'ADVANCE') { phaseIcon = '🚩'; phaseColor = '#12b76a'; }
        else if (campaignPhase === 'MUSTER') { phaseIcon = '🛡️'; phaseColor = '#667085'; }

        lblStatus.textContent = `${phaseIcon} Campaign: ${campaignPhase}`;
        lblStatus.style.color = phaseColor;
      }

      // Update Regimental Roster UI
      const activeList = activeRegiments.filter(r => r.state !== 'BROKEN' && r.state !== 'MERGED');
      regimentRoster.innerHTML = activeList.slice(-4).map(r => {
        let stateLabel = `[${r.state}]`;
        let color = '#475467';
        if (r.state === 'LOCKSTEP_MARCH') { stateLabel = '[Marching]'; color = '#12b76a'; }
        else if (r.state === 'ENGAGING') { stateLabel = '[Engaged]'; color = '#f04438'; }
        else if (r.state === 'HOLDING_LINE') { stateLabel = `[Holding Line (${r.units.filter(u=>!u.isDead).length} vets)]`; color = '#7b61ff'; }
        else if (r.state === 'ASSEMBLING') { stateLabel = `[Mustering ${r.units.length}/${r.targetSize}]`; color = '#667085'; }
        return `
          <div class="regiment-item">
            <span>🚩 ${r.name}</span>
            <span style="font-weight:700; color:${color}">${stateLabel}</span>
          </div>
        `;
      }).join('') || '<div style="font-style:italic;">All regiments currently mustering...</div>';
    }

    /**
     * Primary 20 FPS Simulation Tick:
     * Executes the perpetual war and living civilization loop:
     * 1. Passive economy generation (+1 Grain/s, +1 Cheese/s) and Harvester replenishment.
     * 2. Existential crisis check: triggers 6 Royal Templars on 5-minute cooldown.
     * 3. Regimental recruitment surges & dispatching when rank size is reached.
     * 4. Updates all active regiments and individual unit collision/steering physics.
     * 5. Exhaustion truce evaluation (>= 65% total casualties) and Tech Era evolution.
     * 6. Syncs unit transforms, animations, and flying projectiles to FigJam stickers.
     * @param {number} dt Delta time in seconds (typically 0.05s / 50ms)
     */
    function rallyClassroomUnit(unit, dt, matchClosing) {
      unit.rallyTime = (unit.rallyTime || 0) + dt;
      const ownStrength = unit.regiment?.standingStrength || 0;
      let rallyPoint = null;
      let bestScore = Infinity;
      let foundLargerRegiment = false;
      if (!matchClosing && unit.rallyTime < 5) {
        for (const ally of battleUnits) {
          const strength = ally.regiment?.standingStrength || 0;
          if (ally === unit || ally.team !== unit.team || ally.isDead || ally.isRouted ||
              strength < 2 || (ally.regiment !== unit.regiment && strength <= ownStrength)) continue;
          const distance = Math.hypot(ally.x - unit.x, ally.y - unit.y);
          const score = distance / Math.sqrt(strength);
          const largerRegiment = ally.regiment !== unit.regiment;
          if (distance < 480 && (largerRegiment && !foundLargerRegiment ||
              largerRegiment === foundLargerRegiment && score < bestScore)) {
            rallyPoint = ally;
            bestScore = score;
            foundLargerRegiment = largerRegiment;
          }
        }
      }
      if (rallyPoint) {
        const dx = rallyPoint.x - unit.x;
        const dy = rallyPoint.y - unit.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 52) {
          unit.vx = unit.vx * .6 + dx / distance * 75 * dt * 2.2;
          unit.vy = unit.vy * .6 + dy / distance * 75 * dt * 2.2;
          return;
        }
        const newRegiment = rallyPoint.regiment;
        if (unit.regiment !== newRegiment) {
          const oldRegiment = unit.regiment;
          oldRegiment.units = oldRegiment.units.filter(member => member !== unit);
          if (oldRegiment.captain === unit) oldRegiment.captain = null;
          unit.isCaptain = false;
          unit.regiment = newRegiment;
          newRegiment.units.push(unit);
          const captain = newRegiment.captain || rallyPoint;
          unit.formationOffsetX = unit.x - captain.x;
          unit.formationOffsetY = unit.y - captain.y;
        }
        addRecentEvent(unit.name + ' rallied with ' + newRegiment.name + '.');
      }
      // Without a viable group to join, turn and fight instead of fleeing off-board.
      unit.isRouted = false;
      unit.rallyTime = 0;
      unit.rallyCooldown = 5;
      unit.morale = Math.max(unit.morale, unit.maxMorale * .75);
      unit.vx *= .25;
      unit.vy *= .25;
    }

    function tickPerpetualWar(dt) {
      // Responsive rendering timeout check: pause simulation if renderer fails to acknowledge within 2.0s
      if (isWarRunning && isRenderInFlight) {
        renderInFlightTimer += dt;
        if (renderInFlightTimer >= 2.0) {
          stopWar();
          addRecentEvent('⚠️ Renderer unresponsive (2.0s timeout). Simulation paused.', 2);
          return;
        }
      }

      if (!finiteBattle) {
      chickenRecruitTimer += dt;
      mouseRecruitTimer += dt;
      crabTimer += dt;

      // Periodic crab invasion every 7 minutes (rebalances the battlefield)
      if (crabTimer > CRAB_INTERVAL) {
        crabTimer = 0;
        spawnCrabHorde(16);
      }

      }

      const totalChickens = battleUnits.filter(u => u.team === 'chicken' && !u.isDead).length;
      const totalMice = battleUnits.filter(u => u.team === 'mouse' && !u.isDead).length;

      // Dynamic forward & perpendicular vectors between live bases
      let forwardDir = { x: 1, y: 0 };
      let perpDir = { x: 0, y: 1 };
      if (liveBases && liveBases.chicken && liveBases.mouse) {
        const bdx = liveBases.mouse.cx - liveBases.chicken.cx;
        const bdy = liveBases.mouse.cy - liveBases.chicken.cy;
        const bdist = Math.hypot(bdx, bdy) || 1;
        forwardDir = { x: bdx / bdist, y: bdy / bdist };
        perpDir = { x: -bdy / bdist, y: bdx / bdist };
      }

      if (!finiteBattle) {
      // Dynamic live muster yards in front of bases
      let cMusterX = 350, cMusterY = 320;
      let mMusterX = 1150, mMusterY = 320;
      if (liveBases && liveBases.chicken && liveBases.mouse) {
        const { chicken, mouse } = liveBases;
        cMusterX = chicken.cx + forwardDir.x * (chicken.width * 0.5 + 40);
        cMusterY = chicken.cy + forwardDir.y * (chicken.height * 0.5 + 40);
        mMusterX = mouse.cx - forwardDir.x * (mouse.width * 0.5 + 40);
        mMusterY = mouse.cy - forwardDir.y * (mouse.height * 0.5 + 40);
      }

      if (!assemblingChicken || assemblingChicken.state !== 'ASSEMBLING') {
        assemblingChicken = createNextRegiment('chicken');
      }
      if (!assemblingMouse || assemblingMouse.state !== 'ASSEMBLING') {
        assemblingMouse = createNextRegiment('mouse');
      }

      // PASSIVE GRANARY HARVEST GENERATION (+1 Grain/s, +1 Cheese/s)
      passiveEconomyTimer += dt;
      if (passiveEconomyTimer >= 1.0) {
        passiveEconomyTimer -= 1.0;
        chickenGrain += 1;
        mouseCheese += 1;
        updateEconomyDisplay();
      }

      // AUTO-RECRUIT HARVESTERS IF FEWER THAN 2 WORKERS IN THE FIELD
      const cHarvCount = battleUnits.filter(u => u.team === 'chicken' && u.isHarvester && !u.isDead).length;
      const mHarvCount = battleUnits.filter(u => u.team === 'mouse' && u.isHarvester && !u.isDead).length;
      if (cHarvCount < 2 && totalChickens > 0 && Math.random() < 0.04) {
        spawnHarvester('chicken');
      }
      if (mHarvCount < 2 && totalMice > 0 && Math.random() < 0.04) {
        spawnHarvester('mouse');
      }

      // MEASURED ROYAL RELIEF SQUAD (300s / 5-min cooldown, 6 units, only in dire existential crisis)
      if (underdogCooldownChicken > 0) underdogCooldownChicken = Math.max(0, underdogCooldownChicken - dt);
      if (underdogCooldownMouse > 0) underdogCooldownMouse = Math.max(0, underdogCooldownMouse - dt);

      if (underdogCooldownChicken <= 0 && totalChickens <= 6 && totalMice >= 24) {
        underdogCooldownChicken = CRUSADE_COOLDOWN;
        playChargeHorn();
        addRecentEvent('👑📯 ROYAL TEMPLAR RELIEF! 6 Paladins emerge from the palace to save the capital from collapse!', 2);
        spawnGrandCrusade('chicken', 6);
      }

      if (underdogCooldownMouse <= 0 && totalMice <= 6 && totalChickens >= 24) {
        underdogCooldownMouse = CRUSADE_COOLDOWN;
        playChargeHorn();
        addRecentEvent('🧀⚡ CHEDDAR CITADEL RELIEF! 6 Heavy Templars emerge from deep burrows to defend the citadel!', 2);
        spawnGrandCrusade('mouse', 6);
      }

      // REGIMENTAL RECRUITING (15 Food per recruit; Cap 85 per side; keep a visible reserve!)
      const RECRUIT_FOOD_COST = 15;
      const FOOD_RESERVE = 25;
      if (chickenRecruitTimer > 2.2 && totalChickens < 85 && chickenGrain >= RECRUIT_FOOD_COST + FOOD_RESERVE) {
        chickenRecruitTimer = 0;
        const isSurge = Math.random() < 0.20;
        let count = isSurge ? (Math.random() < 0.3 ? 2 : 1) : 1;
        count = Math.min(count, Math.floor((chickenGrain - FOOD_RESERVE) / RECRUIT_FOOD_COST));
        if (count > 0) {
          chickenGrain -= count * RECRUIT_FOOD_COST;
          updateEconomyDisplay();
          if (isSurge && count > 1) {
            addRecentEvent(`⚡ SURGE: ${count} volunteer recruits joined the Chicken muster line! (-${count * RECRUIT_FOOD_COST} Grain)`, 1);
          }
          for (let s = 0; s < count; s++) spawnRecruit('chicken');
        }
      }

      if (mouseRecruitTimer > 2.2 && totalMice < 85 && mouseCheese >= RECRUIT_FOOD_COST + FOOD_RESERVE) {
        mouseRecruitTimer = 0;
        const isSurge = Math.random() < 0.20;
        let count = isSurge ? (Math.random() < 0.3 ? 2 : 1) : 1;
        count = Math.min(count, Math.floor((mouseCheese - FOOD_RESERVE) / RECRUIT_FOOD_COST));
        if (count > 0) {
          mouseCheese -= count * RECRUIT_FOOD_COST;
          updateEconomyDisplay();
          if (isSurge && count > 1) {
            addRecentEvent(`⚡ SURGE: ${count} volunteer recruits joined the Mouse muster line! (-${count * RECRUIT_FOOD_COST} Cheese)`, 1);
          }
          for (let s = 0; s < count; s++) spawnRecruit('mouse');
        }
      }

      }

      // Update active marching regiments
      activeRegiments.forEach(reg => {
        reg.update(dt, forwardDir, perpDir);
      });
      const matchClosing = finiteBattle && Math.min(totalChickens, totalMice) <= 4;
      if (finiteBattle) {
        for (const regiment of activeRegiments) {
          regiment.standingStrength = regiment.units.filter(unit => !unit.isDead && !unit.isRouted).length;
          if (matchClosing && regiment.state === 'LOCKSTEP_MARCH') regiment.state = 'ENGAGING';
        }
      }

      // Auto-save world state every 10 seconds while simulation is actively running
      if (!finiteBattle) {
      autoSaveTimer += dt;
      if (autoSaveTimer >= 10.0) {
        autoSaveTimer = 0;
        parent.postMessage({
          pluginMessage: {
            type: 'SAVE_WORLD_STATE',
            serializedState: JSON.stringify(serializeCurrentUiState())
          }
        }, '*');
      }

      }

      const crabsAlive = battleUnits.some(u => u.team === 'crab' && !u.isDead);
      const updates = [];

      // Reset target saturation counters on all units
      for (let i = 0; i < battleUnits.length; i++) {
        battleUnits[i].targetedCount = 0;
      }

      // Coordinated squad fallbacks and post-skirmish veteran merges are handled per-regiment in reg.update()

      // Helper function to trigger cascading casualty shock
      function triggerCasualtyShock(casualty) {
        if (!casualty._countedDeath && !casualty.isHarvester) {
          casualty._countedDeath = true;
          combatDeaths++;
        }

        battleUnits.forEach(ally => {
          if (ally.team === casualty.team && !ally.isDead && !ally.isRouted) {
            // Units in active melee engagement stand and fight!
            if (ally.regiment && ally.regiment.state === 'ENGAGING') return;

            const d = Math.hypot(ally.x - casualty.x, ally.y - casualty.y);
            if (d < 140) {
              const discipline = (ally.regiment && ally.regiment.captain && !ally.regiment.captain.isDead) ? 2 : 4;
              ally.morale -= discipline;
              if (ally.morale <= 0) {
                // If an enemy is within close melee range (< 80px), do not rout with backs exposed!
                let inCloseMelee = false;
                for (let ej = 0; ej < battleUnits.length; ej++) {
                  const foe = battleUnits[ej];
                  if (!foe.isDead && foe.team !== ally.team && Math.hypot(foe.x - ally.x, foe.y - ally.y) < 80) {
                    inCloseMelee = true;
                    break;
                  }
                }
                if (!inCloseMelee) {
                  ally.isRouted = true;
                  ally.isCharging = false;
                  ally.speedMultiplier = 1.35;
                }
              }
            }
          }
        });

        // If a captain/general was slain: regimental dismay
        if (casualty.isCaptain) {
          playCrabAlarm();
          addRecentEvent(`💀 GENERAL FALLEN! ${casualty.name} was slain in battle! Regimental morale shaken!`, 2);
          battleUnits.forEach(ally => {
            if (ally.team === casualty.team && !ally.isDead) {
              ally.morale -= 20;
              if (ally.morale <= 0) {
                ally.isRouted = true;
                ally.isCharging = false;
                ally.speedMultiplier = 1.35;
              }
            }
          });
        }
      }

      // DYNAMIC TRUCE & CEASEFIRE CHECK
      if (truceCooldown > 0) truceCooldown = Math.max(0, truceCooldown - dt);

      const totalCombatUnits = battleUnits.filter(u => !u.isDead && !u.isHarvester).length;
      if (totalCombatUnits > campaignCombatants) {
        campaignCombatants = totalCombatUnits;
      }

      const casualtyRatio = campaignCombatants > 0 ? (combatDeaths / campaignCombatants) : 0;
      const isExhausted = (combatDeaths >= 8 && casualtyRatio >= 0.65) || (totalCombatUnits < 4 && totalCombatUnits > 0 && combatDeaths >= 4);

      if (isExhausted) {
        exhaustionSustainTimer += dt;
      } else {
        exhaustionSustainTimer = 0;
      }

      if (!finiteBattle && !isTruce && truceCooldown <= 0 && exhaustionSustainTimer >= 3.0) {
        declareTruce(25.0);
        campaignCombatants = totalCombatUnits;
        combatDeaths = 0;
        exhaustionSustainTimer = 0;
      }

      if (isTruce) {
        truceTimer = Math.max(0, truceTimer - dt);
        battleUnits.forEach(bu => {
          if (!bu.isDead && bu.hp < bu.maxHp) {
            bu.hp = Math.min(bu.maxHp, bu.hp + 18.0 * dt);
          }
        });

        if (truceTimer <= 0) {
          isTruce = false;
          truceCooldown = 80.0;
          advanceTechEra();
          const living = battleUnits.filter(u => !u.isDead && !u.isHarvester).length;
          campaignCombatants = living;
          combatDeaths = 0;
          exhaustionSustainTimer = 0;
        }
      }

      updateProjectiles(dt);

      for (let i = 0; i < battleUnits.length; i++) {
        const u = battleUnits[i];
        let roadFactor = 1.0;

        if (u.isDead) {
          if (finiteBattle) continue; // Retain original stickers and score their losses.
          u.decayTimer -= dt;
          if (u.decayTimer <= 0) {
            parent.postMessage({ pluginMessage: { type: 'DESPAWN_UNIT', id: u.id } }, '*');
            battleUnits.splice(i, 1);
            i--;
          }
          continue;
        }

        if (u.chargeCd > 0) u.chargeCd -= dt;

        // Stun recovery from spear brace impales or heavy shock
        if (u.stunTimer > 0) {
          u.stunTimer -= dt;
          u.vx *= 0.50;
          u.vy *= 0.50;
          u.x += u.vx;
          u.y += u.vy;
          updates.push({ id: u.id, x: Math.round(u.x), y: Math.round(u.y), isDead: false, isRouted: u.isRouted, isBraced: false });
          continue;
        }

        // 0. HARVESTER LOGISTICS BEHAVIOR (Non-combatant resource gatherers)
        if (u.isHarvester) {
          // Check for nearby enemy raiders (< 160px)
          let enemyRaiderNear = false;
          for (let j = 0; j < battleUnits.length; j++) {
            const o = battleUnits[j];
            if (!o.isDead && o.team !== u.team && Math.hypot(o.x - u.x, o.y - u.y) < 160) {
              enemyRaiderNear = true;
              break;
            }
          }

          if (enemyRaiderNear) {
            u.isRouted = true;
            u.speedMultiplier = 1.45;
          }

          let baseRadius = 180;
          let homeX = u.startX, homeY = u.startY;
          if (liveBases) {
            const myBase = u.team === 'chicken' ? liveBases.chicken : liveBases.mouse;
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
              u.speedMultiplier = 1.0;
            }
          } else if (!u.hasCargo) {
            const targetNode = getResourceNodeForTeam(u.team, u);
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
                const harvestRate = isTruce ? 0.7 : 1.2;
                if (u.harvestTimer >= harvestRate) {
                  u.hasCargo = true;
                  u.harvestTimer = 0;
                  targetNode.capacity = Math.max(0, targetNode.capacity - 25);
                  dispatchBanner.textContent = `🚜 ${u.name} loaded heavy resource cargo from ${targetNode.name}!`;
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
              const amount = isTruce ? 35 : 25;
              if (u.team === 'chicken') chickenGrain += amount;
              else mouseCheese += amount;
              playHarvestChime();
              updateEconomyDisplay();
              dispatchBanner.textContent = u.team === 'chicken'
                ? `🌾 Granary Stockpile +${amount} Grain delivered by ${u.name}! (Total: ${chickenGrain})`
                : `🧀 Citadel Stockpile +${amount} Aged Cheese delivered by ${u.name}! (Total: ${mouseCheese})`;
            }
          }

          u.vx *= 0.80; u.vy *= 0.80;
          u.x += u.vx; u.y += u.vy;
          updates.push({ id: u.id, x: Math.round(u.x), y: Math.round(u.y), isDead: false, isRouted: u.isRouted, isBraced: false });
          continue;
        }

        // Paved Connector Highway Speed Boost (+70%)
        let onRoad = false;
        for (let r = 0; r < boardRoads.length; r++) {
          const rd = boardRoads[r];
          if (distToSegment(u.x, u.y, rd.x1, rd.y1, rd.x2, rd.y2) < 45) {
            onRoad = true;
            break;
          }
        }
        roadFactor = onRoad ? 1.70 : 1.0;
        const statusFactor = getUnitStatusFactor(u);
        u.speedMultiplier = statusFactor * roadFactor;

        // 1. MUSTER YARD HOLD: Units hold formation at base until regiment is fully formed
        if (u.regiment && u.regiment.state === 'ASSEMBLING') {
          let enemyNearMuster = false;
          for (let j = 0; j < battleUnits.length; j++) {
            const o = battleUnits[j];
            if (!o.isDead && o.team !== u.team && Math.hypot(o.x - u.x, o.y - u.y) < 260) {
              enemyNearMuster = true;
              break;
            }
          }
          if (enemyNearMuster) {
            u.regiment.dispatch();
          } else {
            const tx = u.slotX !== undefined ? u.slotX : (u.regiment.musterX || u.startX);
            const ty = u.slotY !== undefined ? u.slotY : (u.regiment.musterY || u.startY);
            u.vx += (tx - u.x) * 0.16;
            u.vy += (ty - u.y) * 0.16;
            u.vx *= 0.78;
            u.vy *= 0.78;
            u.x += u.vx;
            u.y += u.vy;
            updates.push({ id: u.id, x: Math.round(u.x), y: Math.round(u.y), isDead: false, isRouted: false, isBraced: false });
            continue;
          }
        }

        // 2. LOCKSTEP FORMATION MARCH
        const inFormationHold = u.regiment && u.regiment.state === 'LOCKSTEP_MARCH';

        // Update facing direction based on movement (holding units maintain forward-facing vigilance)
        const curVel = Math.hypot(u.vx, u.vy);
        if (u.isHoldingLine || (u.regiment && u.regiment.state === 'HOLDING_LINE')) {
          const marchSign = u.team === 'chicken' ? 1 : -1;
          u.facingX = forwardDir ? forwardDir.x * marchSign : marchSign;
          u.facingY = forwardDir ? forwardDir.y * marchSign : 0;
        } else if (curVel > 0.3) {
          u.facingX = u.vx / curVel;
          u.facingY = u.vy / curVel;
        }

        // Counter-zeal timer update
        if (u.counterZealTimer > 0) {
          u.counterZealTimer -= dt;
          if (u.counterZealTimer <= 0) u.speedMultiplier = 1.0;
        }

        // Spearmen bracing mechanic: Spearmen holding steady brace against incoming charges!
        if (u.canBrace && !u.isRouted && !inFormationHold) {
          if (curVel < 1.2 || u.isHoldingLine || (u.regiment && u.regiment.state === 'HOLDING_LINE')) {
            u.braceTimer += dt;
            if (u.braceTimer >= 0.7) u.isBraced = true;
          } else {
            u.braceTimer = 0;
            u.isBraced = false;
          }
        } else {
          u.isBraced = false;
        }

        // Captain Morale Rally: Captains periodically rally shaken troops nearby
        if (u.isCaptain && !u.isRouted && Math.random() < 0.02) {
          battleUnits.forEach(ally => {
            if (ally.team === u.team && !ally.isDead && !ally.isRouted && ally.morale < ally.maxMorale * 0.6) {
              if (Math.hypot(ally.x - u.x, ally.y - u.y) < 240) {
                ally.morale = Math.min(ally.maxMorale, ally.morale + 25);
              }
            }
          });
        }

        // 3. TACTICAL FALLBACK: Retreating units fall back to the nearest friendly group behind them!
        if (u.isRouted && finiteBattle) {
          rallyClassroomUnit(u, dt, matchClosing || (u.rallyCooldown || 0) > 0);
        } else if (u.isRouted) {
          const homeDirX = u.team === 'chicken' ? -1 : 1;
          let targetAlly = null;
          let minAllyDist = Infinity;

          // Search for friendly units behind u towards home
          for (let j = 0; j < battleUnits.length; j++) {
            const ally = battleUnits[j];
            if (ally.team === u.team && !ally.isDead && !ally.isRouted && ally !== u) {
              const alongFront = finiteBattle
                ? (ally.x - u.x) * forwardDir.x + (ally.y - u.y) * forwardDir.y
                : ally.x - u.x;
              const relX = alongFront * homeDirX;
              if (relX > 25) { // At least 25px behind towards safety
                const d = Math.hypot(ally.x - u.x, ally.y - u.y);
                if (d < minAllyDist) {
                  minAllyDist = d;
                  targetAlly = ally;
                }
              }
            }
          }

          let targetX, targetY;
          let isRallyingOnAllies = false;

          if (targetAlly && minAllyDist < 750) {
            // Fall back ~150-300px to the friendly ranks behind them!
            targetX = targetAlly.x;
            targetY = targetAlly.y;
            isRallyingOnAllies = true;
          } else {
            // No friendly reserves in sector: Fall back toward home base muster yard
            targetX = u.startX;
            targetY = u.startY;
            if (liveBases) {
              const myBase = u.team === 'chicken' ? liveBases.chicken : (u.team === 'mouse' ? liveBases.mouse : null);
              if (myBase) {
                targetX = myBase.cx;
                targetY = myBase.cy;
              }
            }
          }

          const hdx = targetX - u.x;
          const hdy = targetY - u.y;
          const hdist = Math.hypot(hdx, hdy) || 1;
          u.vx += (hdx / hdist) * 75 * dt * 2.2;
          u.vy += (hdy / hdist) * 75 * dt * 2.2;

          // RALLY ON FRIENDLY RANKS OR BASE!
          const rallyThreshold = isRallyingOnAllies ? 60 : 200;
          if (hdist < rallyThreshold) {
            u.isRouted = false;
            u.morale = Math.round(u.maxMorale * 0.75);
            u.speedMultiplier = 1.0;
            if (isRallyingOnAllies) {
              dispatchBanner.textContent = `🛡️ ${u.name} fell back and rallied upon friendly ranks!`;
            } else {
              dispatchBanner.textContent = `🛡️ ${u.name} reached base muster lines and rallied back to arms!`;
            }
          }
        }
        if (finiteBattle) u.rallyCooldown = Math.max(0, (u.rallyCooldown || 0) - dt);

        if (!inFormationHold && !u.isRouted) {
          // 4. BASE RAID BREACH CHECK (Allied strike force retreats in unison with plunder!)
          if (!finiteBattle && !u.hasPlunder && liveBases) {
            const enemyBase = u.team === 'chicken' ? liveBases.mouse : (u.team === 'mouse' ? liveBases.chicken : null);
            if (enemyBase) {
              const inBaseRect = (
                u.x >= enemyBase.x - 50 &&
                u.x <= enemyBase.x + enemyBase.width + 50 &&
                u.y >= enemyBase.y - 50 &&
                u.y <= enemyBase.y + enemyBase.height + 50
              );
              const inCenterDist = Math.hypot(enemyBase.cx - u.x, enemyBase.cy - u.y) < 320;

              if (inBaseRect || inCenterDist) {
                playChargeHorn();
                dispatchBanner.textContent = u.team === 'chicken'
                  ? '🏛️ CHICKEN RAID ON CHEDDAR CITADEL! Raiders seized cheese plunder & retreating to regroup!'
                  : '🏰 MOUSE RAID ON CLUCKINGHAM PALACE! Raiders seized grain plunder & retreating to regroup!';

                battleUnits.forEach(ally => {
                  if (ally.team === u.team && !ally.isDead) {
                    const dToEnemy = Math.hypot(enemyBase.cx - ally.x, enemyBase.cy - ally.y);
                    if (dToEnemy < 600) {
                      ally.hasPlunder = true;
                      ally.speedMultiplier = 1.45;
                      if (ally.regiment) ally.regiment.state = 'ENGAGING';
                    }
                  }
                });

                if (!enemyBase.alarmTriggered) {
                  enemyBase.alarmTriggered = true;
                  setTimeout(() => { enemyBase.alarmTriggered = false; }, 20000);
                  const defTeam = u.team === 'chicken' ? 'mouse' : 'chicken';
                  for (let g = 0; g < 3; g++) spawnRecruit(defTeam, true);
                }
              }
            }
          }

          // 5. PLUNDER RETREAT
          if (u.hasPlunder) {
            let homeX = u.startX, homeY = u.startY;
            let baseRadius = 180;
            if (liveBases) {
              const myBase = u.team === 'chicken' ? liveBases.chicken : (u.team === 'mouse' ? liveBases.mouse : null);
              if (myBase) {
                homeX = myBase.cx;
                homeY = myBase.cy;
                baseRadius = Math.min(myBase.width, myBase.height) * 0.5;
              }
            }
            const hdx = homeX - u.x;
            const hdy = homeY - u.y;
            const hdist = Math.hypot(hdx, hdy) || 1;
            u.vx += (hdx / hdist) * 65 * dt * 2.2;
            u.vy += (hdy / hdist) * 65 * dt * 2.2;

            if (hdist < baseRadius) {
              u.hasPlunder = false;
              u.speedMultiplier = 1.0;
              u.hp = u.maxHp;
              u.morale = u.maxMorale;
              dispatchBanner.textContent = u.team === 'chicken'
                ? '🌾 Chickens secured cheese plunder at Cluckingham Palace! HP fully restored!'
                : '🧀 Mice brought grain plunder back to Whiskerkeep! HP fully restored!';
            }
          }

          // 6. COMBAT TARGETING & DISCRETIONARY PURSUIT DOCTRINE (Only active if not fleeing or carrying plunder)
          if (!u.hasPlunder) {
          const isHoldingForwardLine = u.isHoldingLine || (u.regiment && u.regiment.state === 'HOLDING_LINE');

          let nearest = null;
          let minScore = Infinity;
          let canPursueRouted;
          let nearestOpponent = null;
          let nearestOpponentDistance = Infinity;

          for (let j = 0; j < battleUnits.length; j++) {
            const other = battleUnits[j];
            if (other.isDead) continue;

            let isTarget = false;
            if (u.team === 'crab') isTarget = other.team !== 'crab';
            else if (crabsAlive) isTarget = other.team === 'crab';
            else isTarget = other.team !== u.team;

            if (!isTarget) continue;

            const dx = other.x - u.x;
            const dy = other.y - u.y;
            const distanceSquared = dx * dx + dy * dy;
            if (finiteBattle && distanceSquared < nearestOpponentDistance) {
              nearestOpponent = other;
              nearestOpponentDistance = distanceSquared;
            }

            // Tactical vision radius: do not chase individual targets across the entire canvas!
            // When enemies are beyond local tactical vision, units march toward the enemy citadel!
            const maxTacticalVision = u.isCavalry ? 550 : 380;
            if (distanceSquared > maxTacticalVision * maxTacticalVision) continue;
            const dist = Math.sqrt(distanceSquared);

            // If holding the line, firmly hold position and only strike enemies entering contact (< 46px)
            if (isHoldingForwardLine && dist > 46) continue;

            // SMART PURSUIT DOCTRINE:
            // Only pursue retreating enemies if we have a CLEAR TACTICAL ADVANTAGE!
            // Otherwise, hold the conquered ground and do not overextend into enemy territory.
            if (other.isRouted && canPursueRouted === undefined) {
              let alliesNear = 0;
              let standingEnemiesNear = 0;
              for (let k = 0; k < battleUnits.length; k++) {
                const bu = battleUnits[k];
                if (bu.isDead) continue;
                const dFromUSquared = (bu.x - u.x) ** 2 + (bu.y - u.y) ** 2;
                if (dFromUSquared < 260 ** 2) {
                  if (bu.team === u.team) alliesNear++;
                  else if (!bu.isRouted) standingEnemiesNear++;
                }
              }

              // Clear advantage: 3+ allies and no standing enemies, or healthy cavalry with no standing enemies
              const hasClearAdvantage = (alliesNear >= 3 && standingEnemiesNear === 0) || (u.isCavalry && u.hp > u.maxHp * 0.70 && standingEnemiesNear === 0);

              canPursueRouted = hasClearAdvantage;
            }
            if (other.isRouted && !canPursueRouted) continue;

            // Frontline distribution penalty
            const saturationPenalty = (other.targetedCount || 0) * 80;
            let score = dist + saturationPenalty;

            if (other.isRouted) {
              score += 60; // Slight penalty so standing threats are still neutralized first
            }

            if (score < minScore) {
              minScore = score;
              nearest = other;
            }
          }

          // Keep moving to contact even when the last opponents are outside normal vision.
          if (finiteBattle && (!nearest || matchClosing)) nearest = nearestOpponent;
          if (nearest) {
            nearest.targetedCount = (nearest.targetedCount || 0) + 1;
            const dx = nearest.x - u.x;
            const dy = nearest.y - u.y;
            const dist = Math.hypot(dx, dy) || 1;
            const dirX = dx / dist;
            const dirY = dy / dist;

            // Facing target
            u.facingX = dirX;
            u.facingY = dirY;

            if (u.isCavalry && !u.isCharging && u.chargeCd <= 0 && dist > 80 && dist < 280) {
              u.isCharging = true;
            }

            const cruiseMultiplier = dist > 700 ? 1.6 : (dist > 350 ? 1.25 : 1.0);
            const baseSpeed = (u.isCharging ? 130 : (u.isCavalry ? 80 : 55)) * cruiseMultiplier;
            const speed = baseSpeed * (u.speedMultiplier || 1.0);

            if (u.isRanged && (!finiteBattle || (!matchClosing && dist >= 90))) {
              if (u.shootCd > 0) u.shootCd -= dt;
              const minRange = 90;
              const maxRange = u.isSiege ? 520 : 340;

              if (dist >= minRange && dist <= maxRange) {
                u.vx *= 0.65;
                u.vy *= 0.65;
                u.facingX = dirX;
                u.facingY = dirY;

                if (u.shootCd <= 0 && !isTruce) {
                  u.shootCd = u.isSiege ? (3.2 + Math.random() * 0.8) : (2.1 + Math.random() * 0.7);
                  playBowTwang();
                  const pType = u.isSiege ? (u.team === 'chicken' ? 'egg' : 'cheese') : (u.team === 'chicken' ? 'arrow' : 'stone');
                  const pDmg = u.isSiege ? 65 : (u.team === 'chicken' ? 28 : 24);
                  spawnProjectile(u.team, u.x, u.y, nearest.x, nearest.y, pType, pDmg);
                  dispatchBanner.textContent = u.isSiege 
                    ? `💣 SIEGE ENGINE: ${u.name} launched an explosive ${pType} boulder!`
                    : `🏹 MISSILE VOLLEY: ${u.name} loosed an arcing shot at ${nearest.name}!`;
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
            } else if (!isTruce) {
              // --- MELEE CLASH & TACTICAL ANGLE CALCULATION ---
              // Dot product between attack direction and defender facing:
              // < -0.3: Head-on attack (facing each other)
              // -0.3 to 0.4: Flank attack (hit from the side)
              // > 0.4: Rear attack (hit from behind!)
              const attackAlignment = dirX * (nearest.facingX || 1) + dirY * (nearest.facingY || 0);
              const isFlank = attackAlignment >= -0.3 && attackAlignment <= 0.4;
              const isRear = attackAlignment > 0.4;
              const angleMultiplier = isRear ? 1.65 : (isFlank ? 1.25 : 1.0);

              if (u.isCharging) {
                // A. CAVALRY CHARGE IMPACT
                u.isCharging = false;
                u.chargeCd = 4.5;

                // SPEAR BRACE COUNTER: Charging head-on into a braced spearman impales the cavalry!
                if (nearest.isBraced && attackAlignment < -0.3) {
                  playImpactThud(0.8);
                  u.hp -= 85; // Heavy impale damage
                  u.morale -= 50;
                  u.stunTimer = 1.8; // Knocked down
                  u.vx -= dirX * 24; // Recoil violently backwards
                  u.vy -= dirY * 24;
                  dispatchBanner.textContent = '🔱 SPEAR BRACE! Charging cavalry impaled on the spear hedge!';
                  if (u.hp <= 0) {
                    u.isDead = true;
                    triggerCasualtyShock(u);
                  } else if (u.morale <= 0 && !u.isRouted) {
                    u.isRouted = true;
                    u.speedMultiplier = 1.45;
                  }
                } else {
                  // TRAMPLE SHOCK: Smashing through infantry or flanked enemies!
                  const baseDmg = u.team === 'chicken' ? 65 : 55;
                  const trampleDmg = baseDmg * angleMultiplier * (u.isCrusading ? 1.15 : 1.0);
                  nearest.hp -= trampleDmg;
                  nearest.morale -= 35 * angleMultiplier;
                  nearest.vx += dirX * 22; // Violent trample knockback
                  nearest.vy += dirY * 22;

                  if (nearest.hp <= 0) {
                    nearest.isDead = true;
                    triggerCasualtyShock(nearest);
                  } else if (nearest.morale <= 0 && !nearest.isRouted) {
                    nearest.isRouted = true;
                    nearest.speedMultiplier = 1.45;
                    dispatchBanner.textContent = `🏳️ ${nearest.name} broke formation and is routing from cavalry shock!`;
                  }
                }
              } else {
                // B. SUSTAINED MELEE CLASH
                // Defensive shield wall reduces incoming damage by 60%!
                const defArmor = nearest.isDefending ? 0.40 : 1.0;
                const armor = (nearest.isCrab ? 0.75 : 1.0) * defArmor;
                const baseDmg = (u.team === 'chicken' ? 26 : 22) * angleMultiplier;
                const counterBonus = u.counterZealTimer > 0 ? 1.30 : 1.0;
                const veteranBonus = u.isVeteran ? 1.20 : 1.0;
                const dmg = (u.isCrusading ? baseDmg * 1.15 : baseDmg) * counterBonus * veteranBonus;
                nearest.hp -= dmg * dt * 2.0 * armor;

                // Gentle morale decay: only breaks under real heavy crisis, not light hits!
                nearest.morale -= dmg * dt * 0.18 * angleMultiplier;

                if (isRear && !nearest.isDefending) {
                  nearest.morale -= 10 * dt;
                }

                if (nearest.hp <= 0) {
                  nearest.isDead = true;
                  triggerCasualtyShock(nearest);
                } else if (nearest.morale <= 0 && !nearest.isRouted && !nearest.isDefending) {
                  nearest.isRouted = true;
                  nearest.speedMultiplier = 1.35;
                  dispatchBanner.textContent = `🏳️ ${nearest.name} fell back to seek friendly reinforcements!`;
                }
              }
            }
          } else if (!isHoldingForwardLine) {
            // No enemy detected and not holding line: Advance directly toward enemy base!
            let targetX = 0, targetY = 0;
            if (liveBases) {
              const eBase = u.team === 'chicken' ? liveBases.mouse : liveBases.chicken;
              if (eBase) {
                targetX = eBase.cx;
                targetY = eBase.cy;
              }
            } else {
              targetX = u.x + (u.team === 'chicken' ? 600 : -600);
              targetY = u.y;
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
        }

        // Anti-clumping separation physics
        for (let j = 0; !(finiteBattle && inFormationHold) && j < battleUnits.length; j++) {
          if (i === j) continue;
          const other = battleUnits[j];
          if (other.isDead) continue;
          const sx = u.x - other.x;
          const sy = u.y - other.y;
          const separationSquared = sx * sx + sy * sy;
          const desiredDist = 44;
          if (separationSquared < desiredDist * desiredDist && separationSquared > 0.000001) {
            const sDist = Math.sqrt(separationSquared);
            const overlap = desiredDist - sDist;
            const push = sDist < 28 
              ? Math.min(8.0, (overlap / sDist) * 0.45) 
              : (overlap / desiredDist) * 0.22;

            // CAPTAIN IMMUNITY TO ALLIED PUSH:
            // Regimental captains leading a march are NOT deflected off-course by their own troops!
            if (u.isCaptain && other.team === u.team) {
              continue; // Subordinates yield to the commander; commander holds the line of march
            }

            u.vx += (sx / sDist) * push;
            u.vy += (sy / sDist) * push;
          }
        }

        // Smooth obstacle avoidance with lateral steering (prevents sticking to obstacles!)
        for (let k = 0; k < boardObstacles.length; k++) {
          const obs = boardObstacles[k];
          const pad = 24;
          const left = obs.x - pad;
          const right = obs.x + obs.width + pad;
          const top = obs.y - pad;
          const bottom = obs.y + obs.height + pad;

          if (u.x > left && u.x < right && u.y > top && u.y < bottom) {
            const obsCy = obs.cy !== undefined ? obs.cy : (obs.y + obs.height / 2);
            // Lateral steering: smoothly steer UP or DOWN around the obstacle!
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

        // Playfield containment (wide canvas freedom without artificial center-squeezing)
        if (boardBounds) {
          if (boardBounds.minY !== undefined && u.y < boardBounds.minY) {
            u.y = boardBounds.minY;
            u.vy = Math.max(0, u.vy) + 2.0;
          } else if (boardBounds.maxY !== undefined && u.y > boardBounds.maxY) {
            u.y = boardBounds.maxY;
            u.vy = Math.min(0, u.vy) - 2.0;
          }

          if (boardBounds.minX !== undefined && u.x < boardBounds.minX) {
            u.x = boardBounds.minX;
            u.vx = Math.max(0, u.vx) + 2.0;
          } else if (boardBounds.maxX !== undefined && u.x > boardBounds.maxX) {
            u.x = boardBounds.maxX;
            u.vx = Math.min(0, u.vx) - 2.0;
          }
        }

        // Friction & adaptive maximum speed clamp
        u.vx *= 0.80;
        u.vy *= 0.80;
        const maxSpd = getUnitSpeedCeiling(u, roadFactor);
        const curSpd = Math.hypot(u.vx, u.vy);
        if (curSpd > maxSpd) {
          u.vx = (u.vx / curSpd) * maxSpd;
          u.vy = (u.vy / curSpd) * maxSpd;
        }

        u.x += u.vx;
        u.y += u.vy;

        // Capital Base Protection Circle
        if (!finiteBattle && liveBases) {
          const cBase = liveBases.chicken;
          const mBase = liveBases.mouse;

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
          if (!isTruce) {
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
                  u.speedMultiplier = 1.45;
                }
                if (u.hp <= 0) {
                  u.isDead = true;
                  triggerCasualtyShock(u);
                }
                break;
              }
            }
          }
        }

        updates.push({
          id: u.id,
          x: Math.round(u.x),
          y: Math.round(u.y),
          isDead: u.isDead,
          isRouted: u.isRouted,
          isBraced: u.isBraced, isDefending: !!u.isDefending
        });
      }

      if (!finiteBattle) {
      // 10 Hz throttled document rendering with single in-flight coalescing
      renderAccumulator += dt;
      if (renderAccumulator >= 0.10) {
        renderAccumulator -= 0.10;
        const changedUpdates = [];
        for (let uIdx = 0; uIdx < updates.length; uIdx++) {
          const u = updates[uIdx];
          const prev = lastAcknowledgedSnapshot.get(u.id);
          if (!prev || prev.x !== u.x || prev.y !== u.y || prev.isDead !== u.isDead || prev.isRouted !== u.isRouted || prev.isBraced !== u.isBraced || prev.isDefending !== u.isDefending) {
            changedUpdates.push(u);
          }
        }

        if (isRenderInFlight) {
          // Keep only newest replaceable snapshot while message is in flight
          pendingRenderSnapshot = { updates: changedUpdates, projectiles: activeProjectiles.slice(0, 12) };
        } else if (changedUpdates.length > 0 || activeProjectiles.length > 0) {
          sendRenderSnapshot(changedUpdates, activeProjectiles.slice(0, 12));
        }
      }

      // 1 Hz throttled board summary sync for spectators / canvas label
      boardSummaryTimer += dt;
      if (boardSummaryTimer >= 1.0) {
        boardSummaryTimer -= 1.0;
        const chickens = battleUnits.filter(u => u.team === 'chicken' && !u.isDead).length;
        const mice = battleUnits.filter(u => u.team === 'mouse' && !u.isDead).length;
        const crabs = battleUnits.filter(u => u.team === 'crab' && !u.isDead).length;
        const phaseFn = (typeof CluckCore !== 'undefined' && CluckCore.calculateCampaignPhase) ? CluckCore.calculateCampaignPhase : null;
        const campaignPhase = phaseFn ? phaseFn({
          isTruce,
          exhaustionSustainTimer,
          units: battleUnits,
          bases: liveBases,
          projectiles: activeProjectiles,
          regiments: activeRegiments
        }) : (isTruce ? 'RECOVERY' : 'CLASH');
        const eraName = techEra === 1 ? 'Era I: Tribal' : (techEra === 2 ? 'Era II: Feudal' : 'Era III: Imperial');
        const d = new Date();
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const summaryText = `Cluck & Squeak World Summary\nChickens: ${chickens} | Mice: ${mice} | Crabs: ${crabs}\nPhase: ${campaignPhase} | Era: ${eraName}\nLast synchronized at ${timeStr}; animate via plugin`;
        parent.postMessage({
          pluginMessage: {
            type: 'UPDATE_BOARD_SUMMARY',
            text: summaryText
          }
        }, '*');
      }

      // Throttled UI refresh (sidebar <= 4 Hz)
      sidebarUiTimer += dt;
      if (sidebarUiTimer >= 0.25) {
        sidebarUiTimer -= 0.25;
        updateMeters();
        updateEconomyDisplay();
        updateEraDisplay();
        if (diagReadout) {
          const livingUnits = battleUnits.filter(u => !u.isDead);
          const deadUnits = battleUnits.filter(u => u.isDead);
          const activeRegs = activeRegiments.filter(r => r.state !== 'BROKEN' && r.state !== 'MERGED');
          const chickens = livingUnits.filter(u => u.team === 'chicken').length;
          const mice = livingUnits.filter(u => u.team === 'mouse').length;
          const crabs = livingUnits.filter(u => u.team === 'crab').length;
          diagReadout.textContent = `[DIAGNOSTICS]
Living Units: ${livingUnits.length} (Chickens: ${chickens}, Mice: ${mice}, Crabs: ${crabs})
Casualties: ${deadUnits.length} | Inactive Regs: ${retiredRegiments.length}
Active Regiments: ${activeRegs.length} | Projectiles: ${activeProjectiles.length}
Food: Grain ${Math.round(chickenGrain)} / Cheese ${Math.round(mouseCheese)} | Era: ${techEra}
Render In-Flight: ${isRenderInFlight} (Seq #${renderSequence})
Truce Cooldown: ${Math.max(0, Math.round(truceCooldown))}s | Truce Timer: ${Math.max(0, Math.round(truceTimer))}s`;
        }
      }

      }

      // Prune retired regiments from activeRegiments registry
      const remaining = [];
      for (let r = 0; r < activeRegiments.length; r++) {
        const reg = activeRegiments[r];
        if (reg.state === 'MERGED' || reg.state === 'BROKEN') {
          retiredRegiments.push(reg);
        } else {
          remaining.push(reg);
        }
      }
      if (retiredRegiments.length > 30) {
        retiredRegiments.splice(0, retiredRegiments.length - 30);
      }
      activeRegiments = remaining;
      activeRegiments.find = function(fn) {
        return Array.prototype.find.call(this, fn) || retiredRegiments.find(fn);
      };
    }

    function getClassroomTactics() {
      return {
        initialize(nodes, formations, bases, bounds) {
          liveBases = bases;
          boardBounds = bounds;
          activeProjectiles = [];
          activeRegiments = [];
          retiredRegiments = [];
          battleUnits = nodes.map(createBattleUnit);
          const unitsById = new Map(battleUnits.map(unit => [unit.id, unit]));
          for (const formation of formations) {
            const members = formation.members.map(id => unitsById.get(id));
            const captain = members[0];
            const regiment = new Regiment(formation.team, formation.name, formation.shape, captain);
            regiment.advancePoint = formation.advancePoint;
            regiment.units = members;
            regiment.initialSize = members.length;
            for (const member of members) {
              member.regiment = regiment;
              member.formationOffsetX = member.x - captain.x;
              member.formationOffsetY = member.y - captain.y;
            }
            activeRegiments.push(regiment);
          }
          return battleUnits;
        },
        step(dt) { tickPerpetualWar(dt); },
        get projectiles() { return activeProjectiles; },
        get volleys() { return volleysFiredCount; },
        get regiments() { return activeRegiments; }
      };
    }
