/**
 * Unit Entity and AI State Machine for Cluck & Squeak Battle Simulator
 */

import { Vector2, clamp, randRange, angleDiff, lerpAngle } from './math.js';
import { audio } from './audio.js';
import { Projectile } from './projectiles.js';

export const UNIT_CONFIGS = {
  // --- CHICKENS ---
  cluck_pecker: {
    name: 'Cluck Pecker',
    team: 'chicken',
    category: 'infantry',
    hp: 95,
    speed: 70,
    mass: 1.0,
    damage: 18,
    attackRange: 18,
    attackCooldown: 0.65,
    chargeBonus: 1.4,
    chargeSpeed: 105,
    size: 15,
    morale: 80,
    color: '#ffffff',
    icon: '🐔'
  },
  rooster_knight: {
    name: 'Rooster Knight',
    team: 'chicken',
    category: 'cavalry',
    hp: 155,
    speed: 85,
    mass: 2.5,
    damage: 24,
    attackRange: 24,
    attackCooldown: 1.1,
    chargeBonus: 2.2,
    chargeSpeed: 120,
    knockback: 4,
    size: 19,
    morale: 110,
    color: '#ffffff',
    hasLance: true,
    hasPlume: true,
    icon: '🐓'
  },
  comb_guard: {
    name: 'Comb Guard',
    team: 'chicken',
    category: 'spear',
    hp: 125,
    speed: 55,
    mass: 1.3,
    damage: 20,
    attackRange: 28,
    attackCooldown: 0.85,
    chargeBonus: 1.0,
    chargeSpeed: 65,
    size: 16,
    morale: 95,
    canBrace: true,
    hasHalberd: true,
    icon: '🐔'
  },
  egg_trebuchet: {
    name: 'Egg Slinger',
    team: 'chicken',
    category: 'artillery',
    hp: 80,
    speed: 45,
    mass: 1.2,
    damage: 42,
    attackRange: 280,
    minRange: 75,
    attackCooldown: 2.6,
    chargeBonus: 1.0,
    chargeSpeed: 50,
    size: 16,
    morale: 65,
    projectileType: 'egg',
    splashRadius: 65,
    icon: '🥚'
  },
  mega_cockatrice: {
    name: 'Mega Cockatrice',
    team: 'chicken',
    category: 'hero',
    hp: 850,
    speed: 85,
    mass: 6.5,
    damage: 65,
    attackRange: 35,
    attackCooldown: 1.3,
    chargeBonus: 2.8,
    chargeSpeed: 150,
    knockback: 22,
    size: 32,
    morale: 300,
    isHero: true,
    icon: '👑'
  },

  // --- MICE ---
  spearmouse: {
    name: 'Toothpick Spearmouse',
    team: 'mouse',
    category: 'spear',
    hp: 135,
    speed: 60,
    mass: 1.2,
    damage: 22,
    attackRange: 38,
    attackCooldown: 0.8,
    chargeBonus: 1.0,
    chargeSpeed: 70,
    size: 14,
    morale: 105,
    canBrace: true,
    hasSpear: true,
    hasShield: true,
    icon: '🐭'
  },
  mouse_swarmer: {
    name: 'Mouse Swarmer',
    team: 'mouse',
    category: 'infantry',
    hp: 95,
    speed: 72,
    mass: 0.9,
    damage: 17,
    attackRange: 18,
    attackCooldown: 0.55,
    chargeBonus: 1.3,
    chargeSpeed: 100,
    size: 13,
    morale: 85,
    icon: '🐭'
  },
  cheese_knight: {
    name: 'Cheese Knight',
    team: 'mouse',
    category: 'cavalry',
    hp: 185,
    speed: 90,
    mass: 2.6,
    damage: 30,
    attackRange: 24,
    attackCooldown: 1.0,
    chargeBonus: 2.8,
    chargeSpeed: 125,
    knockback: 4,
    size: 18,
    morale: 115,
    hasCheeseShield: true,
    hasLance: true,
    icon: '🧀'
  },
  needle_crossbow: {
    name: 'Needle Crossbowmouse',
    team: 'mouse',
    category: 'ranged',
    hp: 75,
    speed: 60,
    mass: 0.9,
    damage: 24,
    attackRange: 230,
    minRange: 45,
    attackCooldown: 1.5,
    chargeBonus: 1.0,
    chargeSpeed: 60,
    size: 14,
    morale: 70,
    projectileType: 'needle',
    icon: '🏹'
  },
  rat_king: {
    name: 'The Rat King',
    team: 'mouse',
    category: 'hero',
    hp: 800,
    speed: 82,
    mass: 6.0,
    damage: 60,
    attackRange: 32,
    attackCooldown: 1.2,
    chargeBonus: 2.5,
    chargeSpeed: 145,
    knockback: 20,
    size: 30,
    morale: 300,
    isHero: true,
    icon: '👑'
  },

  // --- WILDCARD / REBALANCING ---
  river_crab: {
    name: 'River Crab',
    team: 'crab',
    category: 'wildcard',
    hp: 220,
    speed: 68,
    mass: 2.2,
    damage: 26,
    attackRange: 28,
    attackCooldown: 0.75,
    chargeBonus: 1.2,
    chargeSpeed: 80,
    knockback: 5,
    size: 20,
    morale: 200,
    color: '#e05263',
    icon: '🦀'
  }
};

