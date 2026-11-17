/** Classroom roster, formation setup, and finite match rules. Combat is shared with Perpetual Civilization. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../classroom/tactics.js'), require('./core.js'));
  } else {
    root.CluckClassroom = factory(root.createClassroomTactics, root.CluckCore);
  }
})(globalThis, function (createTactics, core) {
  'use strict';

  const LIMIT = 300;
  const DT = .05;
  const teams = ['chicken', 'mouse'];
  const roles = ['infantry', 'spear', 'ranged', 'infantry', 'cavalry', 'spear', 'infantry', 'ranged'];

  function geometry(nodes) {
    const center = team => {
      const members = nodes.filter(node => node.team === team);
      return members.reduce((point, node) => ({
        x: point.x + node.x / members.length,
        y: point.y + node.y / members.length
      }), { x: 0, y: 0 });
    };
    const chicken = center('chicken');
    const mouse = center('mouse');
    const dx = mouse.x - chicken.x;
    const dy = mouse.y - chicken.y;
    const length = Math.hypot(dx, dy);
    const forward = length > 1 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    const perpendicular = { x: -forward.y, y: forward.x };
    const along = (point, direction) => point.x * direction.x + point.y * direction.y;
    const formations = [];
    const prepared = [];

    for (const team of teams) {
      const sign = team === 'chicken' ? 1 : -1;
      const enemy = team === 'chicken' ? mouse : chicken;
      const army = nodes.filter(node => node.team === team)
        .sort((a, b) => along(a, perpendicular) - along(b, perpendicular));
      const width = along(army.at(-1), perpendicular) - along(army[0], perpendicular);
      const laneCount = Math.max(1, Math.min(5, Math.floor(army.length / 8), Math.round(width / 150) + 1));
      let regimentIndex = 0;

      for (let lane = 0; lane < laneCount; lane++) {
        const laneUnits = army.slice(Math.floor(lane * army.length / laneCount), Math.floor((lane + 1) * army.length / laneCount));
        laneUnits.sort((a, b) => (along(b, forward) - along(a, forward)) * sign);
        const groups = Math.ceil(laneUnits.length / 16);
        for (let group = 0; group < groups; group++) {
          const members = laneUnits.slice(Math.floor(group * laneUnits.length / groups), Math.floor((group + 1) * laneUnits.length / groups));
          const lead = members[0];
          const isWedge = lead.role ? lead.role === 'cavalry' : regimentIndex % 3 === 1;
          const name = (team === 'chicken' ? 'Chicken' : 'Mouse') +
            (isWedge ? ' lancers ' : ' phalanx ') + (++regimentIndex);
          // Parallel approach lanes keep adjacent drawn formations from drifting inward.
          const cross = along(lead, perpendicular);
          const objective = along(enemy, forward) + sign * 180;
          formations.push({
            name, team, shape: isWedge ? 'wedge' : 'phalanx',
            members: members.map(node => node.id),
            advancePoint: {
              x: forward.x * objective + perpendicular.x * cross,
              y: forward.y * objective + perpendicular.y * cross
            }
          });
          members.forEach((node, index) => {
            const role = node.role || (index === 0 && isWedge ? 'cavalry' : roles[index % roles.length]);
            prepared.push({
              ...node,
              name: node.name || (team === 'chicken' ? 'Chicken' : 'Mouse') + ' ' + role,
              isCaptain: index === 0,
              isCavalry: role === 'cavalry',
              isRanged: role === 'ranged',
              isSpear: role === 'spear'
            });
          });
        }
      }
    }
    const xs = nodes.map(node => node.x);
    const ys = nodes.map(node => node.y);
    return {
      prepared, formations,
      bases: { chicken: { cx: chicken.x, cy: chicken.y }, mouse: { cx: mouse.x, cy: mouse.y } },
      bounds: { minX: Math.min(...xs) - 280, maxX: Math.max(...xs) + 280,
        minY: Math.min(...ys) - 280, maxY: Math.max(...ys) + 280 }
    };
  }

  function record(world, text) {
    if (world.events.at(-1)?.text === text) return;
    world.events.push({ time: world.elapsed, text });
    if (world.events.length > 8) world.events.shift();
  }

  function initialize(world) {
    const { prepared, formations, bases, bounds } = geometry(world.placements);
    world.units = world.tactics.initialize(prepared, formations, bases, bounds);
  }

  function create(combatants, options = {}) {
    if (!Array.isArray(combatants) || combatants.length > LIMIT) throw Error('Select at most ' + LIMIT + ' combatants.');
    const ids = new Set();
    const initial = { chicken: 0, mouse: 0 };
    for (const node of combatants) {
      if (ids.has(node.id) || !teams.includes(node.team) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        throw Error('Invalid or duplicate combatant.');
      }
      ids.add(node.id);
      initial[node.team]++;
    }
    if (!initial.chicken || !initial.mouse) throw Error('Enroll at least one chicken and one mouse.');
    const world = {
      placements: combatants.map(node => ({ ...node })), initial, elapsed: 0, tick: 0,
      state: 'ready', winner: null, events: [],
      get projectiles() { return this.state === 'finished' ? [] : this.tactics.projectiles; }
    };
    world.tactics = createTactics({
      random: options.seed === undefined ? undefined : core.createPrng(options.seed),
      onEvent(text) { record(world, text); }
    });
    initialize(world);
    return world;
  }

  function summary(world) {
    const result = { chicken: 0, mouse: 0, chickenHp: 0, mouseHp: 0 };
    for (const unit of world.units) {
      if (unit.isDead) continue;
      result[unit.team]++;
      result[unit.team + 'Hp'] += Math.max(0, unit.hp);
    }
    return result;
  }

  function start(world) {
    if (world.state !== 'ready' && world.state !== 'paused') return;
    record(world, world.state === 'ready' ? 'The regiments march!' : 'Battle resumed.');
    world.state = 'running';
  }

  function pause(world) {
    if (world.state === 'running') world.state = 'paused';
  }

  function step(world, dt = DT) {
    if (world.state !== 'running') return;
    if (dt !== DT) throw Error('Classroom battle requires fixed 0.05 second steps.');
    world.elapsed = ++world.tick * DT;
    // Advance the original fixed-step physics at half speed so a classroom
    // audience has time to see the engagement. The match clock stays in seconds.
    if (world.tick % 2 === 0) world.tactics.step(dt);
    const result = summary(world);
    if (result.chicken && result.mouse) return;

    world.state = 'finished';
    world.winner = result.chicken ? 'chicken' : result.mouse ? 'mouse' : 'draw';
    const winners = world.winner === 'chicken' ? 'Chickens' : 'Mice';
    record(world, world.winner === 'draw' ? 'Both armies fell.' : winners + ' win!');
  }

  return { VERSION: '2.1.0', LIMIT, DT, create, start, pause, step, summary };
});
