/**
 * scripts/build.cjs
 * Deterministic bundling tool for Cluck & Squeak.
 * Pure Node.js with zero external dependencies.
 * Injects engine/settings.js, engine/core.js, and figma-plugin/ui-controller.js
 * into figma-plugin/ui.template.html to produce figma-plugin/ui.html.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const SETTINGS_PATH = path.join(ROOT_DIR, 'engine', 'settings.js');
const CORE_PATH = path.join(ROOT_DIR, 'engine', 'core.js');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'figma-plugin', 'ui.template.html');
const CONTROLLER_PATH = path.join(ROOT_DIR, 'figma-plugin', 'ui-controller.js');
const OUTPUT_PATH = path.join(ROOT_DIR, 'figma-plugin', 'ui.html');
const OVERLAY_TEMPLATE_PATH = path.join(ROOT_DIR, 'overlay', 'widget.template.js');
const OVERLAY_OUTPUT_PATH = path.join(ROOT_DIR, 'figjam-widget-bundle.js');

function build() {
  console.log('=== Building Cluck & Squeak Plugin UI Bundle ===');

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    throw new Error(`Settings not found: ${SETTINGS_PATH}`);
  }
  if (!fs.existsSync(CORE_PATH)) {
    throw new Error(`Core engine not found: ${CORE_PATH}`);
  }
  if (!fs.existsSync(CONTROLLER_PATH)) {
    throw new Error(`UI controller not found: ${CONTROLLER_PATH}`);
  }

  const settingsSrc = fs.readFileSync(SETTINGS_PATH, 'utf8');
  const coreSrc = fs.readFileSync(CORE_PATH, 'utf8');
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const controllerSrc = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  // 1. Build Plugin UI (figma-plugin/ui.html)
  let pluginOutput = template;
  pluginOutput = pluginOutput.replace('/* __BUNDLE_ENGINE_SETTINGS__ */', () => settingsSrc);
  pluginOutput = pluginOutput.replace('/* __BUNDLE_ENGINE_CORE__ */', () => coreSrc);
  pluginOutput = pluginOutput.replace('/* __BUNDLE_UI_CONTROLLER__ */', () => controllerSrc);

  // Validate syntax before writing
  const scriptStart = pluginOutput.indexOf('<script>');
  const scriptEnd = pluginOutput.lastIndexOf('</script>');
  if (scriptStart === -1 || scriptEnd === -1) {
    throw new Error('Built HTML missing <script> tags!');
  }
  const bundledScript = pluginOutput.slice(scriptStart + 8, scriptEnd);
  new vm.Script(bundledScript);

  fs.writeFileSync(OUTPUT_PATH, pluginOutput, 'utf8');
  console.log(`[PASS] Built figma-plugin/ui.html (${Buffer.byteLength(pluginOutput, 'utf8')} bytes)`);

  // 2. Build Overlay Widget Bundle (figjam-widget-bundle.js)
  if (fs.existsSync(OVERLAY_TEMPLATE_PATH)) {
    console.log('=== Building Cluck & Squeak Overlay Widget Bundle ===');
    const overlayTemplate = fs.readFileSync(OVERLAY_TEMPLATE_PATH, 'utf8');
    let overlayOutput = overlayTemplate;
    overlayOutput = overlayOutput.replace('/* __BUNDLE_ENGINE_SETTINGS__ */', () => settingsSrc);
    overlayOutput = overlayOutput.replace('/* __BUNDLE_ENGINE_CORE__ */', () => coreSrc);

    // Validate syntax before writing
    new vm.Script(overlayOutput);
    fs.writeFileSync(OVERLAY_OUTPUT_PATH, overlayOutput, 'utf8');
    console.log(`[PASS] Built figjam-widget-bundle.js (${Buffer.byteLength(overlayOutput, 'utf8')} bytes)`);
  }
  require('./build-classroom.cjs').build();
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error(`[FAIL] Build error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { build };
