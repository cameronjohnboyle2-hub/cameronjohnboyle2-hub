/**
 * engine/settings.js
 * Centralized defaults for combat, economy, movement, formations, and eras.
 * Free of DOM, window, audio, or Figma references.
 * Universal Module Definition (Node.js CommonJS & Browser global CluckSettings).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CluckSettings = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    VERSION: '1.0.0',
    // Simulation Timing
    SIM_HZ: 20,
    SIM_DT: 0.05, // 50 ms per tick
    RENDER_HZ: 10,
    RENDER_DT: 0.10, // 100 ms per render message

    // Economy & Resources
    ECONOMY: Object.freeze({
      INITIAL_GRAIN: 60,
      INITIAL_CHEESE: 60,
      PASSIVE_RATE_PER_SEC: 1,
      HARVEST_CARGO_NORMAL: 25,
      HARVEST_CARGO_TRUCE: 35,
      HARVEST_TIME_NORMAL: 1.2,
      HARVEST_TIME_TRUCE: 0.7,
      RECRUIT_COST_FOOD: 15,
      HARVESTER_FIELD_TARGET: 2,
      MAX_POPULATION_PER_TEAM: 85
    }),

    // Combat & Unit Archetypes
    UNITS: Object.freeze({
      chicken: Object.freeze({
        infantry: { hp: 100, morale: 100, speed: 55, damage: 26 },
        spear: { hp: 120, morale: 110, speed: 50, damage: 24, canBrace: true },
        cavalry: { hp: 160, morale: 130, speed: 80, chargeSpeed: 130, damage: 65 },
        ranged: { hp: 80, morale: 90, speed: 50, damage: 28, minRange: 90, maxRange: 340, shootCd: 2.1 },
        siege: { hp: 280, morale: 200, speed: 35, damage: 65, minRange: 90, maxRange: 520, shootCd: 3.5, splashRadius: 60 },
        harvester: { hp: 120, morale: 100, speed: 65, damage: 0 },
        captainBonus: { hp: 80, morale: 50 }
      }),
      mouse: Object.freeze({
        infantry: { hp: 100, morale: 100, speed: 55, damage: 22 },
        spear: { hp: 120, morale: 110, speed: 50, damage: 20, canBrace: true },
        cavalry: { hp: 160, morale: 130, speed: 80, chargeSpeed: 130, damage: 55 },
        ranged: { hp: 80, morale: 90, speed: 50, damage: 24, minRange: 90, maxRange: 340, shootCd: 2.1 },
        siege: { hp: 280, morale: 200, speed: 35, damage: 65, minRange: 90, maxRange: 520, shootCd: 3.5, splashRadius: 60 },
        harvester: { hp: 120, morale: 100, speed: 65, damage: 0 },
        captainBonus: { hp: 80, morale: 50 }
      }),
      crab: Object.freeze({
        horde: { hp: 90, morale: 80, speed: 55, damage: 22, armorReduction: 0.25 }
      })
    }),

    // Speed Multipliers & Terrain
    MOVEMENT: Object.freeze({
      ROAD_MULTIPLIER: 1.70,
      ROAD_DETECT_RADIUS: 45,
      FRICTION: 0.80,
      SEPARATION_DISTANCE: 44,
      MAX_SPEEDS: Object.freeze({
        DEFAULT: 4.5,
        PLUNDER: 5.5,
        CRUSADING: 5.8,
        ROUTED: 5.8,
        CHARGING: 6.5,
        SIEGE: 3.0
      })
    }),

    // Truce & Exhaustion Recovery
    TRUCE: Object.freeze({
      MIN_COMBAT_DEATHS: 8,
      CASUALTY_THRESHOLD: 0.65, // 65% losses triggers exhaustion
      SUSTAIN_SECONDS: 3.0,
      DURATION_SECONDS: 25.0,
      COOLDOWN_SECONDS: 80.0,
      FIELD_HEALING_RATE: 18.0 // HP/s during truce
    }),

    // Technology Eras
    ERAS: Object.freeze({
      TRIBAL: 1,
      FEUDAL: 2,
      IMPERIAL: 3
    }),

    // Relief Crusades
    CRUSADE: Object.freeze({
      COOLDOWN_SECONDS: 300.0,
      UNIT_COUNT: 6,
      POPULATION_TRIGGER_DEFICIT: { underdogMax: 6, dominantMin: 24 }
    }),

    // Capital Base Defense & Protection Circle
    CAPITAL_DEFENSE: Object.freeze({
      RADIUS: 180,
      FRIENDLY_HEAL_RATE: 12.0,      // +12 HP/s for allies inside base
      FRIENDLY_MORALE_RATE: 15.0,    // +15 Morale/s for allies inside base
      ATTRITION_DAMAGE_RATE: 15.0,   // -15 HP/s wall arrow/trap damage on enemy raiders
      ATTRITION_MORALE_RATE: 8.0     // -8 Morale/s panic on enemy raiders
    }),

    // Campaign Phases
    CAMPAIGN_PHASES: Object.freeze({
      MUSTER: 'MUSTER',
      ADVANCE: 'ADVANCE',
      CLASH: 'CLASH',
      RAID: 'RAID',
      RECOVERY: 'RECOVERY'
    })
  });
});
