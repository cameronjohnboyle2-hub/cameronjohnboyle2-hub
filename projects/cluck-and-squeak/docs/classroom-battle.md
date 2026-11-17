# Classroom Battle — teacher guide and validation

Added November 16, 2026. Updated November 17 with shared regiment tactics and a 300-sticker limit.

## Before class

1. Import/reimport `figma-plugin/manifest.json` as a development plugin in Figma/FigJam. The plugin now has two menu commands: **Classroom Battle — selected stickers** and **Perpetual Civilization**. Select the classroom command for this activity.
2. Rehearse on a copy of the board. Start with 50–100 stickers, then try up to **300 total** before increasing the limit in a future release.
3. Give students an empty area for two armies. Ask them to place small chicken/mouse stickers there, away from the retrospective cards. Keep images or simple sticker groups no larger than 512×512 px. Text emoji stickers should contain at most 32 characters.
4. Choose one teacher as the host. Other people simply watch the board. Do not run a second host or the perpetual plugin during the classroom battle. The classroom host metadata is an advisory guard, not a distributed lock.

## Run the battle

1. Select the students' chicken stickers on the board and click **Add selected 🐔**.
2. Select the mouse stickers and click **Add selected 🐭**. Students' image stickers are accepted this way even if the plugin cannot recognize their artwork. You do not need to recreate or rename them.
3. Alternatively, **Detect selected emojis** recognizes unambiguous short animal text/names. It does not perform image recognition. Unrecognized objects need an explicit team. The host sees how many were skipped.
4. Check both counts. Selecting the same sticker twice does not duplicate it. Frames, sections, notes/stickies, tables, widgets, locked/invisible objects, large objects and owned civilization objects are skipped. Eligible groups/instances move as a whole; do not select both a group and its contents. Instance descendants cannot be enrolled individually; select the whole small instance instead.
5. Draw the formations where you want them to start. Each regiment keeps its drawn spacing on the march.
6. Leave room between the armies to see the march. Stickers already within contact range may engage as soon as the battle starts.
7. Click **Start battle**, then **Focus armies** if desired. Only the teacher's viewport changes. Ask viewers to zoom to the battle themselves; the plugin does not control their cameras.
8. Cheer for your army. Standing counts and the clock appear in the host panel and a temporary on-board scoreboard. Defeated stickers fade rather than being deleted. Ranged volleys use up to 12 temporary projectile shapes.
9. **Pause** freezes the simulation; **Resume battle** continues it. Hiding the host's plugin view pauses automatically. Sound is optional and plays only on the host.
10. The clock shows elapsed time. The battle ends when one army has zero survivors. If both armies fall, the result is a draw.

## Restore and rematch

Use **Restore original stickers & end session**. It restores the enrolled stickers' original transforms and opacity, removes only the temporary owned scoreboard/projectile shapes, and clears the roster. For groups whose origins rebase as children move, restoration converts the saved page-space transform through the current parent transform. It never deletes or replaces students' combatants, changes their text/fills/dimensions/names, or reparents them. Then select the same armies again for a rematch.

The original-state ledger is saved on the page before movement. Closing the plugin freezes its last board positions; it does not continue offscreen. Reopen the **Classroom Battle** command and use Restore to recover a previous session. This restores the original layout, not the interrupted battle's HP/timer state. Reopening does not automatically start a new battle.

If another person deletes a sticker, it remains deleted. If they reparent or lock one, restore preserves that change and reports it instead of forcing it back into a different group. Unlock/move that sticker back to the recorded parent if you want the plugin to restore it. Do not delete the page's restore metadata while a session is active.

## Mechanics and pacing

Classroom Battle shares the formations and combat code of the perpetual FigJam plugin. Regiments use the offsets from their drawn positions during the march. After contact, units keep fighting and move toward remaining opponents. A routed soldier seeks a nearby larger allied regiment or rallies with standing members of its own regiment. If there is no viable rally point, or if regrouping takes too long, it turns back to fight. When either side is down to four, survivors close to melee range to finish the fight. Sticker names such as “lancer,” “spearman,” and “archer” can set their roles.

Classroom playback advances the original physics at half speed. The original faction health and damage differences apply. Both sides can use different numbers of stickers when setting up the roster.

## Performance decision

See `docs/classroom-benchmark.json` for the 300-sticker benchmark, including the match duration and casualty counts. The benchmarks measure simulation CPU. Live FigJam document writes and viewer synchronization still need a rehearsal.

The match clock advances at 20 Hz and calls the original tactical step every other tick. The renderer starts with a 150 ms interval, sends at most 160 changed stickers per batch, and slows when acknowledgements take longer. Round-robin delivery gives every sticker a turn. A missing, locked, or reparented node or a stalled renderer pauses the host.

## Code and build

- `engine/classroom.js`: sticker roster, regiment setup, and finite match rules. The generated `classroom/tactics.js` packages the shared `figma-plugin/ui-controller.js`.
- `classroom/bridge.js`: selected-node enrollment, transforms, restoration ledger, board rendering and host guard.
- `classroom/ui.template.html`, `classroom/ui-controller.js`: dedicated classroom interface.
- `figma-plugin/perpetual-main.js`: original perpetual main-thread source, preserved byte for byte.
- `scripts/build-classroom.cjs`: builds the command dispatcher into `figma-plugin/code.js`; invoked by the existing build. The default/non-classroom branch runs the preserved perpetual source.
- `classroom/preview.html`: generated UI. `classroom/demo.html`: optional browser rehearsal with a simulated board and 50 sample stickers per faction. It is explicitly not a live FigJam test.

Commands: `npm run build`, `npm test`, `npm run test:classroom`, `npm run benchmark:classroom`. There are no added package dependencies or network permissions. Do not hand-edit generated `figma-plugin/code.js`; edit the corresponding source and rebuild.

## What was checked

Automated tests cover preservation of the drawn march formation, regrouping into a larger allied regiment, distant survivors closing to fight, and elimination as the only finish condition. The full verifier includes the classroom board bridge, sticker restoration, rendering limits, and perpetual regression tests.

**Not verified live:** real FigJam sticker varieties, native text/font rendering, simultaneous viewers, document-write throughput, collaboration/network throttling, camera behavior on student devices, host handoff, or restoration after a real plugin crash. The local browser preview could not be opened in this tool session: localhost timed out and file URL navigation was blocked by browser policy. No student board was modified during development.

## Required classroom rehearsal

- On a disposable copy, enroll text emojis and the exact image stickers students will use. Verify that counts and faction assignment are correct.
- Try 50, then 100, then the expected class size. Observe at least one remote viewer while editing a nonparticipant note. Reduce the roster if either client becomes sluggish.
- Confirm all combatants are the original objects: text/fills/names/dimensions/parent IDs remain the same. Only translation and opacity should change.
- Complete a battle and confirm the losing army has zero survivors on the board.
- Pause/resume and restore; compare the pre-battle board.
- Close/reopen mid-battle and restore the originals. Try deletion/reparenting only on the disposable copy and confirm the reported behavior.
- Finally, open **Perpetual Civilization** and confirm its existing workflow still works. That code was preserved, but the native host must still load both menu paths correctly.

Official platform references: [plugin menu commands](https://developers.figma.com/docs/plugins/manifest/#menu), [plugin lifecycle](https://developers.figma.com/docs/plugins/how-plugins-run/), [absolute and relative transforms](https://developers.figma.com/docs/plugins/api/node-properties/), [plugin API typings](https://github.com/figma/plugin-typings/blob/master/plugin-api.d.ts).
