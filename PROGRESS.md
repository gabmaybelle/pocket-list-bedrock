# Progress

What's done, what's broken, what's next. Newest entry first. Each session adds a row before it
ends, saying what changed, what the tests counted, what was learned, and what was deliberately not
done.

## Where things stand

- **Done:** the corner list, the notebook and its recipe, the list screen as
  forms (lines, add by name, Paste List, Copy List, Clear Done, Lists, Settings), counting the
  inventory, offhand and remembered containers live, item tags, lists saved on the player, the welcome
  note and the finish chime. Unit tests, type check, schema check, the headless self-test on the
  release and Preview servers, and a simulated-player run of the whole counting loop pass.
- **Broken:** nothing known as of this writing. Seen in the game on PC (release 1.26.63) and on an
  iPhone, where a real player's chest counted.
- **Next:** the first listing (CurseForge, as a Bedrock add-on). The next feature is Break down,
  from a table of the vanilla recipes. Releases are on GitHub.

## Log

| Date | Session | What happened |
| --- | --- | --- |
| 2026-11-09 | Phone look | Joined from an iPhone over the home network (a test server with the packs, Creative). Planks put in a chest kept their line green: a real player's chest use is remembered, which no headless test can show. Paste List worked from the iPhone (Paste shows once the keyboard's suggestion bar is out of the way) and made the list. Fixed: a player leaving with a form open logged a warning; a form whose player quit now ends quietly. Unit tests and type check pass. |
| 2026-11-09 | PC look | The add-on seen in the game on PC (release 1.26.63), four runs, the window captured at each step of a scripted sequence. Seen working: the welcome note; the list drawn top left and counting live (0/64 to 64/64 in green, a tag line counting every plank); the notebook sprite in the hotbar and in hand; an ordinary `/title` showing in the middle with the list still in place (the spike swallowed it; the title reset fixes that); every screen of the list screen; the four corners; "...and 3 more" at two lines; hide and show; the "all gathered" title and note. Fixed from what was seen: closing a form (its X) reopened the list screen, so screens stacked up and one never closed (closing now closes; Back buttons still go back); finished lines on buttons were dark green on the green hover colour, unreadable (now "- gathered" in plain text, and the open list "- open now"); the list had no backdrop and was hard to read over the held notebook (now in vanilla's dark text box, padded by a space each side; a hidden box stopped its label updating, so the box is never hidden and is simply as wide as its text, nothing when blank). Found: chat draws over the top-left list while messages show, and the top-right list covers the first effect icon; top left stays the default, as on Java. The client content log had no warnings or errors in any run. Self-test, simulated-player check, unit tests and schema check pass after the changes. |
| 2026-11-09 | First build | Repo and pack skeleton; the notebook item (one to a stack, a drafted 16 px sprite, recipe: two paper and string, unlocked by paper); lists and settings per player as JSON on the player; the item index from the game's own item list (spawn eggs, barriers and the like left out), names from the ids' words (TNT by hand), tags through `ItemStack.hasTag`; counting on inventory changes and once a second; remembered containers read live within 32 blocks, a double chest read once; the corner HUD from the spike with the title times put back two ticks after each send; the list screen, line menu, search (24 matches), Paste List (semicolons as line breaks), Copy List (text in a box), Clear Done, Lists and Settings as forms, each waiting while the player is still in the chat; `/pocket_list:open` and `/pocket_list:toggle` for anyone with cheats off. Unit tests: 18, against the Java edition's numbers and cases (parser, names, HUD layout, loading, remembered places). Self-test on a Bedrock Dedicated Server, release 1.26.63 and Preview 1.26.70: 9 cases (item index, notebook, tags, names, search, commands, a chest and a barrel counted live and forgotten when gone, a double chest counted once, the HUD text), no error or warning lines. A simulated player (test world only): 24 planks counted and the HUD text sent as expected, a used chest remembered and counted to 64, the finish noticed once, hide and show by command, a corner move, and the lists and places read back from the save. Learned: a custom command's short alias must not be a game command's (`hud` warned, so the command is `toggle`); a paired double chest reports 54 slots from either half; a simulated player's block use doesn't reach `playerInteractWithBlock` (the test remembers through a hook); one pack can't read another's dynamic properties. Not done: no game window; Break down; a names table from the game's language files; the real notebook sprite. |
