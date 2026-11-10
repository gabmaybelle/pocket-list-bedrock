# Pocket List for Bedrock

[![checks](https://github.com/gabmaybelle/pocket-list-bedrock/actions/workflows/checks.yml/badge.svg)](https://github.com/gabmaybelle/pocket-list-bedrock/actions/workflows/checks.yml)

A little checklist in the corner of your screen that ticks itself off as you gather.

This is the Bedrock Edition of [Pocket List](https://github.com/gabmaybelle/pocket-list), the Java
mod for Fabric and NeoForge, as a behaviour pack and a resource pack. Made by Gabby.

Minecraft Bedrock 1.26.60 or newer, no experiments. Download the `.mcaddon` from the
[releases](https://github.com/gabmaybelle/pocket-list-bedrock/releases), open it to import it, then
turn on the Pocket List behaviour pack for your world (the resource pack comes with it). It works in
single player, on Realms and on servers that carry the packs.

## Playing

Craft a **Pocket List Notebook** (two paper and string, shapeless) and use it, or type
`/pocket_list:open`, to open your list. Add items by name ("oak planks" finds them; so does an id
such as `minecraft:torch`, or `#minecraft:planks` for any kind of plank), set how many, and the list
sits in a corner of your screen: "24/64 Oak Planks", green when you have enough, a chime when the
whole list is done. It counts what you carry and what's in the chests, barrels and shulker boxes
you've opened nearby.

- **Paste List** makes a new list from text: one item per line, or between semicolons, such as
  "64 oak planks; 16 torches" or "Torches x16". Lines that match no item are named, never guessed.
- **Copy List** shows the list as text to copy; pasted back into Pocket List it makes the same list.
- **Clear Done** takes everything you've gathered off the list.
- **Lists** keeps several lists; **Settings** has the corner list on or off, its corner and how many
  lines it shows, and whether nearby containers count.
- Sneak and use the notebook, or type `/pocket_list:toggle`, to hide and show the corner list.

**On a phone or tablet:** the bottom corners sit under your thumbs, so the list starts top left.

## How it differs from the Java edition

Bedrock can't do a few things the Java way:

- There are no hotkeys: the notebook and the commands open the list instead of K, and there's no
  pin key over an inventory slot or the recipe book. Search by name does the adding.
- Break down (a line into its ingredients) isn't in this version yet.
- Nothing can look inside a shulker box or bundle you carry; it counts as one item. A shulker box
  placed and opened counts like a chest.
- The text you paste or copy goes through a one-line box, so semicolons stand in for line breaks.
- Lists are saved on your player in each world, not in one file for every world.

What was built and how it was checked: [PROGRESS.md](PROGRESS.md).

## Building

You need Node.js 20 or newer and git.

```
npm install
npm run build
```

The build reads the icon from the Java edition's repo at the tag in `java-source.json`, so both
editions share one. It uses `../pocket-list` if you have it next to this folder, and otherwise clones
it into `.cache/`. Out come:

- `build/packs/bp` and `build/packs/rp`: the behaviour and resource packs
- `dist/PocketList-<version>.mcaddon`: both packs in one file to import

`npm test` runs the unit tests, `npm run typecheck` checks the scripts against the script API typings,
and `npm run validate` checks every pack file against Mojang's and the community JSON schemas.
`node tools/bds-check.js <folder> --zip <bedrock-server zip>` runs the self-test on a Bedrock Dedicated
Server with no window (downloading and running the server means you accept Minecraft's EULA).

## Licence

MIT. The Minecraft item names and tags the add-on reads come from the game as it runs.
