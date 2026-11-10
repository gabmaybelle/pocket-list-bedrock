// Every item the game knows, by id and by name, and item tags. Built once, on the first use after the
// world is up (ItemTypes can't be read while the script loads).
import { ItemStack, ItemTypes } from "@minecraft/server";
import { nameIndex, resolveName, search, Entry } from "./list-logic.js";

let ids: string[] | undefined;
let byName: Map<string, string> | undefined;
const idSet = new Set<string>();
const tagCache = new Map<string, boolean>();
const tagKnown = new Map<string, boolean>();

/** Items that aren't things to gather. */
const SKIP = /^minecraft:(air|.*_spawn_egg|barrier|light_block.*|structure_block|structure_void|jigsaw|allow|deny|border_block|command_block|chain_command_block|repeating_command_block|agent_spawn_egg|npc_spawn_egg|camera|portfolio)$/;

export function allItemIds(): string[] {
  if (!ids) {
    ids = ItemTypes.getAll()
      .map((t) => t.id)
      .filter((id) => !SKIP.test(id))
      .sort();
    for (const id of ids) idSet.add(id);
  }
  return ids;
}

export function knownId(id: string): boolean {
  allItemIds();
  return idSet.has(id);
}

/** Whether this item carries this tag (an ItemStack is made once per item and tag). */
export function tagMatch(itemId: string, tag: string): boolean {
  const key = itemId + " " + tag;
  let hit = tagCache.get(key);
  if (hit === undefined) {
    try {
      hit = new ItemStack(itemId).hasTag(tag);
    } catch {
      hit = false;
    }
    tagCache.set(key, hit);
  }
  return hit;
}

/** Whether any item carries this tag (so "#minecraft:planks" is a real tag and "#minecraft:plonks" isn't). */
export function knownTag(tag: string): boolean {
  let hit = tagKnown.get(tag);
  if (hit === undefined) {
    hit = allItemIds().some((id) => tagMatch(id, tag));
    tagKnown.set(tag, hit);
  }
  return hit;
}

/** A pasted line's name as an entry, or null (nothing is guessed). */
export function resolve(name: string, amount: number): Entry | null {
  if (!byName) byName = nameIndex(allItemIds());
  return resolveName(name, amount, byName, knownId, knownTag);
}

/** Up to limit item ids matching what the player typed. */
export const searchItems = (query: string, limit: number) => search(query, allItemIds(), limit);
