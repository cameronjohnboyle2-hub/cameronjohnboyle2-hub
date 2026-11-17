/**
 * Projectiles system for Cluck & Squeak Battle Simulator
 * Handles arcing ballistic eggs, flying needle bolts, and cheese bombs.
 */

import { Vector2 } from './math.js';
import { audio } from './audio.js';

export class Projectile {
  constructor(startPos, targetPos, speed, damage, team, options = {}) {
    this.startPos = startPos.clone();
    this.pos = startPos.clone();
    this.targetPos = targetPos.clone();
    this.team = team;
    this.damage = damage;
    this.speed = speed;
    this.isDead = false;

    this.type = options.type || 'egg'; // 'egg', 'needle', 'cheese_bomb'
    this.splashRadius = options.splashRadius || 0;
    this.owner = options.owner || null;

    const dist = this.startPos.dist(this.targetPos);
    this.totalDuration = Math.max(0.2, dist / speed);
    this.elapsed = 0;
    this.arcHeight = options.arcHeight || (dist * 0.35);

    this.rot = Math.atan2(this.targetPos.y - this.startPos.y, this.targetPos.x - this.startPos.x);
    this.z = 0; // vertical ballistic height
  }

  update(dt, spatialGrid, particleSystem, game) {
    if (this.isDead) return;

    this.elapsed += dt;
    const progress = Math.min(1.0, this.elapsed / this.totalDuration);

    if (this.type === 'egg' || this.type === 'cheese_bomb') {
      // Lerp 2D position along ground line
      this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * progress;
      this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * progress;
      // Parabolic ballistic formula
      this.z = 4 * this.arcHeight * progress * (1 - progress);

      // Wobble egg
      this.rot += dt * 8;

      if (progress >= 1.0) {
        this.explode(spatialGrid, particleSystem, game);
        this.isDead = true;
      }
    } else if (this.type === 'needle') {
      // Direct linear dart
      this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * progress;
      this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * progress;

      // Check collision along flight
      const hitRadius = 14;
      const targets = spatialGrid.queryRadius(this.pos, hitRadius, u => u.team !== this.team);
      if (targets.length > 0 || progress >= 1.0) {
        if (targets.length > 0) {
          const target = targets[0];
          target.takeDamage(this.damage, this.owner, 'ranged');
          particleSystem.spawnCrumbs(this.pos.x, this.pos.y, 4);
          audio.playClash();
        }
        this.isDead = true;
      }
    }
  }

  explode(spatialGrid, particleSystem, game) {
    if (this.type === 'egg') {
      audio.playEggSplat();
      particleSystem.spawnYolkSplat(this.pos.x, this.pos.y, 30);
      particleSystem.spawnShockwave(this.pos.x, this.pos.y, 45, 'rgba(255, 200, 50, 0.7)');

      // Splash damage & yolk slow to enemies in radius
      const targets = spatialGrid.queryRadius(this.pos, this.splashRadius || 60, u => u.team !== this.team);
      targets.forEach(target => {
        const dist = target.pos.dist(this.pos);
        const falloff = 1 - (dist / (this.splashRadius || 60)) * 0.5;
        target.takeDamage(this.damage * falloff, this.owner, 'siege');
        target.applyDebuff('yolk_slow', 4.0, 0.45); // slows down to 45% speed for 4s
        // Knockback away from explosion center
        const pushDir = target.pos.clone().sub(this.pos).normalize();
        target.vel.add(pushDir.scale(5));
      });
    } else if (this.type === 'cheese_bomb') {
      audio.playImpactThud(0.8);
      particleSystem.spawnCrumbs(this.pos.x, this.pos.y, 14);
      particleSystem.spawnShockwave(this.pos.x, this.pos.y, 50, 'rgba(250, 173, 20, 0.8)');

      const targets = spatialGrid.queryRadius(this.pos, this.splashRadius || 55, u => u.team !== this.team);
      targets.forEach(target => {
        target.takeDamage(this.damage, this.owner, 'blunt');
        const pushDir = target.pos.clone().sub(this.pos).normalize();
        target.vel.add(pushDir.scale(6));
      });
    }
  }

  render(ctx) {
    if (this.isDead) return;

    ctx.save();
    // 1. Draw shadow on ground
    const shadowScale = Math.max(0.4, 1 - (this.z / (this.arcHeight + 1)) * 0.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y, 7 * shadowScale, 3.5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw projectile elevated by this.z
    const renderY = this.pos.y - this.z;
    ctx.translate(this.pos.x, renderY);
    ctx.rotate(this.rot);

    if (this.type === 'egg') {
      // Speckled brown egg shape
      ctx.fillStyle = '#e0b589';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#c99667';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Egg speckles
      ctx.fillStyle = '#9c6f44';
      ctx.beginPath();
      ctx.arc(-2, -1, 1, 0, Math.PI * 2);
      ctx.arc(3, 2, 1.2, 0, Math.PI * 2);
      ctx.arc(1, -3, 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'needle') {
      // Sewing needle projectile with metallic shine and thread tail
      ctx.strokeStyle = '#d9d9d9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();

      // Sharp tip
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(6, -2);
      ctx.lineTo(6, 2);
      ctx.closePath();
      ctx.fill();

      // Thread tail
      ctx.strokeStyle = '#ff7875';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-18, 0);
      ctx.stroke();
    } else if (this.type === 'cheese_bomb') {
      // Big round cheese ball with holes
      ctx.fillStyle = '#faad14';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d48806';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ad6800';
      ctx.beginPath();
      ctx.arc(-2, -2, 2, 0, Math.PI * 2);
      ctx.arc(3, 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
