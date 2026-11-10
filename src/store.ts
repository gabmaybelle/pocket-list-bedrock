// Each player's lists, settings and remembered containers, kept on the player as dynamic properties
// (JSON), so they're the player's own and travel with them in that world, as the Java edition's
// config/pocket_list.json is the player's and not the world's. Loaded once when the player appears and
// kept in memory while they're on; saved whenever something changes.
import { Player, world } from "@minecraft/server";
import { Data, Place, cleanData, cleanPlaces, newData } from "./list-logic.js";

export const NS = "pocket_list";
const P_DATA = `${NS}:data`;
const P_CHESTS = `${NS}:chests`;

const cache = new Map<string, { data: Data; places: Place[] }>();

function read(player: Player, prop: string): unknown {
  const raw = player.getDynamicProperty(prop);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Pocket List: ${player.name}'s ${prop} couldn't be read, starting afresh: ${e}`);
    return undefined;
  }
}

function entry(player: Player) {
  let c = cache.get(player.id);
  if (!c) {
    const raw = read(player, P_DATA);
    c = { data: raw === undefined ? newData() : cleanData(raw), places: cleanPlaces(read(player, P_CHESTS)) };
    cache.set(player.id, c);
  }
  return c;
}

/** The player's lists and settings. */
export const dataOf = (player: Player): Data => entry(player).data;

/** The containers the player has opened, oldest first. */
export const placesOf = (player: Player): Place[] => entry(player).places;

export function saveData(player: Player) {
  const d = entry(player).data;
  try {
    player.setDynamicProperty(P_DATA, JSON.stringify(d));
  } catch (e) {
    console.warn(`Pocket List: couldn't save ${player.name}'s lists: ${e}`);
  }
}

export function savePlaces(player: Player) {
  try {
    player.setDynamicProperty(P_CHESTS, JSON.stringify(entry(player).places));
  } catch (e) {
    console.warn(`Pocket List: couldn't save ${player.name}'s containers: ${e}`);
  }
}

export const forget = (playerId: string) => cache.delete(playerId);

world.afterEvents.playerLeave.subscribe(({ playerId }) => forget(playerId));
