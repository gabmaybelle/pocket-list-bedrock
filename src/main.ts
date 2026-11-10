// Pocket List for Bedrock: the behaviour pack's script. A little checklist in the corner of your
// screen that ticks itself off as you gather. The same mod as the Java edition (gabmaybelle/pocket-list),
// whose classes are the spec: the rules are in list-logic.ts, the lists live on the player (store.ts),
// counting is count.ts and chests.ts, the corner HUD is hud.ts, the screens are forms.ts, and the
// notebook and commands are notebook.ts.
import { Player, system, world } from "@minecraft/server";
import "./notebook.js";
import "./test-hooks.js";
import { dataOf, saveData } from "./store.js";
import { counted } from "./count.js";
import { refresh } from "./hud.js";

export const VERSION = "0.1.0";

/** Players whose inventory changed since the last count: counted again next tick, not every tick. */
const dirty = new Set<string>();

world.afterEvents.playerInventoryItemChange.subscribe(({ player }) => {
  if (dirty.has(player.id)) return;
  dirty.add(player.id);
  system.run(() => {
    dirty.delete(player.id);
    if (player.isValid) update(player);
  });
});

function update(player: Player) {
  try {
    refresh(player, counted(player));
  } catch (e) {
    console.warn(`Pocket List: counting for ${player.name}: ${e}`);
  }
}

// Containers near a player change without any inventory event of theirs: everyone is counted again
// once a second, which also draws the list for a player who has just arrived.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) update(player);
}, 20);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  const data = dataOf(player);
  if (!data.welcomed) {
    data.welcomed = true;
    saveData(player);
    system.runTimeout(() => {
      if (player.isValid) player.sendMessage("§ePocket List§r: craft a notebook (two paper and string) and use it, or type §f/pocket_list:open§r, to start a list of things to gather.");
    }, 40);
  }
});

system.run(() => {
  console.log(`Pocket List ${VERSION}: script loaded`);
});
