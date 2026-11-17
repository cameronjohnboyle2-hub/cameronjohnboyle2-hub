/**
 * Particle and FX Engine for Cluck & Squeak Battle Simulator
 * Handles feathers, cheese crumbs, dust, egg splatters, and floating text.
 */

import { Vector2, randRange } from './math.js';

export class Particle {
  constructor(x, y, vx, vy, life, color, size, type = 'circle') {
    this.pos = new Vector2(x, y);
    this.vel = new Vector2(vx, vy);
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.type = type; // 'feather', 'crumb', 'dust', 'ring', 'splat'
    this.rot = randRange(0, Math.PI * 2);
    this.vRot = randRange(-5, 5);
    this.alpha = 1.0;
    this.drag = 0.94;
  }

  update(dt) {
    this.life -= dt;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.pos.add(this.vel.clone().scale(dt * 60));
    this.vel.scale(this.drag);
    this.rot += this.vRot * dt;
    return this.life > 0;
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rot);
    ctx.globalAlpha = this.alpha;

    if (this.type === 'feather') {
      // Stylized oval feather with quill stem
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size * 2, this.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-this.size * 2, 0);
      ctx.lineTo(this.size * 2, 0);
      ctx.stroke();
    } else if (this.type === 'crumb') {
      // Little jagged cheese cube
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      ctx.fillStyle = '#d48806';
      ctx.fillRect(-this.size / 4, -this.size / 4, this.size / 3, this.size / 3);
    } else if (this.type === 'dust') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * (1 + (1 - this.alpha) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3 * this.alpha;
      ctx.beginPath();
      const currentRadius = this.size * (1 + (1 - this.alpha) * 2.5);
      ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class FloatingText {
  constructor(text, x, y, color = '#ff4d4f', size = 16, isCrit = false) {
    this.text = text;
    this.pos = new Vector2(x, y);
    this.vel = new Vector2(randRange(-0.5, 0.5), randRange(-1.8, -2.5));
    this.color = color;
    this.size = size;
    this.isCrit = isCrit;
    this.life = 0.8;
    this.maxLife = 0.8;
    this.alpha = 1.0;
  }

  update(dt) {
    this.life -= dt;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.pos.add(this.vel.clone().scale(dt * 60));
    this.vel.y += 0.05; // slight deceleration
    return this.life > 0;
  }

  render(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.font = `bold ${this.size}px "Inter", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text outline
    ctx.strokeStyle = '#000000bb';
    ctx.lineWidth = 3;
    ctx.strokeText(this.text, this.pos.x, this.pos.y);

    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.pos.x, this.pos.y);
    ctx.restore();
  }
}

export class SplatDecal {
  constructor(x, y, radius, color = '#fadb14', type = 'egg_yolk') {
    this.pos = new Vector2(x, y);
    this.radius = radius;
    this.color = color;
    this.type = type;
    this.life = 35.0; // lasts 35 seconds
    this.maxLife = 35.0;
    this.alpha = 0.9;
    this.blobs = [];

    // Generate random splatter droplets around center
    const blobCount = Math.floor(randRange(5, 9));
    for (let i = 0; i < blobCount; i++) {
      const angle = randRange(0, Math.PI * 2);
      const dist = randRange(radius * 0.4, radius * 1.3);
      const r = randRange(radius * 0.2, radius * 0.45);
      this.blobs.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: r
      });
    }
  }

  update(dt) {
    this.life -= dt;
    if (this.life < 5.0) {
      this.alpha = (this.life / 5.0) * 0.9;
    }
    return this.life > 0;
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.globalAlpha = this.alpha;

    // Egg white outer puddle
    ctx.fillStyle = 'rgba(255, 255, 230, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Central yolk blob
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Splattered droplet blobs
    for (const b of this.blobs) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Specular shine highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-this.radius * 0.25, -this.radius * 0.25, this.radius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.decals = [];
  }

  clear() {
    this.particles = [];
    this.texts = [];
    this.decals = [];
  }

  spawnFeathers(x, y, count = 5, color = '#f5f5f5') {
    for (let i = 0; i < count; i++) {
      const speed = randRange(2, 6);
      const angle = randRange(0, Math.PI * 2);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const pColor = Math.random() > 0.4 ? color : '#ff4d4f';
      this.particles.push(new Particle(x, y, vx, vy, randRange(0.6, 1.2), pColor, randRange(3, 5), 'feather'));
    }
  }

  spawnCrumbs(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
      const speed = randRange(2, 5.5);
      const angle = randRange(0, Math.PI * 2);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const colors = ['#fadb14', '#faad14', '#d48806'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push(new Particle(x, y, vx, vy, randRange(0.5, 0.9), color, randRange(3, 5), 'crumb'));
    }
  }

  spawnDust(x, y, count = 3, size = 6) {
    for (let i = 0; i < count; i++) {
      const speed = randRange(0.5, 2);
      const angle = randRange(0, Math.PI * 2);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particles.push(new Particle(x, y, vx, vy, randRange(0.3, 0.6), 'rgba(200, 190, 170, 0.35)', size, 'dust'));
    }
  }

  spawnShockwave(x, y, radius = 40, color = 'rgba(255, 220, 120, 0.8)') {
    const p = new Particle(x, y, 0, 0, 0.35, color, radius, 'ring');
    p.drag = 1.0;
    this.particles.push(p);
  }

  spawnYolkSplat(x, y, radius = 22) {
    this.decals.push(new SplatDecal(x, y, radius));
    this.spawnDust(x, y, 6, 8);
  }

  spawnDamageText(text, x, y, color = '#ff4d4f', size = 15, isCrit = false) {
    this.texts.push(new FloatingText(text, x, y, color, size, isCrit));
  }

  update(dt) {
    this.decals = this.decals.filter(d => d.update(dt));
    this.particles = this.particles.filter(p => p.update(dt));
    this.texts = this.texts.filter(t => t.update(dt));
  }

  renderDecals(ctx) {
    for (let i = 0; i < this.decals.length; i++) {
      this.decals[i].render(ctx);
    }
  }

  renderParticles(ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].render(ctx);
    }
    for (let i = 0; i < this.texts.length; i++) {
      this.texts[i].render(ctx);
    }
  }
}
