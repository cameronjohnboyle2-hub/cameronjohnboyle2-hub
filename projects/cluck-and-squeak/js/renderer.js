/**
 * High-Fidelity Sticker Renderer for Cluck & Squeak Battle Simulator
 * Renders procedural stickers for chickens & mice, Figma dot-grid, shadows, and combat FX.
 */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = 'figma'; // 'figma', 'meadow', 'dark'
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
  }

  setTheme(theme) {
    this.theme = theme;
  }

  render(game) {
    const { ctx, dpr } = this;
    const { camera, units, particleSystem, projectiles, placementPreview } = game;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Draw Background
    this.renderBackground(camera);

    // 2. Apply Camera Transform (Pan & Zoom)
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 3. Ground Decals (Egg yolk splatters, cheese crumbs)
    particleSystem.renderDecals(ctx);

    // 4. Dead Units (Fainted stickers)
    this.renderDeadUnits(units);

    // 5. Living Units (Sorted by Y for depth)
    const sortedUnits = units.filter(u => !u.isDead).sort((a, b) => a.pos.y - b.pos.y);
    for (let i = 0; i < sortedUnits.length; i++) {
      this.renderUnit(sortedUnits[i]);
    }

    // 6. Projectiles
    for (let i = 0; i < projectiles.length; i++) {
      projectiles[i].render(ctx);
    }

    // 7. Particles & Floating Text
    particleSystem.renderParticles(ctx);

    // 8. Placement Preview (If user is dragging a formation)
    if (placementPreview) {
      this.renderPlacementPreview(placementPreview);
    }

    // 9. Selected / Possessed Indicator
    if (game.possessedUnit && !game.possessedUnit.isDead) {
      this.renderPossessedReticle(game.possessedUnit);
    }

    ctx.restore(); // restore camera
    ctx.restore(); // restore dpr
  }

  renderBackground(camera) {
    const { ctx, width, height } = this;

    if (this.theme === 'figma') {
      // Figma Dot Grid Background
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, width, height);

      // Fast GPU-batched dots pattern (100x faster than thousands of separate arc() calls)
      ctx.fillStyle = '#d0d5dd';
      const spacing = 24 * camera.zoom;
      if (spacing > 7) {
        const startX = ((this.width / 2 - camera.x * camera.zoom) % spacing + spacing) % spacing;
        const startY = ((this.height / 2 - camera.y * camera.zoom) % spacing + spacing) % spacing;
        const dotSize = Math.max(1.5, Math.min(3.0, 2.2 * camera.zoom));

        for (let x = startX; x < width; x += spacing) {
          for (let y = startY; y < height; y += spacing) {
            ctx.fillRect(x - dotSize * 0.5, y - dotSize * 0.5, dotSize, dotSize);
          }
        }
      }
    } else if (this.theme === 'meadow') {
      ctx.fillStyle = '#85a86a';
      ctx.fillRect(0, 0, width, height);

      // Subtle grass texture lines
      ctx.fillStyle = '#78995e';
      const spacing = 36 * camera.zoom;
      const startX = ((this.width / 2 - camera.x * camera.zoom) % spacing + spacing) % spacing;
      const startY = ((this.height / 2 - camera.y * camera.zoom) % spacing + spacing) % spacing;
      for (let x = startX; x < width; x += spacing) {
        for (let y = startY; y < height; y += spacing) {
          ctx.beginPath();
          ctx.ellipse(x, y, 4 * camera.zoom, 2 * camera.zoom, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Dark Slate Arena
      ctx.fillStyle = '#141824';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#222938';
      ctx.lineWidth = 1;
      const spacing = 32 * camera.zoom;
      const startX = ((this.width / 2 - camera.x * camera.zoom) % spacing + spacing) % spacing;
      const startY = ((this.height / 2 - camera.y * camera.zoom) % spacing + spacing) % spacing;

      ctx.beginPath();
      for (let x = startX; x < width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
  }

  renderDeadUnits(units) {
    const { ctx } = this;
    const deadUnits = units.filter(u => u.isDead);

    for (let i = 0; i < deadUnits.length; i++) {
      const u = deadUnits[i];
      ctx.save();
      ctx.translate(u.pos.x, u.pos.y);
      ctx.rotate(u.heading + Math.PI / 2);
      ctx.globalAlpha = 0.55;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.ellipse(0, 0, u.size * 0.9, u.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Render upside-down or dizzy sticker
      if (u.team === 'chicken') {
        this.drawChickenSticker(ctx, u, true);
      } else {
        this.drawMouseSticker(ctx, u, true);
      }

      // Dizzy stars or tombstone cross
      ctx.fillStyle = '#8c8c8c';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('x_x', -7, -u.size - 2);

      ctx.restore();
    }
  }

  renderUnit(u) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(u.pos.x, u.pos.y);

    // 1. Shadow underneath
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, u.size * 0.45, u.size * 0.85, u.size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Flinch & rotation transform
    const flinchScale = u.flinchAnim > 0 ? 1.15 : 1.0;
    ctx.scale(flinchScale, flinchScale);

    // Charge speed lines
    if (u.isCharging) {
      this.drawChargeAura(ctx, u);
    }

    // 3. Draw Character Sticker
    ctx.save();
    ctx.rotate(u.heading);
    if (u.team === 'chicken') {
      this.drawChickenSticker(ctx, u, false);
    } else if (u.team === 'crab') {
      this.drawCrabSticker(ctx, u, false);
    } else {
      this.drawMouseSticker(ctx, u, false);
    }
    ctx.restore();

    // 4. Overlays: Health Bar & Morale / Rout
    this.drawUnitOverlays(ctx, u);

    ctx.restore();
  }

  drawChargeAura(ctx, u) {
    ctx.save();
    ctx.rotate(u.heading);
    ctx.strokeStyle = u.team === 'chicken' ? 'rgba(255, 77, 79, 0.5)' : 'rgba(250, 173, 20, 0.5)';
    ctx.lineWidth = 2.5;

    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-u.size * 1.5, i * u.size * 0.5);
      ctx.lineTo(-u.size * 2.8, i * u.size * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Procedural Chicken Sticker (matches Figma sticker look!)
   */
  drawChickenSticker(ctx, u, isDead) {
    const s = u.size;
    const waddle = isDead ? 0 : Math.sin(u.walkAnimPhase) * 0.18;
    const attackOffset = u.attackAnimPhase * 8;

    ctx.rotate(waddle);

    // --- Tail Feathers ---
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.ellipse(-s * 0.7, -s * 0.1, s * 0.35, s * 0.55, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Main Plump Body (White Sticker) ---
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0 + attackOffset * 0.3, 0, s * 0.85, s * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // --- Flapping Wing ---
    const wingAngle = isDead ? 0 : Math.sin(u.walkAnimPhase * 1.5) * 0.4;
    ctx.save();
    ctx.translate(-s * 0.15, s * 0.2);
    ctx.rotate(wingAngle);
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.45, s * 0.28, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // --- Red Comb (3 lobes) on top of head ---
    ctx.fillStyle = '#ff4d4f';
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.65, s * 0.22, 0, Math.PI * 2);
    ctx.arc(s * 0.4, -s * 0.72, s * 0.25, 0, Math.PI * 2);
    ctx.arc(s * 0.6, -s * 0.65, s * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // --- Red Wattle (under beak) ---
    ctx.fillStyle = '#f5222d';
    ctx.beginPath();
    ctx.ellipse(s * 0.65, s * 0.28, s * 0.15, s * 0.25, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // --- Golden Beak ---
    ctx.fillStyle = '#ffc53d';
    ctx.beginPath();
    ctx.moveTo(s * 0.68 + attackOffset, -s * 0.1);
    ctx.lineTo(s * 1.15 + attackOffset, 0.05 * s);
    ctx.lineTo(s * 0.68 + attackOffset, s * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fa8c16';
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Eye ---
    if (!isDead) {
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(s * 0.42, -s * 0.18, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Eye shine
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * 0.44, -s * 0.21, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Equipment & Weapons ---
    // Rooster Knight: Helmet + Plume + Toothpick Lance
    if (u.hasLance) {
      this.drawLance(ctx, s, attackOffset, '#ff4d4f');
    }
    if (u.hasPlume) {
      // Silver helmet
      ctx.fillStyle = '#8c8c8c';
      ctx.beginPath();
      ctx.arc(s * 0.35, -s * 0.45, s * 0.35, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#595959';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Waving plume
      ctx.fillStyle = '#ff1100';
      ctx.beginPath();
      ctx.ellipse(s * 0.2, -s * 0.95, s * 0.2, s * 0.4, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Halberd for Comb Guard
    if (u.hasHalberd) {
      this.drawHalberd(ctx, s, attackOffset);
    }

    // Egg Basket for Trebuchet
    if (u.projectileType === 'egg') {
      ctx.fillStyle = '#873800';
      ctx.fillRect(-s * 0.8, -s * 0.4, s * 0.5, s * 0.7);
      ctx.fillStyle = '#d48806';
      ctx.beginPath();
      ctx.arc(-s * 0.55, -s * 0.4, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Golden Crown for Hero Mega Cockatrice
    if (u.isHero) {
      ctx.fillStyle = '#faad14';
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.7);
      ctx.lineTo(s * 0.25, -s * 1.1);
      ctx.lineTo(s * 0.4, -s * 0.8);
      ctx.lineTo(s * 0.55, -s * 1.15);
      ctx.lineTo(s * 0.7, -s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d48806';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /**
   * Procedural Mouse Sticker (matches Figma sticker look!)
   */
  drawMouseSticker(ctx, u, isDead) {
    const s = u.size;
    const scamper = isDead ? 0 : Math.sin(u.walkAnimPhase) * 0.15;
    const attackOffset = u.attackAnimPhase * 8;

    ctx.rotate(scamper);

    // --- Sinuous Tail ---
    const tailSwish = Math.sin(u.walkAnimPhase * 1.2) * 0.4;
    ctx.strokeStyle = '#d48872';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, 0);
    ctx.quadraticCurveTo(-s * 1.3, tailSwish * s, -s * 1.7, -tailSwish * s * 0.8);
    ctx.stroke();

    // If Rat King, has 3 tails tied together!
    if (u.isHero) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.2);
      ctx.quadraticCurveTo(-s * 1.4, -s * 0.6, -s * 1.8, -s * 0.8);
      ctx.moveTo(-s * 0.7, s * 0.2);
      ctx.quadraticCurveTo(-s * 1.4, s * 0.6, -s * 1.8, s * 0.8);
      ctx.stroke();
    }

    // --- Round Mouse Body (Gray Sticker) ---
    ctx.fillStyle = '#bfbfbf';
    ctx.beginPath();
    ctx.ellipse(0 + attackOffset * 0.2, 0, s * 0.82, s * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8c8c8c';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // --- Cute Round Ears (Outer Gray + Inner Pink) ---
    // Left ear (top)
    ctx.fillStyle = '#bfbfbf';
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.65, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffa39e';
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.65, s * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // Right ear (bottom)
    ctx.fillStyle = '#bfbfbf';
    ctx.beginPath();
    ctx.arc(-s * 0.1, s * 0.65, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffa39e';
    ctx.beginPath();
    ctx.arc(-s * 0.1, s * 0.65, s * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // --- Pointy Snout & Pink Nose ---
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.moveTo(s * 0.4 + attackOffset, -s * 0.35);
    ctx.lineTo(s * 0.95 + attackOffset, 0);
    ctx.lineTo(s * 0.4 + attackOffset, s * 0.35);
    ctx.closePath();
    ctx.fill();

    // Pink nose tip
    ctx.fillStyle = '#ff85c0';
    ctx.beginPath();
    ctx.arc(s * 0.95 + attackOffset, 0, s * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(s * 0.75 + attackOffset, -s * 0.1);
    ctx.lineTo(s * 1.3 + attackOffset, -s * 0.45);
    ctx.moveTo(s * 0.75 + attackOffset, s * 0.1);
    ctx.lineTo(s * 1.3 + attackOffset, s * 0.45);
    ctx.stroke();

    // Eyes
    if (!isDead) {
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(s * 0.38, -s * 0.25, s * 0.11, 0, Math.PI * 2);
      ctx.arc(s * 0.38, s * 0.25, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * 0.4, -s * 0.27, s * 0.04, 0, Math.PI * 2);
      ctx.arc(s * 0.4, s * 0.23, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Mouse Equipment ---
    // Toothpick Spear & Shield
    if (u.hasSpear) {
      this.drawToothpickSpear(ctx, s, attackOffset, u.isBraced);
    }
    if (u.hasShield) {
      this.drawBottlecapShield(ctx, s);
    }
    if (u.hasCheeseShield) {
      this.drawCheeseShield(ctx, s);
      this.drawLance(ctx, s, attackOffset, '#faad14');
    }
    if (u.projectileType === 'needle') {
      this.drawCrossbow(ctx, s, attackOffset);
    }

    // Crown for Rat King
    if (u.isHero) {
      ctx.fillStyle = '#faad14';
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, -s * 0.4);
      ctx.lineTo(0, -s * 0.8);
      ctx.lineTo(s * 0.15, -s * 0.5);
      ctx.lineTo(s * 0.3, -s * 0.85);
      ctx.lineTo(s * 0.45, -s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawLance(ctx, s, attackOffset, flagColor) {
    ctx.save();
    // Long wooden pole
    ctx.strokeStyle = '#873800';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.3);
    ctx.lineTo(s * 1.9 + attackOffset, s * 0.3);
    ctx.stroke();

    // Sharp steel tip
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.moveTo(s * 1.9 + attackOffset, s * 0.15);
    ctx.lineTo(s * 2.5 + attackOffset, s * 0.3);
    ctx.lineTo(s * 1.9 + attackOffset, s * 0.45);
    ctx.closePath();
    ctx.fill();

    // Pennant Flag
    ctx.fillStyle = flagColor;
    ctx.beginPath();
    ctx.moveTo(s * 1.5 + attackOffset, s * 0.3);
    ctx.lineTo(s * 1.1 + attackOffset, s * 0.05);
    ctx.lineTo(s * 1.5 + attackOffset, s * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawToothpickSpear(ctx, s, attackOffset, isBraced) {
    ctx.save();
    ctx.strokeStyle = '#d48806';
    ctx.lineWidth = 2.0;

    const angle = isBraced ? -0.1 : 0.05;
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.35);
    ctx.lineTo(s * 1.8 + attackOffset, s * 0.35);
    ctx.stroke();

    // Pointed wooden tip
    ctx.fillStyle = '#ffe58f';
    ctx.beginPath();
    ctx.moveTo(s * 1.8 + attackOffset, s * 0.25);
    ctx.lineTo(s * 2.2 + attackOffset, s * 0.35);
    ctx.lineTo(s * 1.8 + attackOffset, s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawBottlecapShield(ctx, s) {
    ctx.fillStyle = '#1890ff';
    ctx.beginPath();
    ctx.arc(s * 0.2, s * 0.4, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#096dd9';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s * 0.2, s * 0.4, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCheeseShield(ctx, s) {
    // Triangular cheese wedge shield
    ctx.fillStyle = '#ffc53d';
    ctx.beginPath();
    ctx.moveTo(s * 0.1, s * 0.1);
    ctx.lineTo(s * 0.6, s * 0.4);
    ctx.lineTo(s * 0.1, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d48806';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cheese holes
    ctx.fillStyle = '#ad6800';
    ctx.beginPath();
    ctx.arc(s * 0.25, s * 0.35, s * 0.08, 0, Math.PI * 2);
    ctx.arc(s * 0.35, s * 0.5, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHalberd(ctx, s, attackOffset) {
    ctx.strokeStyle = '#595959';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.3);
    ctx.lineTo(s * 1.9 + attackOffset, -s * 0.3);
    ctx.stroke();

    // Axe crescent blade
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(s * 1.6 + attackOffset, -s * 0.5, s * 0.3, 0, Math.PI);
    ctx.fill();
  }

  drawCrossbow(ctx, s, attackOffset) {
    ctx.fillStyle = '#873800';
    ctx.fillRect(s * 0.3, s * 0.2, s * 0.8, s * 0.18);
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s * 0.9, s * 0.29, s * 0.3, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }

  /**
   * Procedural River Crab Sticker
   */
  drawCrabSticker(ctx, u, isDead) {
    const s = u.size;
    const scuttle = isDead ? 0 : Math.sin(u.walkAnimPhase * 2.0) * 0.16;
    ctx.rotate(scuttle);

    // Realistic FigJam Crab Sticker rendering
    ctx.font = `${Math.round(s * 1.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦀', 0, 0);

    // If attacking, snap pinchers with sparkles
    if (u.attackAnimPhase > 0) {
      ctx.fillStyle = '#ff4d4f';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('💥', s * 0.8, -s * 0.6);
    }
  }

  drawUnitOverlays(ctx, u) {
    const s = u.size;

    // Health Bar (Only if injured or hero)
    if (u.hp < u.maxHp || u.isHero) {
      const barW = s * 1.8;
      const barH = 3.5;
      const barX = -barW / 2;
      const barY = -s * 1.3;

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // HP fill
      const pct = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#52c41a' : pct > 0.25 ? '#faad14' : '#f5222d';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    // Rout / Panic Icon
    if (u.isRouted) {
      ctx.fillStyle = '#ff4d4f';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('😱', 0, -s * 1.4);
    } else if (u.isBraced) {
      ctx.fillStyle = '#52c41a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️', 0, -s * 1.4);
    }
  }

  renderPlacementPreview(preview) {
    const { ctx } = this;
    const { start, current, typeKey, team, formationType } = preview;

    ctx.save();
    // Line from start to current
    ctx.strokeStyle = team === 'chicken' ? 'rgba(255, 77, 79, 0.6)' : 'rgba(24, 144, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();

    // Direction arrow
    const angle = Math.atan2(current.y - start.y, current.x - start.x);
    ctx.fillStyle = team === 'chicken' ? '#ff4d4f' : '#1890ff';
    ctx.beginPath();
    ctx.arc(current.x, current.y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderPossessedReticle(u) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(u.pos.x, u.pos.y);

    // Glowing reticle under possessed unit
    ctx.strokeStyle = '#ffd666';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, u.size * 1.8, 0, Math.PI * 2);
    ctx.stroke();

    // Text banner above unit
    ctx.fillStyle = '#ffd666';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU (POSSESSED)', 0, -u.size * 1.8);

    ctx.restore();
  }
}
