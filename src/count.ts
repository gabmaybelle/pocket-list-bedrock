// Counts what a player has towards each line of their active list (the Java edition's Counter): their
// inventory and offhand, and the remembered containers nearby when that setting is on. Bedrock's
// script can't look inside a shulker box or bundle that's carried, so those count as one item each.
import { EntityEquippableComponent, EntityInventoryComponent, EquipmentSlot, Player } from "@minecraft/server";
import { Counted, activeList, count } from "./list-logic.js";
import { tagMatch } from "./items.js";
import { nearby } from "./chests.js";
import { dataOf } from "./store.js";

export function totalsFor(player: Player): Map<string, number> {
  const totals = new Map<string, number>();
  const inventory = player.getComponent(EntityInventoryComponent.componentId)?.container;
  if (inventory) {
    for (let slot = 0; slot < inventory.size; slot++) {
      const item = inventory.getItem(slot);
      if (item) totals.set(item.typeId, (totals.get(item.typeId) ?? 0) + item.amount);
    }
  }
  const offhand = player.getComponent(EntityEquippableComponent.componentId)?.getEquipment(EquipmentSlot.Offhand);
  if (offhand) totals.set(offhand.typeId, (totals.get(offhand.typeId) ?? 0) + offhand.amount);
  if (dataOf(player).countChests) nearby(player, totals);
  return totals;
}

/** Each line of the player's active list with what they have. */
export function counted(player: Player): Counted[] {
  return count(activeList(dataOf(player)).entries, totalsFor(player), tagMatch);
}
