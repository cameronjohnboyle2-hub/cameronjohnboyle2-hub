/**
 * ============================================================================
 * CLUCK & SQUEAK: THE PERPETUAL MICRO-WAR ENGINE (FIGJAM PLUGIN BACKEND)
 * ============================================================================
 * Architecture: Figma Main Sandbox Thread
 * File: figma-plugin/code.js
 *
 * OVERVIEW:
 * This script runs inside the sandboxed Figma plugin main thread with direct access
 * to the FigJam document scene graph (figma.currentPage). It acts as the "renderer
 * and canvas actuator" for the battle engine:
 *
 * 1. Scene Graph Controller:
 *    - Creates, moves, rotates, and cleans up Figma stickers (TextNodes/Sections).
 *    - Dynamically scans user boards for live bases, resource patches, and terrain.
 *    - Detects FigJam Connector Lines ('CONNECTOR', 'LINE') as speed highways (+70%).
 * 2. Bi-Directional Message Bridge:
 *    - Receives commands from the simulation loop in ui.html (20 FPS SYNC_MOVE_NODES).
 *    - Dispatches canvas events (SCAN_RESULT, BASES_CREATED, LIVE_BASES_UPDATE) to ui.html.
 * 3. High-Performance Projectile Pooling:
 *    - Manages an array of 12 reusable canvas projectile nodes ('🏹', '🪨', '🥚', '🧀')
 *      to render parabolic ballistic flight paths without scene graph allocation lag.
 *
 * COORDINATE SYSTEM & CANVAS GEOGRAPHY:
 * - Canvas coordinates (x, y) match FigJam document space in pixels.
 * - Bases are movable Sections (440x600px). When moved or dragged by the user,
 *   getLiveBases() continuously recalibrates the centerpoints (cx, cy) and vectors.
 * ============================================================================
 */

figma.showUI(__html__, { width: 440, height: 720, themeColors: true });

let fontsLoaded = false;
async function ensureFonts() {
  if (fontsLoaded) return;
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    fontsLoaded = true;
  } catch (e) {
    try {
      await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
      fontsLoaded = true;
    } catch (err) {}
  }
}
ensureFonts();

// ----------------------------------------------------------------------------
// STATE & NODE REGISTRIES
// ----------------------------------------------------------------------------
let chickenSectionId = null;
let mouseSectionId = null;
const initialNodeStates = new Map(); // id -> { x, y, opacity, rotation }
const spawnedUnitNodeIds = new Set(); // ids of all battle unit stickers
const logicalToNodeMap = new Map();   // (worldId:logicalId) -> node.id
const projectilePoolIds = [];        // ids of the 12 recyclable projectile stickers
const resourceNodeIds = [];          // ids of neutral harvest patches
let summaryNodeId = null;            // id of the single bounded board summary text node

/**
 * Identifies the primary horizontal battle corridor between user content rows.
 * Free of DOM and Figma APIs (operates on node/box geometry { x, y, width, height }).
 */
function detectCorridor(nodes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const contentBoxes = [];

  for (let i = 0; i < (nodes || []).length; i++) {
    const n = nodes[i];
    const owner = n.getPluginData ? n.getPluginData('cs:owner') : '';
    if (owner === 'cluck-and-squeak') continue;
    if (n.width && n.height && n.width > 20 && n.height > 20 && 'x' in n && 'y' in n) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + n.height);
      contentBoxes.push({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        top: n.y,
        bottom: n.y + n.height
      });
    }
  }

  if (contentBoxes.length === 0) {
    return {
      hasUserContent: false,
      minX: -600, maxX: 2000,
      minY: 0, maxY: 600,
      corridorTop: 150, corridorBottom: 450,
      corridorCenterY: 300,
      corridorHeight: 300
    };
  }

  contentBoxes.sort((a, b) => a.top - b.top);
  let maxGap = 0;
  let bestGapTop = minY + (maxY - minY) * 0.4;
  let bestGapBottom = minY + (maxY - minY) * 0.6;

  let currentBottom = contentBoxes[0].bottom;
  for (let i = 1; i < contentBoxes.length; i++) {
    const box = contentBoxes[i];
    const gap = box.top - currentBottom;
    if (gap > maxGap && gap >= 80) {
      maxGap = gap;
      bestGapTop = currentBottom;
      bestGapBottom = box.top;
    }
    currentBottom = Math.max(currentBottom, box.bottom);
  }

  let corridorTop = bestGapTop;
  let corridorBottom = bestGapBottom;
  let corridorCenterY = (corridorTop + corridorBottom) / 2;

  if (maxGap < 80) {
    corridorTop = minY + (maxY - minY) * 0.35;
    corridorBottom = minY + (maxY - minY) * 0.65;
    corridorCenterY = (minY + maxY) / 2;
  }

  return {
    hasUserContent: true,
    minX: minX - 1200,
    maxX: maxX + 1200,
    contentMinX: minX,
    contentMaxX: maxX,
    contentMinY: minY,
    contentMaxY: maxY,
    minY: Math.min(minY - 400, corridorTop - 500),
    maxY: Math.max(maxY + 400, corridorBottom + 500),
    corridorTop,
    corridorBottom,
    corridorCenterY,
    corridorHeight: corridorBottom - corridorTop
  };
}

/**
 * Fast 32-bit checksum for strings (FNV-1a).
 */