let nextUnitId = 1;

export class Unit {
  constructor(typeKey, x, y, team = null, angle = 0) {
    const config = UNIT_CONFIGS[typeKey] || UNIT_CONFIGS.cluck_pecker;
    this.id = nextUnitId++;
    this.typeKey = typeKey;
    this.name = config.name;
    this.team = team || config.team;
    this.category = config.category;

    this.pos = new Vector2(x, y);
    this.vel = new Vector2(0, 0);
    this.heading = angle;
    this.targetHeading = angle;

    this.maxHp = config.hp;
    this.hp = this.maxHp;
    this.baseSpeed = config.speed;
    this.speed = this.baseSpeed;
    this.mass = config.mass;
    this.damage = config.damage;
    this.attackRange = config.attackRange;
    this.attackCooldown = config.attackCooldown;
    this.attackTimer = randRange(0, this.attackCooldown * 0.5);

    this.chargeBonus = config.chargeBonus || 1.0;
    this.chargeSpeed = config.chargeSpeed || this.baseSpeed * 1.5;
    this.knockback = config.knockback || 5;
    this.size = config.size;
    this.canBrace = !!config.canBrace;
    this.isHero = !!config.isHero;
    this.projectileType = config.projectileType || null;
    this.splashRadius = config.splashRadius || 0;
    this.minRange = config.minRange || 0;

    // Visual attributes
    this.hasPlume = !!config.hasPlume;
    this.hasLance = !!config.hasLance;
    this.hasHalberd = !!config.hasHalberd;
    this.hasShield = !!config.hasShield;
    this.hasCheeseShield = !!config.hasCheeseShield;

    // Morale & Rout
    this.maxMorale = config.morale || 100;
    this.morale = this.maxMorale;
    this.isRouted = false;

    // Combat State Machine
    // States: 'IDLE', 'MARCH', 'CHARGE', 'ENGAGED', 'BRACED', 'STUNNED', 'ROUT', 'POSSESSED'
    this.state = 'IDLE';
    this.targetUnit = null;
    this.formationOffset = null; // offset from squad center
    this.squad = null;
    this.isBraced = false;

    // Charge momentum
    this.isCharging = false;
    this.chargeCooldown = 0;
    this.chargeDistTraveled = 0;

    // Timers & buffs
    this.stunTimer = 0;
    this.debuffs = new Map(); // name -> { duration, factor }

    // Animations
    this.walkAnimPhase = randRange(0, Math.PI * 2);
    this.attackAnimPhase = 0; // 0 = idle, 1 -> 0 thrust
    this.flinchAnim = 0;
    this.killCount = 0;
    this.damageDealt = 0;
    this.isDead = false;
    this.isPossessed = false;

    // Special ability timer
    this.specialTimer = randRange(3, 8);
  }

  applyDebuff(name, duration, factor) {
    this.debuffs.set(name, { duration, factor });
  }

  takeDamage(amount, attacker = null, damageType = 'melee') {
    if (this.isDead) return;

    this.hp -= amount;
    this.flinchAnim = 0.25;
    if (attacker) attacker.damageDealt += amount;

    // Morale loss
    this.morale -= amount * 0.35;
    if (this.morale <= 0 && !this.isHero && !this.isRouted) {
      this.route();
    }

    if (this.hp <= 0) {
      this.die(attacker);
    }
  }

