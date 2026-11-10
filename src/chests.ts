// Containers you've opened, so your list can count what's waiting in storage (the Java edition's
// ChestMemory). Nothing is read from a container you haven't opened yourself. On Bedrock the script
// runs where the world is, so a remembered container is read live whenever it's loaded and within 32
// blocks, instead of from a copy taken when it closed.
import { Block, Player, world } from "@minecraft/server";
import { Place, dedupeDoubleChests, nearbyPlaces, placeKey, remember } from "./list-logic.js";
import { placesOf, savePlaces } from "./store.js";

/** Chests, barrels, shulker boxes, hoppers, dispensers and droppers (ChestMemory.remembers); not furnaces or ender chests. */
export function remembers(typeId: string): boolean {
  return typeId === "minecraft:chest" || typeId === "minecraft:trapped_chest" || typeId === "minecraft:barrel" || typeId.endsWith("shulker_box") || typeId === "minecraft:hopper" || typeId === "minecraft:dispenser" || typeId === "minecraft:dropper";
}

const isChest = (typeId: string) => typeId === "minecraft:chest" || typeId === "minecraft:trapped_chest";

/** The player used a container block: it's remembered from now on. */
export function onUseBlock(player: Player, block: Block) {
  if (!remembers(block.typeId)) return;
  const place: Place = { d: block.dimension.id, x: block.x, y: block.y, z: block.z };
  if (remember(placesOf(player), place)) savePlaces(player);
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  try {
    onUseBlock(player, block);
  } catch (e) {
    console.warn(`Pocket List: remembering a container: ${e}`);
  }
});

/** Adds what the remembered containers near the player hold to the totals. */
export function nearby(player: Player, totals: Map<string, number>) {
  nearbyInto(placesOf(player), player.dimension.id, player.location, totals, (gone) => {
    if (!gone.length) return;
    const places = placesOf(player);
    const goneKeys = new Set(gone.map(placeKey));
    for (let i = places.length - 1; i >= 0; i--) if (goneKeys.has(placeKey(places[i]))) places.splice(i, 1);
    savePlaces(player);
  });
}

/**
 * Reads the places within reach of a point into the totals. A place whose block is no longer a
 * container is reported as gone (and never read again). A double chest shows its 54 slots from either
 * half, so when both halves are remembered one is read; a single chest's 27 slots are read as they are.
 */
export function nearbyInto(places: Place[], dimensionId: string, at: { x: number; y: number; z: number }, totals: Map<string, number>, onGone: (gone: Place[]) => void): { read: number; skipped: number } {
  const gone: Place[] = [];
  const blocks = new Map<string, Block>();
  let skipped = 0;
  const candidates = nearbyPlaces(places, dimensionId, at);
  if (!candidates.length) return { read: 0, skipped: 0 };
  const dimension = world.getDimension(dimensionId);
  for (const p of candidates) {
    let block: Block | undefined;
    try {
      block = dimension.getBlock({ x: p.x, y: p.y, z: p.z });
    } catch {
      block = undefined; // not loaded
    }
    if (!block) {
      skipped++;
      continue;
    }
    if (!remembers(block.typeId)) {
      gone.push(p);
      continue;
    }
    blocks.set(placeKey(p), block);
  }
  const pairable = (p: Place) => {
    const b = blocks.get(placeKey(p));
    return !!b && isChest(b.typeId) && (b.getComponent("minecraft:inventory")?.container?.size ?? 0) > 27;
  };
  const sameKind = (a: Place, b: Place) => blocks.get(placeKey(a))?.typeId === blocks.get(placeKey(b))?.typeId;
  let read = 0;
  const loaded = candidates.filter((c) => blocks.has(placeKey(c)));
  for (const p of dedupeDoubleChests(loaded, pairable, sameKind)) {
    const container = blocks.get(placeKey(p))?.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    read++;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (item) totals.set(item.typeId, (totals.get(item.typeId) ?? 0) + item.amount);
    }
  }
  onGone(gone);
  return { read, skipped };
}
