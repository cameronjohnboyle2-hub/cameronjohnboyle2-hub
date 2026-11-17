# Ashfall Covenant

Ashfall Covenant is an original offline browser-playable party CRPG prototype built with vanilla HTML, CSS, and JavaScript.

## Run Locally
Option 1, simplest:
1. Open `index.html` in any modern browser.
2. Click **New Game**, create a character, and begin.

Option 2, local static server:
1. Open a terminal in this folder.
2. Run `python -m http.server 8080` if Python is installed.
3. Visit `http://localhost:8080`.

No install, build step, account, CDN, or internet connection is required.

## Save And Load
- Use the **Save** screen in the game.
- **Save Campaign** writes to browser localStorage.
- **Export Save** gives you a JSON text backup.
- Paste exported JSON into the import box and click **Import Save** to restore it.

## What Is Implemented
- Character creation with name, origin, archetype, attributes, and visual style.
- 3-act main story across 3 explorable regions.
- 5 recruitable companions with approval, camp scenes, secrets, personal hooks, and epilogues.
- Branching dialogue with visible d20 checks and persistent consequences.
- Tactical grid combat with initiative, movement, attacks, abilities, statuses, terrain, win/loss, loot, and progression.
- Inventory, equipment, journal, lore codex, relationship screen, map screen, camp/rest, save/load.
- 3 factions, 15 quests, 20+ dialogue scenes, 12 enemy types, 40+ items, and 6 major endings.

## Suggested First Play Path
1. Start as any origin/archetype.
2. On the visual region board, click location markers to move the party.
3. Use the bottom action dock to talk, search, camp, or fight at the current hotspot.
4. Recruit companions when dialogue offers it.
5. Fight the Ash Beach raid to learn the visual grid combat.
6. Resolve Cinderfall, cross into Wyrdroot, then enter Blackglass.
7. In the Heart-Cinder chamber, choose a final covenant and read the epilogues.

## Controls
- Click a map marker to move the party to that hotspot.
- Click the current hotspot or **Talk** to open docked dialogue.
- In combat, choose **Move** or an ability, then click highlighted tiles or targets.
- Use the top navigation for Map, Journal, Inventory, Camp, Party, Lore, and Save.