function computeChecksum(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Safely splits serialized state into 16 KiB chunks and saves to document plugin data.
 */
function saveChunkedState(target, rawString, chunkSize = 16384) {
  if (!target || typeof target.setPluginData !== 'function') {
    throw new Error('Target must support setPluginData');
  }
  const checksum = computeChecksum(rawString);
  const totalBytes = rawString.length;
  const chunkCount = Math.max(1, Math.ceil(totalBytes / chunkSize));

  for (let c = 0; c < chunkCount; c++) {
    const chunk = rawString.slice(c * chunkSize, (c + 1) * chunkSize);
    target.setPluginData('cs:chunk_' + c, chunk);
  }

  let prevManifest = null;
  try {
    const prev = target.getPluginData('cs:save_manifest');
    if (prev) prevManifest = JSON.parse(prev);
  } catch (e) {}

  if (prevManifest && prevManifest.count > chunkCount) {
    for (let c = chunkCount; c < prevManifest.count; c++) {
      target.setPluginData('cs:chunk_' + c, '');
    }
  }

  const manifest = {
    count: chunkCount,
    totalBytes,
    chunkSize,
    checksum,
    savedAt: Date.now()
  };
  target.setPluginData('cs:save_manifest', JSON.stringify(manifest));
  return manifest;
}

/**
 * Reassembles chunked state from document plugin data and validates checksum.
 */
function loadChunkedState(target) {
  if (!target || typeof target.getPluginData !== 'function') return null;
  const manifestStr = target.getPluginData('cs:save_manifest');
  if (!manifestStr) return null;

  let manifest;
  try {
    manifest = JSON.parse(manifestStr);
  } catch (e) {
    return null;
  }

  if (!manifest || !manifest.count || manifest.totalBytes === undefined) {
    return null;
  }

  let fullStr = '';
  for (let c = 0; c < manifest.count; c++) {
    const chunk = target.getPluginData('cs:chunk_' + c);
    if (chunk === undefined || chunk === null) {
      return null;
    }
    fullStr += chunk;
  }

  if (fullStr.length !== manifest.totalBytes) {
    return null;
  }

  if (manifest.checksum !== undefined && computeChecksum(fullStr) !== manifest.checksum) {
    return null;
  }

  return fullStr;
}

/**
 * Evaluates active host role with 8-second advisory heartbeat window.
 */
function evaluateHostRole(target, userId, now = Date.now()) {
  if (!target || typeof target.getPluginData !== 'function') {
    return { role: 'host', hostId: userId, lastSeen: now };
  }

  const hostStr = target.getPluginData('cs:active_host');
  if (hostStr) {
    try {
      const active = JSON.parse(hostStr);
      if (active.userId && active.userId !== userId && (now - active.lastSeen) < 8000) {
        return { role: 'spectator', hostId: active.userId, lastSeen: active.lastSeen };
      }
    } catch (e) {}
  }

  target.setPluginData('cs:active_host', JSON.stringify({ userId, lastSeen: now }));
  return { role: 'host', hostId: userId, lastSeen: now };
}

/**
 * Discovers and returns the live coordinates and dimensions of the civilization bases.
 * Dynamically adapts if the user drags or resizes the base Sections on the FigJam board.
 * Rebuilds registries from cs:owner tags first before falling back to titles.
 * @returns {{ chicken: BaseData, mouse: BaseData } | null}
 */
function getLiveBases() {
  let cBase = null;
  let mBase = null;

  if (chickenSectionId) cBase = figma.getNodeById(chickenSectionId);
  if (mouseSectionId) mBase = figma.getNodeById(mouseSectionId);

  // Look up sections on canvas by cs:owner tags or title fallback
  if (!cBase || !mBase) {
    figma.currentPage.children.forEach(n => {
      if (n.type === 'SECTION') {
        const owner = n.getPluginData ? n.getPluginData('cs:owner') : '';
        const team = n.getPluginData ? n.getPluginData('cs:team') : '';
        if (owner === 'cluck-and-squeak') {
          if (!cBase && team === 'chicken') cBase = n;
          if (!mBase && team === 'mouse') mBase = n;
        } else {
          const name = (n.name || '').toLowerCase();
          if (!cBase && (name.includes('chicken') || name.includes('feathery') || name.includes('dominion'))) cBase = n;
          if (!mBase && (name.includes('mouse') || name.includes('whisker') || name.includes('citadel') || name.includes('cheddar'))) mBase = n;
        }
      }
    });
  }

  if (cBase && mBase) {
    chickenSectionId = cBase.id;
    mouseSectionId = mBase.id;
    return {
      chicken: {
        id: cBase.id,
        name: cBase.name,
        x: cBase.x,
        y: cBase.y,
        width: cBase.width,
        height: cBase.height,
        cx: cBase.x + cBase.width / 2,
        cy: cBase.y + cBase.height / 2
      },
      mouse: {
        id: mBase.id,
        name: mBase.name,
        x: mBase.x,
        y: mBase.y,
        width: mBase.width,
        height: mBase.height,
        cx: mBase.x + mBase.width / 2,
        cy: mBase.y + mBase.height / 2
      }
    };
  }
  return null;
}

// Function to find live resource nodes on canvas
function getLiveResourceNodes() {
  const nodes = [];
  figma.currentPage.children.forEach(n => {
    const name = (n.name || '').toLowerCase();
    let text = '';
    if ('characters' in n) text = n.characters.toLowerCase();
    if (name.includes('grain') || text.includes('grain') || name.includes('prairie') || text.includes('🌾')) {
      nodes.push({ id: n.id, type: 'grain', name: 'Prairie Grain Patch', x: n.x, y: n.y, capacity: 500 });
    } else if (name.includes('quarry') || text.includes('quarry') || (text.includes('🧀') && name.includes('quarry'))) {
      nodes.push({ id: n.id, type: 'cheese', name: 'Cheddar Rock Quarry', x: n.x, y: n.y, capacity: 500 });
    }
  });
  return nodes;
}

// Rehydrate existing bases and units from canvas on plugin launch or resync!
function rehydrateExistingBoard() {
  const liveBases = getLiveBases();
  const detected = [];
  figma.currentPage.children.forEach(n => {
    const owner = n.getPluginData ? n.getPluginData('cs:owner') : '';
    const name = (n.name || '').toLowerCase();
    let text = '';
    if ('characters' in n) text = n.characters.toLowerCase();

    if (owner === 'cluck-and-squeak') {
      const kind = n.getPluginData ? n.getPluginData('cs:kind') : '';
      if (kind === 'projectile') {
        if (!projectilePoolIds.includes(n.id)) projectilePoolIds.push(n.id);
        return;
      }
      if (kind === 'resource') {
        if (!resourceNodeIds.includes(n.id)) resourceNodeIds.push(n.id);
        return;
      }
      if (kind === 'summary') {
        summaryNodeId = n.id;
        return;
      }
      if (kind === 'base' || kind === 'building') return;

      spawnedUnitNodeIds.add(n.id);
      let team = n.getPluginData ? n.getPluginData('cs:team') : '';
      if (!team) team = name.includes('(chicken)') ? 'chicken' : (name.includes('(mouse)') ? 'mouse' : 'crab');

      detected.push({
        id: n.id,
        name: n.name || (team === 'chicken' ? 'Chicken' : 'Mouse'),
        x: n.x,
        y: n.y,
        width: n.width || 32,
        height: n.height || 32,
        team,
        isCavalry: kind === 'cavalry' || name.includes('knight') || name.includes('cavalry'),
        isSpear: kind === 'spear' || name.includes('guard') || name.includes('spear'),
        isCrab: team === 'crab',
        isCaptain: name.includes('commander') || name.includes('marshal') || name.includes('captain') || text.includes('👑'),
        isRanged: kind === 'ranged' || name.includes('ranger') || name.includes('slinger'),
        isHarvester: kind === 'worker' || name.includes('worker') || name.includes('miner')
      });
    }
  });

  if (liveBases || detected.length > 0) {
    figma.ui.postMessage({
      type: 'SCAN_RESULT',
      nodes: detected,
      bases: liveBases,
      resourceNodes: getLiveResourceNodes()
    });
  }
}

/**
 * Main Message Router: Handles incoming requests from the UI iframe simulation loop.
 * Supported Message Types:
 * - SCAN_SELECTION: Detects user-selected stickers and analyzes faction/type.
 * - SPAWN_CIVILIZATION_BASE: Spawns movable chicken & mouse base sections + resource patches.
 * - SPAWN_FORMATION: Deploys the 94-unit 6-wing grand strategic army + harvesters + projectile pool.
 * - SPAWN_NEW_UNIT: Spawns a single reinforcement sticker (recruit, templar, harvester, crab).
 * - DESPAWN_UNIT: Removes fallen unit stickers after bone decay expiration.
 * - SYNC_MOVE_NODES: Synchronizes 20 FPS simulated physics coordinates and projectile arcs to canvas.
 * - SCAN_BOARD_OBSTACLES: Identifies connector speed highways and obstacle barriers.
 * - RESYNC_CANVAS_POSITIONS: Pulls live sticker positions if dragged manually by the user.
 * - RESET_POSITIONS: Returns stickers to their original formation anchors.
 * - CLEANUP_ALL: Completely wipes all plugin-spawned nodes from the canvas.
 */
figma.ui.onmessage = async (msg) => {
  await ensureFonts();

  // 1. SCAN SELECTION
  if (msg.type === 'SCAN_SELECTION') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'SCAN_RESULT', nodes: [], error: 'No items selected! Select stickers on the board, or click Deploy Army.' });
      return;
    }

    const detected = [];
    let avgX = 0;
    selection.forEach(node => {
      avgX += node.x;
      if (!initialNodeStates.has(node.id)) {
        initialNodeStates.set(node.id, {
          x: node.x,
          y: node.y,
          opacity: 'opacity' in node ? node.opacity : 1.0,
          rotation: 'rotation' in node ? node.rotation : 0
        });
      }
    });
    avgX /= selection.length;

    selection.forEach(node => {
      const name = (node.name || '').toLowerCase();
      let text = '';
      if ('characters' in node) text = node.characters;

      let team = 'chicken';
      let isCavalry = false;
      let isSpear = false;
      let isCrab = false;
      let isCaptain = name.includes('captain') || name.includes('general') || name.includes('warlord') || text.includes('👑');
      let isRanged = name.includes('ranger') || name.includes('slinger') || name.includes('archer') || text.includes('🏹');
      let isHarvester = name.includes('worker') || name.includes('harvester') || name.includes('miner') || text.includes('🚜') || text.includes('⛏️');

      if (text.includes('🦀') || name.includes('crab')) {
        team = 'crab';
        isCrab = true;
      } else if (text.includes('🐭') || text.includes('🧀') || name.includes('mouse') || name.includes('rat')) {
        team = 'mouse';
        if (name.includes('knight') || name.includes('cavalry')) isCavalry = true;
        if (name.includes('spear') || name.includes('phalanx')) isSpear = true;
      } else if (text.includes('🐔') || text.includes('🐓') || text.includes('🐣') || name.includes('chicken') || name.includes('rooster')) {
        team = 'chicken';
        if (name.includes('knight') || name.includes('cavalry') || text.includes('🐓')) isCavalry = true;
        if (name.includes('guard') || name.includes('spear')) isSpear = true;
      } else {
        team = node.x < avgX ? 'chicken' : 'mouse';
      }

      detected.push({
        id: node.id,
        name: node.name || (team === 'chicken' ? 'Chicken' : (team === 'mouse' ? 'Mouse' : 'River Crab')),
        x: node.x,
        y: node.y,
        width: node.width || 32,
        height: node.height || 32,
        team,
        isCavalry,
        isSpear,
        isCrab,
        isCaptain,
        isRanged,
        isHarvester
      });
    });

    figma.ui.postMessage({ type: 'SCAN_RESULT', nodes: detected, bases: getLiveBases(), resourceNodes: getLiveResourceNodes() });
    figma.notify(`⚔️ Found ${detected.length} stickers on canvas!`);
  }

  // 2. SPAWN CIVILIZATION BASES (GROUPED & MOVABLE - AUTO-SPANS WHOLE BOARD)
  else if (msg.type === 'SPAWN_CIVILIZATION_BASE') {
    // 2B. Repeated Setup discovers existing owned bases without allocating duplicates
    const existing = getLiveBases();
    if (existing && existing.chicken && existing.mouse) {
      figma.ui.postMessage({
        type: 'BASES_CREATED',
        bases: existing,
        resourceNodes: getLiveResourceNodes()
      });
      figma.notify('🏛️ Resumed existing civilization bases!');
      return;
    }

    // Detect horizontal battle corridor between user content rows without mutating content!
    const corridor = detectCorridor(figma.currentPage.children);

    let startX, startY, baseW;
    if (corridor.hasUserContent && (corridor.contentMaxX - corridor.contentMinX) > 400) {
      startX = corridor.contentMinX - 680;
      baseW = (corridor.contentMaxX - corridor.contentMinX) + 880;
      startY = corridor.corridorCenterY - 300;
    } else {
      const center = figma.viewport.center;
      baseW = 3400; // Wide epic battlefield by default!
      startX = center.x - baseW / 2;
      startY = center.y - 300;
    }

    // A. Chicken Capital Section
    const chickenSection = figma.createSection();
    chickenSection.name = "🏛️ Feathery Dominion (Chicken Capital)";
    chickenSection.x = startX;
    chickenSection.y = startY;
    chickenSection.resizeWithoutConstraints(440, 600);
    chickenSection.setPluginData('cs:owner', 'cluck-and-squeak');
    chickenSection.setPluginData('cs:kind', 'base');
    chickenSection.setPluginData('cs:team', 'chicken');
    if (msg.worldId) chickenSection.setPluginData('cs:worldId', String(msg.worldId));
    chickenSectionId = chickenSection.id;

    // B. Mouse Citadel Section
    const mouseSection = figma.createSection();
    mouseSection.name = "🏰 Whisker Kingdom (Cheddar Citadel)";
    mouseSection.x = startX + baseW;
    mouseSection.y = startY;
    mouseSection.resizeWithoutConstraints(440, 600);
    mouseSection.setPluginData('cs:owner', 'cluck-and-squeak');
    mouseSection.setPluginData('cs:kind', 'base');
    mouseSection.setPluginData('cs:team', 'mouse');
    if (msg.worldId) mouseSection.setPluginData('cs:worldId', String(msg.worldId));
    mouseSectionId = mouseSection.id;

    // Add base buildings as CHILDREN of the section so they move together when dragged!
    function createBuildingNode(icon, name, localX, localY, section) {
      const text = figma.createText();
      text.characters = `${icon} ${name}`;
      text.fontSize = 22;
      text.name = `${icon} ${name}`;
      text.setPluginData('cs:owner', 'cluck-and-squeak');
      text.setPluginData('cs:kind', 'building');
      if (msg.worldId) text.setPluginData('cs:worldId', String(msg.worldId));
      section.appendChild(text);
      text.x = localX;
      text.y = localY;
      return { id: text.id, name, localX, localY };
    }

    createBuildingNode('🏛️', 'Cluckingham Palace', 45, 270, chickenSection);
    createBuildingNode('🥚', 'Grand Egg Hatchery', 45, 90, chickenSection);
    createBuildingNode('🌾', 'Grain Granary', 45, 450, chickenSection);

    createBuildingNode('🏰', 'Cheddar Citadel', 45, 270, mouseSection);
    createBuildingNode('🕳️', 'The Great Burrow', 45, 90, mouseSection);
    createBuildingNode('🧀', 'Aged Cheese Quarry', 45, 450, mouseSection);

    // Neutral Canvas Resource Nodes placed in battle corridor
    const grainNode = figma.createText();
    grainNode.characters = '🌾 Prairie Grain Patch [500]';
    grainNode.fontSize = 24;
    grainNode.name = '🌾 Prairie Grain Patch';
    grainNode.x = Math.round(corridor.hasUserContent ? (corridor.contentMinX + (corridor.contentMaxX - corridor.contentMinX) * 0.35) : (startX + baseW * 0.35));
    grainNode.y = Math.round(corridor.corridorCenterY - 60);
    figma.currentPage.appendChild(grainNode);
    resourceNodeIds.push(grainNode.id);

    const cheeseNode = figma.createText();
    cheeseNode.characters = '🧀 Cheddar Rock Quarry [500]';
    cheeseNode.fontSize = 24;
    cheeseNode.name = '🧀 Cheddar Rock Quarry';
    cheeseNode.x = Math.round(corridor.hasUserContent ? (corridor.contentMinX + (corridor.contentMaxX - corridor.contentMinX) * 0.65) : (startX + baseW * 0.65));
    cheeseNode.y = Math.round(corridor.corridorCenterY + 60);
    figma.currentPage.appendChild(cheeseNode);
    resourceNodeIds.push(cheeseNode.id);

    const resourceData = [
      { id: grainNode.id, type: 'grain', name: 'Prairie Grain Patch', x: grainNode.x, y: grainNode.y, capacity: 500 },
      { id: cheeseNode.id, type: 'cheese', name: 'Cheddar Rock Quarry', x: cheeseNode.x, y: cheeseNode.y, capacity: 500 }
    ];

    figma.notify(`🏛️🏰 Founded Civilizations spanning ${Math.round(baseW)}px across the board! Drag them anywhere to customize the warfront.`);
    figma.viewport.scrollAndZoomIntoView([chickenSection, mouseSection, grainNode, cheeseNode]);

    figma.ui.postMessage({
      type: 'BASES_CREATED',
      bases: getLiveBases(),
      resourceNodes: resourceData,
      bounds: corridor
    });
  }

  // 3. SPAWN GRAND STRATEGIC FORMATIONS (3 BATTLEGROUPS: NORTH, CENTER, SOUTH)
  else if (msg.type === 'SPAWN_FORMATION') {
    // 2B. Reconcile existing army on repeated Deploy without allocating duplicates
    if (spawnedUnitNodeIds.size === 0) {
      figma.currentPage.children.forEach(n => {
        const owner = n.getPluginData ? n.getPluginData('cs:owner') : '';
        const kind = n.getPluginData ? n.getPluginData('cs:kind') : '';
        if (owner === 'cluck-and-squeak' && kind !== 'base' && kind !== 'building' && kind !== 'projectile' && kind !== 'summary') {
          spawnedUnitNodeIds.add(n.id);
        }
      });
    }

    if (spawnedUnitNodeIds.size >= 40) {
      const existingDetected = [];
      for (const id of spawnedUnitNodeIds) {
        const node = figma.getNodeById(id);
        if (node && 'x' in node && 'y' in node) {
          const kind = node.getPluginData ? node.getPluginData('cs:kind') : '';
          if (kind === 'projectile' || kind === 'resource' || (node.name && node.name.startsWith('Projectile_'))) {
            continue;
          }
          const name = (node.name || '').toLowerCase();
          existingDetected.push({
            id: node.id,
            name: node.name,
            x: node.x,
            y: node.y,
            width: node.width || 32,
            height: node.height || 32,
            team: name.includes('(chicken)') ? 'chicken' : (name.includes('(mouse)') ? 'mouse' : 'crab'),
            isCavalry: name.includes('knight') || name.includes('cavalry') || name.includes('commander'),
            isSpear: name.includes('guard') || name.includes('spear') || name.includes('halberd'),
            isCrab: name.includes('crab'),
            isCaptain: name.includes('commander') || name.includes('marshal') || name.includes('warlord') || name.includes('chief') || name.includes('champion') || name.includes('captain'),
            isRanged: name.includes('ranger') || name.includes('slinger'),
            isHarvester: name.includes('worker') || name.includes('miner')
          });
        }
      }
      if (existingDetected.length >= 40) {
        figma.ui.postMessage({ type: 'SCAN_RESULT', nodes: existingDetected, bases: getLiveBases(), resourceNodes: getLiveResourceNodes() });
        figma.notify('🐔🐭 Reconnected to existing armies on board!');
        return;
      }
    }

    const liveBases = getLiveBases();
    let cOriginX, cOriginY, mOriginX, mOriginY;
    let nx = 1, ny = 0, px = 0, py = 1;

    if (liveBases) {
      const { chicken, mouse } = liveBases;
      const dx = mouse.cx - chicken.cx;
      const dy = mouse.cy - chicken.cy;
      const dist = Math.hypot(dx, dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
      px = -ny;
      py = nx;

      // Deploy Chicken army in front of live Chicken base facing Mouse base
      cOriginX = chicken.cx + nx * (chicken.width * 0.5 + 60);
      cOriginY = chicken.cy + ny * (chicken.height * 0.5 + 60);

      // Deploy Mouse army in front of live Mouse base facing Chicken base
      mOriginX = mouse.cx - nx * (mouse.width * 0.5 + 60);
      mOriginY = mouse.cy - ny * (mouse.height * 0.5 + 60);
    } else {
      const center = figma.viewport.center;
      cOriginX = center.x - 600;
      cOriginY = center.y;
      mOriginX = center.x + 600;
      mOriginY = center.y;
    }

    const spawnedNodes = [];
    const detected = [];

    function createSticker(char, name, team, x, y, isCavalry = false, isSpear = false, isCrab = false, isCaptain = false, isRanged = false, isHarvester = false) {
      const text = figma.createText();
      text.characters = isCaptain ? `${char}👑` : char;
      text.fontSize = isCaptain ? 38 : (isCavalry ? 36 : (isCrab ? 34 : 28));
      text.x = Math.round(x);
      text.y = Math.round(y);
      text.name = `${name} (${team})`;
      text.setPluginData('cs:owner', 'cluck-and-squeak');
      text.setPluginData('cs:kind', isHarvester ? 'worker' : (isRanged ? 'ranged' : (isCavalry ? 'cavalry' : 'infantry')));
      if (msg.worldId) text.setPluginData('cs:worldId', String(msg.worldId));
      figma.currentPage.appendChild(text);

      spawnedNodes.push(text);
      spawnedUnitNodeIds.add(text.id);
      initialNodeStates.set(text.id, {
        x: text.x,
        y: text.y,
        opacity: 1.0,
        rotation: 0
      });

      detected.push({
        id: text.id,
        name: text.name,
        x: text.x,
        y: text.y,
        width: 32,
        height: 32,
        team,
        isCavalry,
        isSpear,
        isCrab,
        isCaptain,
        isRanged,
        isHarvester
      });
    }

    // Helper functions to position stickers relative to base orientations
    function cPos(fwd, side) {
      return { x: cOriginX + nx * fwd + px * side, y: cOriginY + ny * fwd + py * side };
    }
    function mPos(fwd, side) {
      return { x: mOriginX - nx * fwd - px * side, y: mOriginY - ny * fwd - py * side };
    }

    // ==========================================
    // CHICKEN GRAND ARMY (47 UNITS + 2 HARVESTERS)
    // ==========================================

    // Wing 1: North Flank Rooster Cavalry Wedge (13 units)
    const cNorthLeader = cPos(150, -320);
    createSticker('🐓', 'Cavalry Commander', 'chicken', cNorthLeader.x, cNorthLeader.y, true, false, false, true);
    for (let tier = 1; tier <= 6; tier++) {
      const p1 = cPos(150 - tier * 32, -320 - tier * 22);
      const p2 = cPos(150 - tier * 32, -320 + tier * 22);
      createSticker('🐓', 'Rooster Knight', 'chicken', p1.x, p1.y, true);
      createSticker('🐓', 'Rooster Knight', 'chicken', p2.x, p2.y, true);
    }

    // Wing 2: Center Royal Vanguard Phalanx & Shield Wall (21 units)
    const cCenterLeader = cPos(80, 0);
    createSticker('��', 'Rooster Marshal', 'chicken', cCenterLeader.x, cCenterLeader.y, true, false, false, true);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const p = cPos(c * 36, -60 + r * 38);
        createSticker('🐔', 'Chicken Infantry', 'chicken', p.x, p.y);
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = cPos(135, -45 + i * 30);
      createSticker('🐔', 'Comb Guard', 'chicken', p.x, p.y, false, true);
    }

    // Wing 3: South Flank Ranger Screen (13 units - Ranged Archers!)
    const cSouthLeader = cPos(110, 320);
    createSticker('🐓', 'Flank Captain', 'chicken', cSouthLeader.x, cSouthLeader.y, false, false, false, true, true);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const p = cPos(70 - r * 34, 320 - 75 + c * 30);
        createSticker('🐣', 'Poultry Ranger', 'chicken', p.x, p.y, false, false, false, false, true);
      }
    }

    // Chicken Logistics: 2 Harvester Workers
    createSticker('🚜', 'Worker Chick', 'chicken', cOriginX - 30, cOriginY - 140, false, false, false, false, false, true);
    createSticker('🚜', 'Worker Chick', 'chicken', cOriginX - 30, cOriginY + 140, false, false, false, false, false, true);

    // ==========================================
    // MOUSE GRAND ARMY (47 UNITS + 2 MINERS)
    // ==========================================

    // Wing 1: North Flank Needle Slingers (13 units - Ranged Slingers!)
    const mNorthLeader = mPos(110, -320);
    createSticker('🐭', 'Infiltration Chief', 'mouse', mNorthLeader.x, mNorthLeader.y, false, false, false, true, true);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const p = mPos(70 - r * 34, -320 - 75 + c * 30);
        createSticker('🐭', 'Mouse Slinger', 'mouse', p.x, p.y, false, false, false, false, true);
      }
    }

    // Wing 2: Center Iron Spearmouse Phalanx & Fortress Guard (21 units)
    const mCenterLeader = mPos(80, 0);
    createSticker('🐭', 'Mouse Warlord', 'mouse', mCenterLeader.x, mCenterLeader.y, false, true, false, true);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const p = mPos(c * 36, -60 + r * 38);
        createSticker('🐭', 'Spearmouse', 'mouse', p.x, p.y, false, true);
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = mPos(135, -45 + i * 30);
      createSticker('🐭', 'Cheddar Halberdier', 'mouse', p.x, p.y, false, true);
    }

    // Wing 3: South Flank Cheese Knights Cavalry Wedge (13 units)
    const mSouthLeader = mPos(150, 320);
    createSticker('🧀', 'Cheddar Champion', 'mouse', mSouthLeader.x, mSouthLeader.y, true, false, false, true);
    for (let tier = 1; tier <= 6; tier++) {
      const p1 = mPos(150 - tier * 32, 320 - tier * 22);
      const p2 = mPos(150 - tier * 32, 320 + tier * 22);
      createSticker('🧀', 'Cheese Knight', 'mouse', p1.x, p1.y, true);
      createSticker('🧀', 'Cheese Knight', 'mouse', p2.x, p2.y, true);
    }

    // Mouse Logistics: 2 Cheese Miners
    createSticker('⛏️', 'Burrow Miner', 'mouse', mOriginX + 30, mOriginY - 140, false, false, false, false, false, true);
    createSticker('⛏️', 'Burrow Miner', 'mouse', mOriginX + 30, mOriginY + 140, false, false, false, false, false, true);

    // Ballistics Pool: 12 reusable flying projectile stickers on canvas
    projectilePoolIds.length = 0;
    for (let p = 0; p < 12; p++) {
      const pNode = figma.createText();
      pNode.characters = p % 2 === 0 ? '🏹' : '🪨';
      pNode.fontSize = 20;
      pNode.name = `Projectile_${p}`;
      pNode.opacity = 0;
      pNode.x = 0;
      pNode.y = 0;
      pNode.setPluginData('cs:owner', 'cluck-and-squeak');
      pNode.setPluginData('cs:kind', 'projectile');
      if (msg.worldId) pNode.setPluginData('cs:worldId', String(msg.worldId));
      figma.currentPage.appendChild(pNode);
      projectilePoolIds.push(pNode.id);
    }

    figma.currentPage.selection = spawnedNodes;
    figma.viewport.scrollAndZoomIntoView(spawnedNodes);

    figma.ui.postMessage({ type: 'SCAN_RESULT', nodes: detected, bases: getLiveBases(), resourceNodes: getLiveResourceNodes() });
    figma.notify(`🐔🐭 Deployed 94 troops in 6 Grand Strategic Wings across North, Center, and South battlefronts!`);
  }

  // 4. SPAWN DYNAMIC REINFORCEMENT STICKER
  else if (msg.type === 'SPAWN_NEW_UNIT') {
    const {
      char, name, team, x, y,
      isCavalry, isSpear, isCrab, isCaptain, isCrusading,
      isRanged, isSiege, isHarvester,
      regimentId, worldId, logicalId, requestId
    } = msg;

    // Idempotent node lookup by (worldId, logicalId)
    const entityKey = (worldId || 'w') + ':' + (logicalId || (name + '_' + Math.round(x) + '_' + Math.round(y)));
    let text = null;
    if (logicalToNodeMap.has(entityKey)) {
      text = figma.getNodeById(logicalToNodeMap.get(entityKey));
    }

    if (!text) {
      text = figma.createText();
      text.characters = isCaptain ? `${char}👑` : char;
      text.fontSize = isCaptain ? 38 : (isCavalry ? 36 : (isCrab ? 34 : 28));
      text.x = Math.round(x);
      text.y = Math.round(y);
      text.name = `${name} (${team})`;
      text.setPluginData('cs:owner', 'cluck-and-squeak');
      text.setPluginData('cs:kind', isHarvester ? 'worker' : (isSiege ? 'siege' : (isCrab ? 'crab' : 'unit')));
      if (worldId) text.setPluginData('cs:worldId', String(worldId));
      if (logicalId) text.setPluginData('cs:logicalId', String(logicalId));
      figma.currentPage.appendChild(text);

      spawnedUnitNodeIds.add(text.id);
      logicalToNodeMap.set(entityKey, text.id);
      initialNodeStates.set(text.id, {
        x: text.x,
        y: text.y,
        opacity: 1.0,
        rotation: 0
      });
    }

    const unitPayload = {
      id: text.id,
      nodeId: text.id,
      worldId: worldId || null,
      logicalId: logicalId || null,
      requestId: requestId || null,
      name: text.name,
      x: text.x,
      y: text.y,
      team,
      isCavalry: !!isCavalry,
      isSpear: !!isSpear,
      isCrab: !!isCrab,
      isCaptain: !!isCaptain,
      isRanged: !!isRanged,
      isSiege: !!isSiege,
      isHarvester: !!isHarvester,
      isCrusading: !!isCrusading,
      regimentId: regimentId || null
    };

    figma.ui.postMessage({
      type: 'ENTITY_CREATED',
      requestId: requestId || null,
      worldId: worldId || null,
      logicalId: logicalId || null,
      nodeId: text.id,
      unitData: unitPayload
    });

    figma.ui.postMessage({
      type: 'UNIT_SPAWNED',
      unitData: unitPayload
    });
  }

  // 5. DESPAWN DEAD STICKER (Bone cleanup)
  else if (msg.type === 'DESPAWN_UNIT') {
    const node = figma.getNodeById(msg.id);
    if (node) {
      const owner = node.getPluginData ? node.getPluginData('cs:owner') : '';
      if (!owner || owner === 'cluck-and-squeak') {
        node.remove();
        spawnedUnitNodeIds.delete(msg.id);
        initialNodeStates.delete(msg.id);
      }
    }
  }

  // 6. SYNC POSITIONS & ANIMATIONS TO CANVAS
  else if (msg.type === 'SYNC_MOVE_NODES') {
    const sequence = msg.sequence !== undefined ? msg.sequence : 0;
    const updates = msg.updates || []; // [{ id, x, y, isDead, isRouted, isDefending }]
    let missingNodeId = null;

    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      const node = figma.getNodeById(u.id);
      if (!node) {
        missingNodeId = u.id;
        continue; // Continue moving all other active units smoothly!
      }
      if ('x' in node && 'y' in node) {
        if (node.x !== u.x) node.x = u.x;
        if (node.y !== u.y) node.y = u.y;

        if (u.isDead) {
          if ('opacity' in node && node.opacity !== 0.3) node.opacity = 0.3;
          if ('rotation' in node && node.rotation !== 180) node.rotation = 180;
        } else if (u.isRouted) {
          if ('opacity' in node && node.opacity !== 0.7) node.opacity = 0.7;
          if ('rotation' in node && node.rotation !== -35) node.rotation = -35;
        } else if (u.isDefending) {
          if ('opacity' in node && node.opacity !== 1.0) node.opacity = 1.0;
          if ('rotation' in node && node.rotation !== 0) node.rotation = 0;
        } else {
          if ('opacity' in node && node.opacity !== 1.0) node.opacity = 1.0;
          if ('rotation' in node && node.rotation !== 0) node.rotation = 0;
        }
      }
    }

    if (missingNodeId) {
      figma.ui.postMessage({
        type: 'RENDER_ERROR',
        sequence,
        missingNodeId,
        error: `Mapped node ${missingNodeId} is missing on canvas!`
      });
    }

    if (Math.random() < 0.05) {
      figma.ui.postMessage({ type: 'LIVE_BASES_UPDATE', bases: getLiveBases() });
    }

    // Update physical ballistic projectile stickers in flight on the canvas!
    // R05 fix: Always iterate across all 12 pool nodes and hide unused slots even if projectiles list is empty!
    for (let i = 0; i < projectilePoolIds.length; i++) {
      const id = projectilePoolIds[i];
      const node = figma.getNodeById(id);
      if (!node) continue;
      const proj = (msg.projectiles && msg.projectiles[i]) ? msg.projectiles[i] : null;
      if (proj && proj.active) {
        const px = Math.round(proj.x);
        const py = Math.round(proj.y - (proj.z || 0)); // Elevation arc!
        if (node.x !== px) node.x = px;
        if (node.y !== py) node.y = py;
        if (node.opacity !== 1.0) node.opacity = 1.0;
        const char = proj.type === 'egg' ? '🥚' : (proj.type === 'cheese' ? '🧀' : (proj.type === 'arrow' ? '🏹' : '🪨'));
        if (node.characters !== char) node.characters = char;
      } else {
        if (node.opacity !== 0) node.opacity = 0;
      }
    }

    // Reply RENDER_APPLIED after writes complete
    figma.ui.postMessage({
      type: 'RENDER_APPLIED',
      sequence,
      appliedCount: updates.length
    });
  }

  // 7. SCAN RETROSPECTIVE CARDS / OBSTACLES & CONNECTOR HIGHWAYS
  else if (msg.type === 'SCAN_BOARD_OBSTACLES') {
    const obstacles = [];
    const roads = [];
    const unitIds = spawnedUnitNodeIds;

    function checkNode(node) {
      if (unitIds.has(node.id) || initialNodeStates.has(node.id)) return;
      if (node.id === chickenSectionId || node.id === mouseSectionId) return;

      // Scan connectors and lines as paved speed highways (+70% march speed!)
      if (node.type === 'CONNECTOR' || node.type === 'LINE') {
        roads.push({
          id: node.id,
          x1: node.x,
          y1: node.y,
          x2: node.x + node.width,
          y2: node.y + node.height
        });
        return;
      }

      // DO NOT treat frames, sections, tables, or large canvas areas as impassable walls!
      // They are the walkable battlefield ground where the user works and armies clash!
      if (node.type === 'FRAME' || node.type === 'SECTION' || node.type === 'TABLE' || node.type === 'PAGE') return;
      if ('width' in node && (node.width > 450 || node.height > 450)) return;

      const name = (node.name || '').toLowerCase();
      // Only treat specific props/markers explicitly designated as obstacles (e.g. rocks, walls, barriers)
      if (name.includes('wall') || name.includes('rock') || name.includes('barrier') || name.includes('mountain') || name.includes('obstacle')) {
        obstacles.push({
          id: node.id,
          name: node.name,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          cx: node.x + node.width / 2,
          cy: node.y + node.height / 2
        });
      }
    }

    figma.currentPage.children.forEach(checkNode);
    const bounds = detectCorridor(figma.currentPage.children);
    figma.ui.postMessage({ type: 'OBSTACLES_RESULT', obstacles, roads, bases: getLiveBases(), bounds });
    figma.notify(obstacles.length > 0 
      ? `🗺️ Detected ${obstacles.length} tactical terrain barriers & ${roads.length} paved highway corridors!`
      : `🗺️ Battlefield clear! (${roads.length} paved highways connected across board)`);
  }

  // 8. RESYNC LIVE POSITIONS FROM CANVAS
  else if (msg.type === 'RESYNC_CANVAS_POSITIONS') {
    const updatedNodes = [];
    for (const id of spawnedUnitNodeIds) {
      const node = figma.getNodeById(id);
      if (node && 'x' in node && 'y' in node) {
        updatedNodes.push({
          id: node.id,
          x: node.x,
          y: node.y
        });
      }
    }
    const liveBases = getLiveBases();
    figma.ui.postMessage({ type: 'CANVAS_POSITIONS_SYNCED', nodes: updatedNodes, bases: liveBases, resourceNodes: getLiveResourceNodes() });
    figma.notify('🎯 Resynced all stickers and base coordinates with canvas!');
  }

  // 9. RESET POSITIONS
  else if (msg.type === 'RESET_POSITIONS') {
    for (const [id, state] of initialNodeStates.entries()) {
      const node = figma.getNodeById(id);
      if (node && 'x' in node && 'y' in node) {
        node.x = state.x;
        node.y = state.y;
        if ('opacity' in node) node.opacity = state.opacity;
        if ('rotation' in node) node.rotation = state.rotation;
      }
    }
    figma.notify('🔄 Stickers restored to base positions!');
  }

  // 10. CLEANUP ALL SPAWNED
  else if (msg.type === 'CLEANUP_ALL') {
    for (const id of spawnedUnitNodeIds) {
      const node = figma.getNodeById(id);
      if (node) node.remove();
    }
    for (const id of projectilePoolIds) {
      const node = figma.getNodeById(id);
      if (node) node.remove();
    }
    for (const id of resourceNodeIds) {
      const node = figma.getNodeById(id);
      if (node) node.remove();
    }
    spawnedUnitNodeIds.clear();
    initialNodeStates.clear();
    projectilePoolIds.length = 0;
    resourceNodeIds.length = 0;
    figma.notify('🧹 Cleared all battle stickers, projectiles, and resources from canvas!');
  }

  // 11. SAVE CHUNKED WORLD STATE
  else if (msg.type === 'SAVE_WORLD_STATE') {
    const rawState = msg.serializedState;
    if (rawState && figma.root) {
      saveChunkedState(figma.root, rawState);
      figma.ui.postMessage({ type: 'WORLD_STATE_SAVED', savedAt: Date.now() });
    }
  }

  // 12. LOAD CHUNKED WORLD STATE & EVALUATE HOST
  else if (msg.type === 'LOAD_WORLD_STATE') {
    const currentUserId = figma.currentUser ? figma.currentUser.id : 'anon';
    const roleInfo = evaluateHostRole(figma.root, currentUserId);
    const loadedStr = loadChunkedState(figma.root);
    figma.ui.postMessage({
      type: 'WORLD_STATE_LOADED',
      serializedState: loadedStr,
      role: roleInfo.role,
      hostId: roleInfo.hostId
    });
  }

  // 13. ADVISORY HEARTBEAT
  else if (msg.type === 'HEARTBEAT') {
    const currentUserId = figma.currentUser ? figma.currentUser.id : 'anon';
    const roleInfo = evaluateHostRole(figma.root, currentUserId);
    figma.ui.postMessage({
      type: 'HEARTBEAT_ACK',
      role: roleInfo.role,
      hostId: roleInfo.hostId
    });
  }

  // 14. FOCUS BATTLE (Smooth camera fit on battlefield)
  else if (msg.type === 'FOCUS_BATTLE') {
    const nodesToFocus = [];
    if (chickenSectionId) {
      const cSec = figma.getNodeById(chickenSectionId);
      if (cSec) nodesToFocus.push(cSec);
    }
    if (mouseSectionId) {
      const mSec = figma.getNodeById(mouseSectionId);
      if (mSec) nodesToFocus.push(mSec);
    }
    for (const [logicalId, nodeId] of logicalToNodeMap.entries()) {
      const n = figma.getNodeById(nodeId);
      if (n) nodesToFocus.push(n);
    }

    if (nodesToFocus.length > 0) {
      figma.viewport.scrollAndZoomIntoView(nodesToFocus);
    } else {
      figma.notify('🎯 No active battlefield elements found to focus.');
    }
  }

  // 15. UPDATE BOUNDED BOARD SUMMARY NODE (Throttled <= 1 Hz)
  else if (msg.type === 'UPDATE_BOARD_SUMMARY') {
    let summaryNode = null;
    if (summaryNodeId) {
      summaryNode = figma.getNodeById(summaryNodeId);
    }
    if (!summaryNode) {
      for (const node of figma.currentPage.children) {
        if (node.getPluginData && node.getPluginData('cs:owner') === 'cluck-and-squeak' && node.getPluginData('cs:kind') === 'summary') {
          summaryNode = node;
          summaryNodeId = node.id;
          break;
        }
      }
    }

    if (!summaryNode) {
      summaryNode = figma.createText();
      summaryNode.name = 'Cluck & Squeak • Campaign Summary';
      summaryNode.setPluginData('cs:owner', 'cluck-and-squeak');
      summaryNode.setPluginData('cs:kind', 'summary');
      const liveBases = getLiveBases();
      if (liveBases && liveBases.chicken) {
        summaryNode.x = liveBases.chicken.cx - 200;
        summaryNode.y = liveBases.chicken.cy - liveBases.chicken.height * 0.5 - 90;
      } else {
        summaryNode.x = 200;
        summaryNode.y = 120;
      }
      summaryNodeId = summaryNode.id;
    }

    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).then(() => {
      if (summaryNode && !summaryNode.removed) {
        summaryNode.characters = msg.summaryText || 'Cluck & Squeak World Summary';
      }
    }).catch(() => {});
  }
};
