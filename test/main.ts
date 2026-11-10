// Pocket List self-test: a test-only pack for a throwaway test world, never shipped. Stable script
// APIs only, so it runs on a plain dedicated server with no experiments and no player.
//
//   /scriptevent pocket_list:test          every case, then "PL TEST: DONE"
//   /scriptevent pocket_list:test <name>   the cases whose name starts with <name>
//
// Each case prints "PL TEST: CASE <name>: PASS" or "... FAIL <why>"; tools/bds-check.js reads them.
// The pack itself is asked through its pocket_list:debug hooks, since one pack can't call another.
import { world, system, ItemStack, BlockPermutation, Dimension, Vector3 } from "@minecraft/server";

const NS = "pocket_list";
const GROUND = -60; // a flat world's surface: the first air block is at y -60
const log = (s: string) => console.warn("PL TEST: " + s);
const wait = (ticks: number) => new Promise<void>((resolve) => system.runTimeout(() => resolve(), ticks));
class Fail extends Error {}
function must(cond: unknown, why: string): asserts cond {
  if (!cond) throw new Fail(why);
}
const overworld = (): Dimension => world.getDimension("minecraft:overworld");
const at = (x: number, z: number, y = GROUND): Vector3 => ({ x, y, z });

// ---- asking the pack: a reply comes back in numbered parts, joined here.
type Json = Record<string, any>;
let pending: ((r: Json) => void) | undefined;
const parts: string[] = [];
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:debug_reply`) return;
  const p = JSON.parse(ev.message) as { i: number; n: number; s: string };
  parts[p.i] = p.s;
  if (parts.filter((x) => x !== undefined).length === p.n) {
    const text = parts.join("");
    parts.length = 0;
    const f = pending;
    pending = undefined;
    f?.(JSON.parse(text));
  }
});
function ask(q: Json): Promise<Json> {
  return new Promise((resolve, reject) => {
    pending = resolve;
    system.sendScriptEvent(`${NS}:debug`, JSON.stringify(q));
    system.runTimeout(() => {
      if (pending === resolve) {
        pending = undefined;
        reject(new Fail("no reply from the pack to " + JSON.stringify(q)));
      }
    }, 60);
  });
}

// Blocks a case places, so a failed case still cleans up after itself.
const placed: Vector3[] = [];
function place(type: string, loc: Vector3) {
  const block = overworld().getBlock(loc);
  must(block, `no block loaded at ${loc.x} ${loc.y} ${loc.z}`);
  block.setPermutation(BlockPermutation.resolve(type));
  placed.push(loc);
  return block;
}
function fill(loc: Vector3, items: [string, number][], firstSlot = 0) {
  const container = overworld().getBlock(loc)?.getComponent("minecraft:inventory")?.container;
  must(container, `no container at ${loc.x} ${loc.y} ${loc.z}`);
  items.forEach(([id, n], i) => container.setItem(firstSlot + i, new ItemStack(id, n)));
  return container;
}
function cleanUp() {
  for (const loc of placed.splice(0)) {
    try {
      overworld().getBlock(loc)?.setPermutation(BlockPermutation.resolve("minecraft:air"));
    } catch {
      /* unloaded */
    }
  }
}

type Case = { name: string; run: () => Promise<void> };
const cases: Case[] = [];
const OW = "minecraft:overworld";

// The item index: every vanilla item the player can gather, and the notebook, and nothing made up.
cases.push({
  name: "items_known",
  run: async () => {
    const ids = ["minecraft:oak_planks", "minecraft:torch", "minecraft:cobblestone", "minecraft:stick", "minecraft:crafting_table", "minecraft:glass_pane", `${NS}:notebook`, "minecraft:nonsense"];
    const r = await ask({ op: "items", ids });
    must(r.count > 500, `only ${r.count} items known`);
    ids.slice(0, -1).forEach((id, i) => must(r.known[i] === true, `${id} isn't known`));
    must(r.known[ids.length - 1] === false, "a made-up id is known");
  },
});

// The notebook is an item the game knows, one to a stack.
cases.push({
  name: "notebook_item",
  run: async () => {
    const book = new ItemStack(`${NS}:notebook`);
    must(book.typeId === `${NS}:notebook`, `the notebook is ${book.typeId}`);
    must(book.maxAmount === 1, `the notebook stacks to ${book.maxAmount}`);
  },
});

