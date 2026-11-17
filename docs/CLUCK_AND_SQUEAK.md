# Cluck & Squeak

I built a tiny war between chickens and mice and put it on a FigJam board. The fun part is watching the two factions turn an ordinary whiteboard into a battlefield: notes and frames become terrain, and connectors become roads.

## Two ways to play

- **Perpetual Civilization.** Each side gathers resources, recruits regiments, and pushes toward the other capital. Truces give both sides room to recover, and reinforcements can merge with surviving units.
- **Classroom Battle.** A host picks existing chicken and mouse stickers and starts a finite battle. The stickers animate on the board and can be restored to their starting positions afterward.

## How it works

A seeded JavaScript engine steps the simulation independently of the renderer. A standalone browser version draws to Canvas, and a FigJam development plugin translates movement into board updates. The plugin batches updates so the board can keep up. Classroom mode records the starting sticker state so the host can restore it even after reopening the plugin.

The classroom engine and plugin UI checks passed locally. The [standalone browser source](../projects/cluck-and-squeak) is available here. The FigJam plugin remains in my development copy.