  route() {
    this.isRouted = true;
    this.state = 'ROUT';
    this.isCharging = false;
    audio.playMouseSqueak(0.8);
  }

  die(killer = null) {
    this.isDead = true;
    this.hp = 0;
    if (killer) {
      killer.killCount++;
    }
  }

  brace() {
    if (this.canBrace) {
      this.isBraced = true;
      this.state = 'BRACED';
    }
  }

  unbrace() {
    this.isBraced = false;
  }

  update(dt, game) {
    if (this.isDead) return;

    // Update debuffs
    let speedFactor = 1.0;
    for (const [name, debuff] of this.debuffs.entries()) {
      debuff.duration -= dt;
      speedFactor *= debuff.factor;
      if (debuff.duration <= 0) {
        this.debuffs.delete(name);
      }
    }

    if (this.chargeCooldown > 0) {
      this.chargeCooldown -= dt;
    }

    // Animation progress
    if (this.flinchAnim > 0) this.flinchAnim -= dt;
    if (this.attackAnimPhase > 0) this.attackAnimPhase = Math.max(0, this.attackAnimPhase - dt * 4.5);

    // Stunned State
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.pos.add(this.vel.clone().scale(dt * 60));
      this.vel.scale(0.88);
      this.walkAnimPhase += dt * 15; // dizzy spin
      return;
    }

    // Possessed by Player
    if (this.isPossessed) {
      this.updatePossessed(dt, game, speedFactor);
      return;
    }

    // Rout / Panic state
    if (this.isRouted) {
      this.updateRout(dt, game, speedFactor);
      return;
    }

    // Normal Combat AI State
    this.updateAI(dt, game, speedFactor);

    // Strict velocity clamp so units never shoot across the screen
    const maxSpd = this.isCharging ? 3.2 : 2.0;
    const curLen = this.vel.length();
    if (curLen > maxSpd) {
      this.vel.scale(maxSpd / curLen);
    }

    // Physical movement integration
    this.pos.add(this.vel.clone().scale(dt * 60));
    this.vel.scale(0.85); // friction