// Item tags: oak planks are planks, stone isn't, and a tag no item carries isn't a tag.
cases.push({
  name: "tag_planks",
  run: async () => {
    const planks = await ask({ op: "tag", item: "minecraft:oak_planks", tag: "minecraft:planks" });
    must(planks.match === true, "oak planks don't carry minecraft:planks");
    must(planks.known === true, "minecraft:planks isn't a known tag");
    const stone = await ask({ op: "tag", item: "minecraft:stone", tag: "minecraft:planks" });
    must(stone.match === false, "stone carries minecraft:planks");
    const plonks = await ask({ op: "tag", item: "minecraft:stone", tag: "minecraft:plonks" });
    must(plonks.known === false, "minecraft:plonks counts as a tag");
  },
});

// Names as a player types them: the game's items by name, plural or not, by id, or as a tag; nothing guessed.
cases.push({
  name: "resolve_names",
  run: async () => {
    const expect = async (name: string, items: string[] | null, tag?: string) => {
      const r = await ask({ op: "resolve", name, amount: 3 });
      if (items === null) return must(r.entry === null, `"${name}" matched ${JSON.stringify(r.entry)}`);
      must(r.entry, `"${name}" matched nothing`);
      must(r.entry.need === 3, `"${name}" needs ${r.entry.need}`);
      if (tag) must(r.entry.tag === tag, `"${name}" is tag ${r.entry.tag}, expected ${tag}`);
      else must(JSON.stringify(r.entry.items) === JSON.stringify(items), `"${name}" is ${JSON.stringify(r.entry.items)}, expected ${JSON.stringify(items)}`);
    };
    await expect("oak planks", ["minecraft:oak_planks"]);
    await expect("Oak_Planks", ["minecraft:oak_planks"]);
    await expect("Torches", ["minecraft:torch"]);
    await expect("glass panes", ["minecraft:glass_pane"]);
    await expect("minecraft:glass_pane", ["minecraft:glass_pane"]);
    await expect("#planks", [], "minecraft:planks");
    await expect("#minecraft:planks", [], "minecraft:planks");
    await expect("nonsense thing", null);
    await expect("minecraft:nonsense", null);
    await expect("#minecraft:plonks", null);
  },
});

// Search: the exact name first, then names starting with the words, then the rest; a limit.
cases.push({
  name: "search_items",
  run: async () => {
    const torch = await ask({ op: "search", query: "torch", limit: 24 });
    must(torch.ids[0] === "minecraft:torch", `"torch" finds ${torch.ids[0]} first`);
    must(torch.ids.includes("minecraft:soul_torch"), "\"torch\" doesn't find the soul torch");
    const planks = await ask({ op: "search", query: "oak plank", limit: 5 });
    must(planks.ids[0] === "minecraft:oak_planks", `"oak plank" finds ${planks.ids[0]} first`);
    must(planks.ids.length <= 5, `${planks.ids.length} results for a limit of 5`);
    const none = await ask({ op: "search", query: "zzqx", limit: 5 });
    must(none.ids.length === 0, "nonsense finds items");
  },
});

// The commands are registered (a call with no player fails in the callback: success count 0, no
// throw; a command that doesn't exist throws).
cases.push({
  name: "commands_registered",
  run: async () => {
    for (const cmd of ["open", "toggle"]) {
      const r = overworld().runCommand(`${NS}:${cmd}`);
      must(r.successCount === 0, `${NS}:${cmd} from the console succeeded (${r.successCount})`);
    }
    let threw = false;
    try {
      overworld().runCommand(`${NS}:nosuch`);
    } catch {
      threw = true;
    }
    must(threw, "a command that doesn't exist didn't throw, so the check above proves nothing");
  },
});

// A remembered chest nearby is counted live; far away it isn't; a chest that's gone is forgotten.
cases.push({
  name: "chest_count",
  run: async () => {
    const loc = at(10, 10);
    place("minecraft:chest", loc);
    await wait(2);
    fill(loc, [["minecraft:oak_planks", 40], ["minecraft:torch", 10], ["minecraft:oak_planks", 24]]);
    const places = [{ d: OW, x: 10, y: GROUND, z: 10 }];
    const near = await ask({ op: "nearby", places, dimension: OW, at: { x: 12.5, y: GROUND, z: 12.5 } });
    must(near.read === 1, `read ${near.read} containers, expected 1`);
    must(near.totals["minecraft:oak_planks"] === 64, `${near.totals["minecraft:oak_planks"]} planks counted, expected 64`);
    must(near.totals["minecraft:torch"] === 10, `${near.totals["minecraft:torch"]} torches counted, expected 10`);
    const far = await ask({ op: "nearby", places, dimension: OW, at: { x: 50.5, y: GROUND, z: 10.5 } });
    must(far.read === 0 && Object.keys(far.totals).length === 0, `a chest 40 blocks off was counted: ${JSON.stringify(far)}`);
    const nether = await ask({ op: "nearby", places, dimension: "minecraft:nether", at: { x: 10.5, y: GROUND, z: 10.5 } });
    must(nether.read === 0, "a chest in another dimension was counted");
    // A barrel counts too.
    const barrel = at(10, 14);
    place("minecraft:barrel", barrel);
    await wait(2);
    fill(barrel, [["minecraft:stick", 7]]);
    const both = await ask({ op: "nearby", places: [...places, { d: OW, x: 10, y: GROUND, z: 14 }], dimension: OW, at: { x: 12.5, y: GROUND, z: 12.5 } });
    must(both.read === 2 && both.totals["minecraft:stick"] === 7, `the barrel: ${JSON.stringify(both)}`);
    // The chest is gone: forgotten, and nothing counted from there.
    place("minecraft:stone", loc);
    await wait(2);
    const gone = await ask({ op: "nearby", places, dimension: OW, at: { x: 12.5, y: GROUND, z: 12.5 } });
    must(gone.read === 0 && gone.gone.length === 1, `a chest replaced by stone: ${JSON.stringify(gone)}`);
  },
});

