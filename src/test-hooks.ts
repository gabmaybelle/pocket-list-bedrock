// Hooks for the self-test (a test-only pack in a throwaway world): it can't call into this pack, so
// it sends /scriptevent pocket_list:debug <json> and this answers with pocket_list:debug_reply <json>.
// A player's game never sends these (script events need an operator).
import { system, world } from "@minecraft/server";
import { Place, cleanData, count, hudText } from "./list-logic.js";
import { nearbyInto, onUseBlock } from "./chests.js";
import { allItemIds, knownId, knownTag, resolve, searchItems, tagMatch } from "./items.js";
import { NS, dataOf, forget, placesOf, saveData } from "./store.js";
import { counted, totalsFor } from "./count.js";
import { lastShown } from "./hud.js";

type Json = Record<string, unknown>;

function handle(q: Json): Json {
  switch (q.op) {
    case "items": {
      const ids = allItemIds();
      return { count: ids.length, known: (q.ids as string[]).map((id) => knownId(id)) };
    }
    case "tag":
      return { match: tagMatch(q.item as string, q.tag as string), known: knownTag(q.tag as string) };
    case "resolve":
      return { entry: resolve(q.name as string, (q.amount as number) ?? 1) };
    case "search":
      return { ids: searchItems(q.query as string, (q.limit as number) ?? 24) };
    case "nearby": {
      const totals = new Map<string, number>();
      const places = q.places as Place[];
      let gone: Place[] = [];
      const r = nearbyInto(places, q.dimension as string, q.at as { x: number; y: number; z: number }, totals, (g) => (gone = g));
      return { totals: Object.fromEntries(totals), read: r.read, skipped: r.skipped, gone };
    }
    case "hud": {
      const data = cleanData(q.data);
      const list = data.lists[data.active];
      const totals = new Map(Object.entries(q.totals as Record<string, number>));
      return { text: hudText(list, count(list.entries, totals, tagMatch), data.hudLines) };
    }
    case "player": {
      // What the pack holds for a player by name: their totals, counted lines, places and the last HUD text sent.
      const player = world.getAllPlayers().find((p) => p.name === q.name);
      if (!player) return { error: `no player ${q.name}` };
      return { totals: Object.fromEntries(totalsFor(player)), counted: counted(player), places: placesOf(player), data: dataOf(player), shown: lastShown(player) };
    }
    case "set_data": {
      // A player's lists and settings, as if they had made them (a test can't drive the forms).
      const player = world.getAllPlayers().find((p) => p.name === q.name);
      if (!player) return { error: `no player ${q.name}` };
      Object.assign(dataOf(player), cleanData(q.data));
      saveData(player);
      return { ok: true };
    }
    case "reload": {
      // Forgets what's cached for a player and reads their saved properties again: proves the saves.
      const player = world.getAllPlayers().find((p) => p.name === q.name);
      if (!player) return { error: `no player ${q.name}` };
      forget(player.id);
      return { data: dataOf(player), places: placesOf(player) };
    }
    case "use_block": {
      // The player used the block there (a simulated player's use may not reach the event).
      const player = world.getAllPlayers().find((p) => p.name === q.name);
      if (!player) return { error: `no player ${q.name}` };
      const block = player.dimension.getBlock({ x: q.x as number, y: q.y as number, z: q.z as number });
      if (!block) return { error: "no block loaded there" };
      onUseBlock(player, block);
      return { ok: true };
    }
    default:
      return { error: `unknown op ${q.op}` };
  }
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:debug`) return;
  let reply: Json;
  try {
    reply = handle(JSON.parse(ev.message) as Json);
  } catch (e) {
    reply = { error: String(e) };
  }
  const text = JSON.stringify(reply);
  // A script event's message is limited; long replies are split and numbered.
  const MAX = 1800;
  const parts = Math.max(1, Math.ceil(text.length / MAX));
  for (let i = 0; i < parts; i++) system.sendScriptEvent(`${NS}:debug_reply`, JSON.stringify({ i, n: parts, s: text.slice(i * MAX, (i + 1) * MAX) }));
});
