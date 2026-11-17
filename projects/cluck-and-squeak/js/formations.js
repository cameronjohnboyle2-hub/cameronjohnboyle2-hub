/**
 * Formation generator for squads and unit placement in Cluck & Squeak
 */

import { Vector2 } from './math.js';
import { Unit } from './unit.js';

export class FormationGenerator {
  /**
   * Generates a 2D grid/phalanx of units
   */
  static createBox(typeKey, team, centerX, centerY, rows, cols, spacing = 28, heading = 0) {
    const units = [];
    const totalW = (cols - 1) * spacing;
    const totalH = (rows - 1) * spacing;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const localX = (c * spacing) - totalW / 2;
        const localY = (r * spacing) - totalH / 2;

        const rotated = new Vector2(localX, localY).rotate(heading);
        const worldX = centerX + rotated.x;
        const worldY = centerY + rotated.y;

        const u = new Unit(typeKey, worldX, worldY, team, heading);
        units.push(u);
      }
    }
    return units;
  }

  /**
   * Generates a cavalry wedge / chevron (pointed arrowhead)
   */
  static createWedge(typeKey, team, apexX, apexY, count, spacing = 26, heading = 0) {
    const units = [];
    // Apex unit
    units.push(new Unit(typeKey, apexX, apexY, team, heading));

    let placed = 1;
    let tier = 1;
    while (placed < count) {
      // Left wing
      if (placed < count) {
        const localX = -tier * spacing * 0.9;
        const localY = -tier * spacing * 0.7;
        const rotated = new Vector2(localX, localY).rotate(heading);
        units.push(new Unit(typeKey, apexX + rotated.x, apexY + rotated.y, team, heading));
        placed++;
      }
      // Right wing
      if (placed < count) {
        const localX = -tier * spacing * 0.9;
        const localY = tier * spacing * 0.7;
        const rotated = new Vector2(localX, localY).rotate(heading);
        units.push(new Unit(typeKey, apexX + rotated.x, apexY + rotated.y, team, heading));
        placed++;
      }
      tier++;
    }
    return units;
  }

  /**
   * Generates a straight line of units perpendicular to heading
   */
  static createLine(typeKey, team, startX, startY, count, spacing = 26, heading = 0) {
    const units = [];
    const totalLen = (count - 1) * spacing;
    for (let i = 0; i < count; i++) {
      const offset = (i * spacing) - totalLen / 2;
      // Perpendicular to heading
      const perpAngle = heading + Math.PI / 2;
      const x = startX + Math.cos(perpAngle) * offset;
      const y = startY + Math.sin(perpAngle) * offset;
      units.push(new Unit(typeKey, x, y, team, heading));
    }
    return units;
  }

  /**
   * Generates an echelon / angled wing of units
   */
  static createEchelon(typeKey, team, startX, startY, count, spacingX = 24, spacingY = 20, heading = 0) {
    const units = [];
    for (let i = 0; i < count; i++) {
      const localX = i * spacingX;
      const localY = i * spacingY;
      const rotated = new Vector2(localX, localY).rotate(heading);
      units.push(new Unit(typeKey, startX + rotated.x, startY + rotated.y, team, heading));
    }
    return units;
  }
}