// Two chests side by side: whether the game pairs them or not, what was put in is counted once.
cases.push({
  name: "double_chest",
  run: async () => {
    const left = at(20, 10), right = at(21, 10);
    place("minecraft:chest", left);
    place("minecraft:chest", right);
    await wait(2);
    // A paired double chest shows one 54-slot container from either half, so the halves take
    // different slots; unpaired, each half has its own 27 and the slots don't meet anyway.
    const l = fill(left, [["minecraft:cobblestone", 30]], 0);
    const r = fill(right, [["minecraft:cobblestone", 12]], 1);
    await wait(2);
    log(`INFO double chest: the left half's container has ${l.size} slots, the right's ${r.size}`);
    const places = [{ d: OW, x: 20, y: GROUND, z: 10 }, { d: OW, x: 21, y: GROUND, z: 10 }];
    const both = await ask({ op: "nearby", places, dimension: OW, at: { x: 20.5, y: GROUND, z: 10.5 } });
    must(both.totals["minecraft:cobblestone"] === 42, `${both.totals["minecraft:cobblestone"]} cobblestone counted from two halves holding 42`);
    const one = await ask({ op: "nearby", places: places.slice(1), dimension: OW, at: { x: 20.5, y: GROUND, z: 10.5 } });
    must(one.totals["minecraft:cobblestone"] === (r.size > 27 ? 42 : 12), `${one.totals["minecraft:cobblestone"]} cobblestone from the right half alone (${r.size} slots)`);
  },
});

// The HUD text for a list, counted in the game (a tag line adds up every kind of plank).
cases.push({
  name: "hud_text",
  run: async () => {
    const data = { lists: [{ name: "Porch", entries: [{ items: ["minecraft:oak_planks"], need: 64 }, { tag: "minecraft:planks", items: [], need: 16 }, { items: ["minecraft:torch"], need: 16 }] }], active: 0, hudLines: 8 };
    const r = await ask({ op: "hud", data, totals: { "minecraft:oak_planks": 24, "minecraft:birch_planks": 10 } });
    must(r.text === "§ePorch  1/3\n§f24/64 Oak Planks\n§f0/16 Torch\n§a16/16 Any planks", `the HUD reads:\n${r.text}`);
    const done = await ask({ op: "hud", data: { ...data, hudLines: 2 }, totals: { "minecraft:oak_planks": 64, "minecraft:torch": 20 } });
    must(done.text === "§aPorch: all gathered!\n§a64/64 Oak Planks\n§a16/16 Any planks\n§7...and 1 more", `the finished HUD reads:\n${done.text}`);
  },
});

// ---- the runner
let running = false;
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:test`) return;
  if (running) return log("already running");
  running = true;
  const prefix = ev.message.trim();
  const chosen = cases.filter((c) => c.name.startsWith(prefix));
  log(`start: ${chosen.length} of ${cases.length} cases${prefix ? ` (${prefix}*)` : ""}`);
  (async () => {
    let failed = 0;
    for (const c of chosen) {
      try {
        await c.run();
        log(`CASE ${c.name}: PASS`);
      } catch (e) {
        failed++;
        log(`CASE ${c.name}: FAIL ${e instanceof Fail ? e.message : `threw ${e}`}`);
      } finally {
        cleanUp();
        await wait(2);
      }
    }
    if (failed) log(`${failed} of ${chosen.length} FAILED`);
    else log(`PASS all ${chosen.length}`);
    log("DONE");
    running = false;
  })();
});

system.run(() => console.log("Pocket List test pack started"));