    // Heading smooth lerp
    this.heading = lerpAngle(this.heading, this.targetHeading, dt * 10);
  }

  updateAI(dt, game, speedFactor) {
    const { spatialGrid, particleSystem, projectiles } = game;

    // Periodically search for nearest target if current is dead or invalid
    if (!this.targetUnit || this.targetUnit.isDead) {
      this.targetUnit = this.findBestTarget(game);
    }

    // Hero special abilities
    this.updateSpecialAbilities(dt, game);

    if (!this.targetUnit) {
      // March toward frontline if no target in direct sight
      this.state = 'MARCH';
      const marchDir = this.team === 'chicken' ? 1 : (this.team === 'mouse' ? -1 : 0);
      this.vel.x += marchDir * (this.speed * 0.45 * dt * speedFactor);
      this.targetHeading = marchDir > 0 ? 0 : Math.PI;
      this.walkAnimPhase += dt * 6;
      return;
    }

    const distToTarget = this.pos.dist(this.targetUnit.pos);
    const toTarget = this.targetUnit.pos.clone().sub(this.pos);
    const targetAngle = toTarget.angle();
    this.targetHeading = targetAngle;

    // Ranged / Artillery Units
    if (this.projectileType) {
      this.updateRangedAI(dt, distToTarget, toTarget, game, speedFactor);
      return;
    }

    // Melee & Cavalry Units
    // Check if cavalry can charge
    const isShockUnit = this.category === 'cavalry' || this.isHero;
    const canStartCharge = isShockUnit && !this.isCharging && this.chargeCooldown <= 0 && distToTarget > 90 && distToTarget < 260;

    if (canStartCharge) {
      this.startCharge();
    }

    if (this.isCharging) {
      this.updateCharge(dt, distToTarget, toTarget, game, speedFactor);
      return;
    }

    // Normal Advance or Melee Engagement
    if (distToTarget <= this.attackRange) {
      // In Attack Range
      this.state = 'ENGAGED';
      this.attackTimer += dt;
      if (this.attackTimer >= this.attackCooldown) {
        this.performMeleeAttack(this.targetUnit, game);
        this.attackTimer = 0;
      }
    } else {
      // March towards enemy
      this.state = 'MARCH';
      const moveSpeed = this.baseSpeed * speedFactor;
      const desiredVel = toTarget.normalize().scale(moveSpeed * 0.016);
      this.vel.lerp(desiredVel, 0.25);
      this.walkAnimPhase += dt * (moveSpeed / 10);

      // Spearmice brace if cavalry is rushing towards them!
      if (this.canBrace && this.targetUnit.isCharging && distToTarget < 120) {
        this.brace();
      } else {
        this.unbrace();
      }
    }

    // Soft collision separation against allies to prevent bunching
    this.applySeparation(spatialGrid);
  }

  startCharge() {
    this.isCharging = true;
    this.state = 'CHARGE';
    this.chargeDistTraveled = 0;

    if (this.team === 'chicken') {
      audio.playChargeHorn(true);
      if (Math.random() > 0.5) audio.playRoosterCrow();
    } else {
      audio.playChargeHorn(false);
      audio.playMouseSqueak(1.3);
    }
  }

  updateCharge(dt, distToTarget, toTarget, game, speedFactor) {
    const { particleSystem } = game;
    const chargeSpeed = this.chargeSpeed * speedFactor;
    const moveVel = toTarget.normalize().scale(chargeSpeed * 0.016);
    this.vel.lerp(moveVel, 0.4);
    this.walkAnimPhase += dt * 25;
    this.chargeDistTraveled += chargeSpeed * dt;

    // Emit dust puffs
    if (Math.random() < 0.4) {
      particleSystem.spawnDust(this.pos.x, this.pos.y, 2, 5);
    }

    // Check impact
    if (distToTarget <= this.attackRange + 10) {
      this.resolveChargeImpact(this.targetUnit, game);
    }
  }

  resolveChargeImpact(target, game) {
    const { particleSystem } = game;
    this.isCharging = false;
    this.chargeCooldown = 4.0; // Charge enters cooldown

    // Check if target is bracing and facing us
    const angleDifference = Math.abs(angleDiff(this.heading, target.heading + Math.PI));
    const targetBraced = target.canBrace && (target.isBraced || angleDifference < Math.PI * 0.45);

    if (targetBraced) {
      // CRITICAL REVERSE DAMAGE! Impaled on spears!
      const recoilDamage = this.damage * 2.2;
      this.takeDamage(recoilDamage, target, 'impale');
      this.stunTimer = 0.9;
      this.vel.scale(-0.5);

      audio.playClash();
      particleSystem.spawnDamageText('BRACED!', target.pos.x, target.pos.y - 20, '#52c41a', 18, true);
      particleSystem.spawnDamageText(`-${Math.round(recoilDamage)}`, this.pos.x, this.pos.y - 20, '#ff4d4f', 16, true);
      particleSystem.spawnShockwave(this.pos.x, this.pos.y, 35, '#52c41a');
      return;
    }

    // Successful devastating charge!
    const isFlanked = Math.abs(angleDiff(this.heading, target.heading)) < Math.PI * 0.5;
    const bonus = isFlanked ? this.chargeBonus * 1.5 : this.chargeBonus;
    const totalDamage = this.damage * bonus;

    target.takeDamage(totalDamage, this, 'charge');

    // Knockback physics impulse
    const knockDir = Vector2.fromAngle(this.heading);
    target.vel.add(knockDir.scale(this.knockback));
    target.stunTimer = 0.45;

    // Audio & Juice
    audio.playImpactThud(1.3);
    particleSystem.spawnShockwave(target.pos.x, target.pos.y, 50, '#faad14');

    if (target.team === 'mouse') {
      particleSystem.spawnCrumbs(target.pos.x, target.pos.y, 10);
      audio.playMouseSqueak(1.1);
    } else {
      particleSystem.spawnFeathers(target.pos.x, target.pos.y, 10);
      audio.playCluck(1.1);
    }

    const text = isFlanked ? 'FLANK CRIT!' : 'CHARGE!';
    particleSystem.spawnDamageText(text, target.pos.x, target.pos.y - 20, '#f5222d', 18, true);
  }

  performMeleeAttack(target, game) {
    const { particleSystem } = game;
    this.attackAnimPhase = 1.0;

    // Check flanking
    const angleDifference = Math.abs(angleDiff(this.heading, target.heading));
    const isFlank = angleDifference < Math.PI * 0.45; // Attacking from behind!

    let dmg = this.damage * randRange(0.85, 1.15);
    if (isFlank) {
      dmg *= 1.6;
      particleSystem.spawnDamageText('BACKSTAB!', target.pos.x, target.pos.y - 15, '#fa8c16', 15);
    }

    target.takeDamage(dmg, this, 'melee');

    // Light knockback
    const push = Vector2.fromAngle(this.heading).scale(1.5);
    target.vel.add(push);

    // Audio & particles
    audio.playClash();
    if (this.team === 'chicken') {
      if (Math.random() < 0.4) audio.playCluck();
      particleSystem.spawnCrumbs(target.pos.x, target.pos.y, 3);
    } else {
      if (Math.random() < 0.4) audio.playMouseSqueak();
      particleSystem.spawnFeathers(target.pos.x, target.pos.y, 3);
    }
  }

  updateRangedAI(dt, distToTarget, toTarget, game, speedFactor) {
    const { projectiles, particleSystem } = game;

    if (distToTarget < this.minRange) {
      // Too close! Back pedal / kite away
      const awayDir = toTarget.normalize().scale(-1);
      this.vel.lerp(awayDir.scale(this.baseSpeed * speedFactor * 0.016), 0.2);
      this.walkAnimPhase += dt * 10;
    } else if (distToTarget > this.attackRange) {
      // Advance to get into range
      this.vel.lerp(toTarget.normalize().scale(this.baseSpeed * speedFactor * 0.016), 0.2);
      this.walkAnimPhase += dt * 10;
    } else {
      // In range, aim and fire!
      this.vel.scale(0.8);
      this.attackTimer += dt;
      if (this.attackTimer >= this.attackCooldown) {
        this.attackTimer = 0;
        this.attackAnimPhase = 1.0;

        if (this.projectileType === 'egg') {
          audio.playEggLaunch();
          projectiles.push(new Projectile(this.pos, this.targetUnit.pos, 320, this.damage, this.team, {
            type: 'egg',
            splashRadius: this.splashRadius,
            owner: this
          }));
        } else if (this.projectileType === 'needle') {
          audio.playClash();
          projectiles.push(new Projectile(this.pos, this.targetUnit.pos, 480, this.damage, this.team, {
            type: 'needle',
            owner: this
          }));
        }
      }
    }
  }

  updateSpecialAbilities(dt, game) {
    if (!this.isHero) return;
    this.specialTimer -= dt;
    if (this.specialTimer <= 0) {
      this.specialTimer = randRange(7, 11);

      if (this.typeKey === 'mega_cockatrice') {
        // Cockatrice Shockwave Crow!
        audio.playRoosterCrow();
        game.particleSystem.spawnShockwave(this.pos.x, this.pos.y, 90, '#f5222d');
        game.particleSystem.spawnDamageText('MEGA CROW!', this.pos.x, this.pos.y - 30, '#f5222d', 20, true);

        const enemies = game.spatialGrid.queryRadius(this.pos, 110, u => u.team !== this.team);
        enemies.forEach(e => {
          e.takeDamage(35, this, 'roar');
          e.stunTimer = 0.8;
          const push = e.pos.clone().sub(this.pos).normalize().scale(16);
          e.vel.add(push);
        });
      } else if (this.typeKey === 'rat_king') {
        // Rat King Whirling Cleave!
        audio.playMouseSqueak(0.7);
        game.particleSystem.spawnShockwave(this.pos.x, this.pos.y, 80, '#fa8c16');
        game.particleSystem.spawnDamageText('RAT CLEAVE!', this.pos.x, this.pos.y - 30, '#fa8c16', 20, true);

        const enemies = game.spatialGrid.queryRadius(this.pos, 95, u => u.team !== this.team);
        enemies.forEach(e => {
          e.takeDamage(40, this, 'cleave');
          const push = e.pos.clone().sub(this.pos).normalize().scale(14);
          e.vel.add(push);
        });
      }
    }
  }

  updateRout(dt, game, speedFactor) {
    const { particleSystem } = game;
    // Flee away from nearest enemy
    const nearestEnemy = this.findNearestEnemy(game);
    let fleeDir;
    if (nearestEnemy) {
      fleeDir = this.pos.clone().sub(nearestEnemy.pos).normalize();
    } else {
      fleeDir = Vector2.fromAngle(this.heading);
    }

    this.targetHeading = fleeDir.angle();
    this.heading = lerpAngle(this.heading, this.targetHeading, dt * 10);

    const fleeSpeed = this.baseSpeed * 1.35 * speedFactor;
    this.vel.lerp(fleeDir.scale(fleeSpeed * 0.016), 0.3);
    this.walkAnimPhase += dt * 25;

    // Spawn panic sweat drop or text occasionally
    if (Math.random() < 0.03) {
      particleSystem.spawnDamageText('PANIC!', this.pos.x, this.pos.y - 15, '#ffa39e', 13);
    }
  }

  updatePossessed(dt, game, speedFactor) {
    const { input, particleSystem } = game;

    // Movement from WASD / Arrow Keys
    const move = new Vector2(0, 0);
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) move.y -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) move.y += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) move.x -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) move.x += 1;

    // Aim towards mouse position in world coordinates
    const toCursor = input.worldMouse.clone().sub(this.pos);
    this.targetHeading = toCursor.angle();
    this.heading = lerpAngle(this.heading, this.targetHeading, dt * 18);

    const isSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const sprintMod = isSprint ? 1.6 : 1.0;
    const moveSpeed = this.baseSpeed * speedFactor * sprintMod;

    if (move.lengthSq() > 0) {
      move.normalize();
      this.vel.lerp(move.scale(moveSpeed * 0.016), 0.35);
      this.walkAnimPhase += dt * (moveSpeed / 7);
      if (isSprint && Math.random() < 0.35) {
        particleSystem.spawnDust(this.pos.x, this.pos.y, 1, 4);
      }
    } else {
      this.vel.scale(0.8);
    }

    // Manual Attack with Left Mouse Button or Space
    if (input.isDown('Space') || input.isMouseDown) {
      this.attackTimer += dt;
      if (this.attackTimer >= this.attackCooldown) {
        this.attackTimer = 0;
        this.attackAnimPhase = 1.0;

        if (this.projectileType) {
          // Fire ranged
          if (this.projectileType === 'egg') {
            audio.playEggLaunch();
            game.projectiles.push(new Projectile(this.pos, input.worldMouse, 340, this.damage, this.team, {
              type: 'egg',
              splashRadius: this.splashRadius,
              owner: this
            }));
          } else {
            audio.playClash();
            game.projectiles.push(new Projectile(this.pos, input.worldMouse, 480, this.damage, this.team, {
              type: 'needle',
              owner: this
            }));
          }
        } else {
          // Melee attack towards cursor
          const hitTargets = game.spatialGrid.queryRadius(this.pos, this.attackRange + 15, u => u.team !== this.team);
          if (hitTargets.length > 0) {
            this.performMeleeAttack(hitTargets[0], game);
          } else {
            audio.playClash();
          }
        }
      }
    }
  }

  applySeparation(spatialGrid) {
    const neighbors = spatialGrid.queryRadius(this.pos, this.size * 2.2, u => u !== this && !u.isDead);
    for (let i = 0; i < neighbors.length; i++) {
      const other = neighbors[i];
      const diff = this.pos.clone().sub(other.pos);
      const d = diff.length();
      const minDist = this.size + other.size;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        const push = diff.normalize().scale(overlap * 0.25);
        this.pos.add(push);
      }
    }
  }

  findBestTarget(game) {
    const { units, activeScenario } = game;
    let closest = null;
    let closestDistSq = Infinity;

    // Check if any crabs are alive on the field!
    const crabsAlive = units.some(u => u.team === 'crab' && !u.isDead);

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead) continue;

      let isTarget = false;
      if (this.team === 'crab') {
        // Crabs attack both chickens and mice!
        isTarget = u.team !== 'crab';
      } else if (crabsAlive) {
        // Impromptu alliance: Chickens & mice prioritize crabs!
        isTarget = u.team === 'crab';
      } else {
        // Normal warfare
        isTarget = u.team !== this.team;
      }

      if (!isTarget) continue;

      const dSq = this.pos.distSq(u.pos);
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closest = u;
      }
    }
    return closest;
  }

  findNearestEnemy(game) {
    return this.findBestTarget(game);
  }
}
