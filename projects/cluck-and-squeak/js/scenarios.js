/**
 * Battle Scenarios for Cluck & Squeak Battle Simulator
 * Includes direct recreation of the user's Figma sticker battle!
 */

import { FormationGenerator } from './formations.js';
import { Unit } from './unit.js';

export const SCENARIOS = [
  {
    id: 'figma_classic',
    name: 'The Figma Battle (As Acted Out!)',
    description: 'Exact recreation of the epic battle from Figma! The Chicken Phalanx anchors the south, while echelon cavalry wings sweep the north flank against the fortified mouse lines.',
    init: () => {
      const units = [];

      // 1. CHICKEN PHALANX (Bottom-Left)
      // Dense block of peckers & comb guards
      const phalanxX = 180;
      const phalanxY = 520;
      units.push(...FormationGenerator.createBox('cluck_pecker', 'chicken', phalanxX, phalanxY, 5, 6, 26, 0));
      // Front row comb guards
      for (let i = 0; i < 6; i++) {
        units.push(new Unit('comb_guard', phalanxX + 78, phalanxY - 52 + i * 26, 'chicken', 0));
      }

      // 2. CENTER SKIRMISH SCREEN (Single file column of 6 chickens)
      const skirmishX = 520;
      const skirmishY = 520;
      for (let i = 0; i < 6; i++) {
        units.push(new Unit('cluck_pecker', skirmishX, skirmishY - 65 + i * 26, 'chicken', 0));
      }

      // 3. UPPER FLANKING CAVALRY WINGS (Sweeping around north to envelope)
      // Top-Left Vanguard
      units.push(new Unit('rooster_knight', 260, 210, 'chicken', 0.2));
      units.push(new Unit('rooster_knight', 285, 175, 'chicken', 0.2));
      units.push(new Unit('rooster_knight', 260, 270, 'chicken', 0.2));
      units.push(new Unit('rooster_knight', 260, 330, 'chicken', 0.2));

      // Flank Screen (pairs)
      units.push(new Unit('rooster_knight', 350, 235, 'chicken', 0.3));
      units.push(new Unit('rooster_knight', 355, 255, 'chicken', 0.3));
      units.push(new Unit('rooster_knight', 418, 235, 'chicken', 0.3));
      units.push(new Unit('rooster_knight', 423, 255, 'chicken', 0.3));

      // Main Envelopment Wing 1 (curving downward towards mouse rear)
      const wing1X = 480;
      const wing1Y = 220;
      for (let i = 0; i < 6; i++) {
        units.push(new Unit('rooster_knight', wing1X + i * 25, wing1Y + i * 2, 'chicken', 0.35));
      }

      // Main Envelopment Wing 2 (outer sweep)
      units.push(new Unit('rooster_knight', 475, 150, 'chicken', 0.3));
      units.push(new Unit('rooster_knight', 495, 165, 'chicken', 0.3));
      units.push(new Unit('rooster_knight', 535, 105, 'chicken', 0.45));
      units.push(new Unit('rooster_knight', 540, 125, 'chicken', 0.45));
      units.push(new Unit('rooster_knight', 565, 170, 'chicken', 0.4));
      units.push(new Unit('rooster_knight', 475, 330, 'chicken', 0.2));
      units.push(new Unit('rooster_knight', 475, 270, 'chicken', 0.2));

      // 4. MOUSE DEFENSE (Center Battalion)
      const mouseCenter = 650;
      const mouseCenterY = 580;
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', mouseCenter, mouseCenterY, 5, 2, 25, Math.PI));
      // Scout mouse
      units.push(new Unit('mouse_swarmer', mouseCenter + 35, mouseCenterY - 50, 'mouse', Math.PI));

      // 5. MOUSE REARGUARD / RESERVE (Far Right)
      const reserveX = 960;
      const reserveY = 560;
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', reserveX, reserveY, 7, 2, 25, Math.PI));
      // Needle snipers behind the rearguard
      units.push(new Unit('needle_crossbow', reserveX + 45, reserveY - 40, 'mouse', Math.PI));
      units.push(new Unit('needle_crossbow', reserveX + 45, reserveY + 40, 'mouse', Math.PI));

      return units;
    }
  },

  {
    id: 'cavalry_charge',
    name: 'Rooster Lance Charge vs Toothpick Phalanx',
    description: 'A frontal charge of 24 Rooster Knights into a braced mouse spear wall! Will the charge break the line or be impaled?',
    init: () => {
      const units = [];
      // 24 Rooster Knights in double wedge
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 280, 400, 16, 30, 0));
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 200, 240, 8, 30, 0.2));
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 200, 560, 8, 30, -0.2));

      // Mouse Spearmice in fortified line
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', 780, 400, 8, 3, 26, Math.PI));
      // Flanking cheese knights
      units.push(...FormationGenerator.createLine('cheese_knight', 'mouse', 840, 220, 6, 28, Math.PI));
      units.push(...FormationGenerator.createLine('cheese_knight', 'mouse', 840, 580, 6, 28, Math.PI));

      return units;
    }
  },

  {
    id: 'egg_artillery',
    name: 'The Great Egg Bombardment',
    description: 'Chicken Egg Slingers lob explosive yolk artillery into fortified mouse positions while infantry clash in the valley.',
    init: () => {
      const units = [];
      // Egg Slingers backline
      for (let i = 0; i < 6; i++) {
        units.push(new Unit('egg_trebuchet', 150, 260 + i * 50, 'chicken', 0));
      }
      // Chicken Frontline
      units.push(...FormationGenerator.createBox('comb_guard', 'chicken', 350, 390, 6, 3, 26, 0));
      units.push(...FormationGenerator.createLine('cluck_pecker', 'chicken', 440, 390, 10, 26, 0));

      // Mouse Armored Defenders
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', 780, 390, 8, 3, 25, Math.PI));
      units.push(...FormationGenerator.createBox('mouse_swarmer', 'mouse', 900, 390, 6, 3, 25, Math.PI));
      for (let i = 0; i < 5; i++) {
        units.push(new Unit('needle_crossbow', 990, 290 + i * 50, 'mouse', Math.PI));
      }

      return units;
    }
  },

  {
    id: 'boss_showdown',
    name: 'Titan Brawl: Mega Cockatrice vs The Rat King',
    description: 'The gigantic Mega Cockatrice with royal rooster guard against The Rat King and his Cheddar Chosen in a titanic brawl!',
    init: () => {
      const units = [];
      // Cockatrice Hero
      const cockatrice = new Unit('mega_cockatrice', 280, 400, 'chicken', 0);
      units.push(cockatrice);

      // Elite Rooster Guard
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 230, 400, 10, 30, 0));
      units.push(...FormationGenerator.createLine('comb_guard', 'chicken', 350, 400, 10, 28, 0));

      // Rat King Hero
      const ratKing = new Unit('rat_king', 820, 400, 'mouse', Math.PI);
      units.push(ratKing);

      // Elite Mouse Guard
      units.push(...FormationGenerator.createWedge('cheese_knight', 'mouse', 870, 400, 10, 30, Math.PI));
      units.push(...FormationGenerator.createLine('spearmouse', 'mouse', 750, 400, 10, 28, Math.PI));

      return units;
    }
  },

  {
    id: 'grand_regiments',
    name: 'Grand Regimental Warfare (Endless Civilizations)',
    description: 'Massive 100+ troop battlefield with long marching corridors! Full regiments of Rooster Knights and Toothpick Pikemen assemble at distant bases and march into prolonged tactical line battles with endless reinforcements.',
    init: () => {
      const units = [];
      // Chicken 1st Vanguard (Spears & Swords)
      units.push(...FormationGenerator.createBox('comb_guard', 'chicken', 220, 320, 6, 2, 28, 0));
      units.push(...FormationGenerator.createBox('cluck_pecker', 'chicken', 160, 320, 6, 2, 28, 0));
      // Chicken 2nd Flank Cavalry (Wedge)
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 240, 560, 14, 30, 0));
      // Chicken Reserve
      units.push(...FormationGenerator.createLine('cluck_pecker', 'chicken', 100, 440, 10, 26, 0));

      // Mouse 1st Iron Guard
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', 920, 320, 6, 2, 28, Math.PI));
      units.push(...FormationGenerator.createBox('mouse_swarmer', 'mouse', 980, 320, 6, 2, 28, Math.PI));
      // Mouse 2nd Cheese Knights (Wedge)
      units.push(...FormationGenerator.createWedge('cheese_knight', 'mouse', 900, 200, 14, 30, Math.PI));
      // Mouse Reserve
      units.push(...FormationGenerator.createLine('spearmouse', 'mouse', 1040, 440, 10, 26, Math.PI));

      return units;
    }
  },

  {
    id: 'crab_invasion',
    name: 'The Great Crab Invasion (Rebalancing Event)',
    description: 'Chickens and Mice meet in open warfare, but a sudden horde of 24 River Crabs invades from the waterways! Both factions must unite their lines to survive!',
    init: () => {
      const units = [];
      // Chicken vanguard & cavalry
      units.push(...FormationGenerator.createBox('comb_guard', 'chicken', 280, 400, 6, 2, 28, 0));
      units.push(...FormationGenerator.createLine('cluck_pecker', 'chicken', 200, 400, 10, 26, 0));
      units.push(...FormationGenerator.createWedge('rooster_knight', 'chicken', 220, 260, 8, 30, 0));

      // Mouse iron guard & cavalry
      units.push(...FormationGenerator.createBox('spearmouse', 'mouse', 820, 400, 6, 2, 28, Math.PI));
      units.push(...FormationGenerator.createLine('mouse_swarmer', 'mouse', 900, 400, 10, 26, Math.PI));
      units.push(...FormationGenerator.createWedge('cheese_knight', 'mouse', 880, 540, 8, 30, Math.PI));

      // Crab Horde pincering from North & South waterways!
      for (let i = 0; i < 12; i++) {
        units.push(new Unit('river_crab', 420 + i * 26, 120, 'crab', Math.PI / 2));
        units.push(new Unit('river_crab', 420 + i * 26, 680, 'crab', -Math.PI / 2));
      }

      return units;
    }
  },

  {
    id: 'sandbox',
    name: 'Custom Sandbox (Free Placement)',
    description: 'Empty canvas! Paint units, set up custom charges, test formations, or reenact your favorite battles.',
    init: () => {
      return [];
    }
  }
];
