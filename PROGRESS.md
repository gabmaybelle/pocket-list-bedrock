# Progress

What's done, what's broken, what's next. Newest entry first. Each session adds a row before it
ends, saying what changed, what the tests counted, what was learned, and what was deliberately not
done.

## Where things stand

- **Done:** the add-on's first build: the corner list, the notebook and its recipe, the list screen as
  forms (lines, add by name, Paste List, Copy List, Clear Done, Lists, Settings), counting the
  inventory, offhand and remembered containers live, item tags, lists saved on the player, the welcome
  note and the finish chime. Unit tests, type check, schema check, the headless self-test on the
  release and Preview servers, and a simulated-player run of the whole counting loop pass.
- **Broken:** nothing known as of this writing. Not yet seen in a game window: the forms, the notebook
  sprite and the corner list drawn by this pack (the same JSON UI as the spike, which was seen).
- **Next:** 0.1.0 release once the look is checked in the game (PC and phone) and the notebook has
  its real sprite. Break down, from a table of the vanilla recipes, is for 0.2.0.

## Log

| Date | Session | What happened |
| --- | --- | --- |
| 2026-11-09 | First build | Repo and pack skeleton; the notebook item (one to a stack, a drafted 16 px sprite, recipe: two paper and string, unlocked by paper); lists and settings per player as JSON on the player; the item index from the game's own item list (spawn eggs, barriers and the like left out), names from the ids' words (TNT by hand), tags through `ItemStack.hasTag`; counting on inventory changes and once a second; remembered containers read live within 32 blocks, a double chest read once; the corner HUD from the spike with the title times put back two ticks after each send; the list screen, line menu, search (24 matches), Paste List (semicolons as line breaks), Copy List (text in a box), Clear Done, Lists and Settings as forms, each waiting while the player is still in the chat; `/pocket_list:open` and `/pocket_list:toggle` for anyone with cheats off. Unit tests: 18, against the Java edition's numbers and cases (parser, names, HUD layout, loading, remembered places). Self-test on a Bedrock Dedicated Server, release 1.26.63 and Preview 1.26.70: 9 cases (item index, notebook, tags, names, search, commands, a chest and a barrel counted live and forgotten when gone, a double chest counted once, the HUD text), no error or warning lines. A simulated player (test world only): 24 planks counted and the HUD text sent as expected, a used chest remembered and counted to 64, the finish noticed once, hide and show by command, a corner move, and the lists and places read back from the save. Learned: a custom command's short alias must not be a game command's (`hud` warned, so the command is `toggle`); a paired double chest reports 54 slots from either half; a simulated player's block use doesn't reach `playerInteractWithBlock` (the test remembers through a hook); one pack can't read another's dynamic properties. Not done: no game window; Break down; a names table from the game's language files; the real notebook sprite. |
