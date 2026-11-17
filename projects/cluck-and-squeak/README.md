# Cluck & Squeak

I built a chicken-versus-mouse simulator that runs inside FigJam and in a standalone browser. In FigJam, the plugin moves actual board objects. You can use a whiteboard as terrain in Perpetual Civilization, or pick existing stickers for a Classroom Battle and restore their original positions afterward.

## Run in FigJam

1. Download or clone this repository and open its `projects/cluck-and-squeak` folder.
2. Run `node scripts/build.cjs` from that folder with Node.js. No package install is needed. This generates the manifest's `code.js` and `ui.html` files.
3. Open a test board in the Figma desktop app. In FigJam, use **Plugins → Development → Import plugin from manifest** and select `figma-plugin/manifest.json`.
4. Run **Cluck & Squeak Battle Simulator** from the development menu and choose **Classroom Battle — selected stickers** or **Perpetual Civilization**. Start on a copy of a board if you want to try classroom mode with existing stickers.

[Plugin source](figma-plugin) · [Classroom mode guide](docs/classroom-battle.md) · [Project write-up](../../docs/CLUCK_AND_SQUEAK.md)

## Run in a browser

Run `python -m http.server 8080` from this folder and open http://localhost:8080. The standalone version draws its own battlefield to Canvas.
