// The list in a corner of the screen. The resource pack's hud_screen.json has one label per corner;
// each keeps the last title text that began with its key ("[pl:tr]" for the top right), even after the
// title itself has gone, and the big centre title is hidden whenever it begins with "[pl:". So the list
// goes out as a title with no fade-in, stay or fade-out, only when its text changes.
//
// Setting a title with those times also sets the player's title times, which would make a later
// ordinary /title show for no time at all; two ticks after each send, "title @s reset" puts the
// times back (the label has kept its text by then; the UI sees only the last title of a tick).
import { Player, system, world } from "@minecraft/server";
import { Corner, Counted, activeList, finishedMessage, hudText } from "./list-logic.js";
import { dataOf } from "./store.js";

const KEYS: Record<Corner, string> = { top_right: "[pl:tr]", top_left: "[pl:tl]", bottom_right: "[pl:br]", bottom_left: "[pl:bl]" };
const TIMES = { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0 };

interface Shown {
  corner: Corner;
  text: string;
  /** True while the old corner is being blanked after a corner change; nothing else is sent then. */
  moving: boolean;
  /** The list the "all gathered" note was last judged for, and whether it was finished then. */
  finishedList?: string;
  wasFinished?: boolean;
  resetPending: boolean;
}

const shown = new Map<string, Shown>();

/** What was last drawn for a player (the self-test reads it). */
export const lastShown = (player: Player) => shown.get(player.id);

function state(player: Player): Shown {
  let s = shown.get(player.id);
  if (!s) {
    s = { corner: dataOf(player).corner, text: "", moving: false, resetPending: false };
    shown.set(player.id, s);
  }
  return s;
}

function send(player: Player, s: Shown, corner: Corner, body: string) {
  player.onScreenDisplay.setTitle(KEYS[corner] + body, TIMES);
  if (s.resetPending) return;
  s.resetPending = true;
  system.runTimeout(() => {
    s.resetPending = false;
    try {
      if (player.isValid) player.runCommand("title @s reset");
    } catch (e) {
      console.warn(`Pocket List: title reset: ${e}`);
    }
  }, 2);
}

/** Draws the player's list as it stands (or blanks the corner when the HUD is off or the list is empty). */
export function refresh(player: Player, counted: Counted[]) {
  const data = dataOf(player);
  const s = state(player);
  if (s.moving) return;
  if (s.corner !== data.corner) {
    // The old corner's label keeps the last text it was given: blank it first, draw the new corner
    // two ticks later (the game shows only the last title set in a tick).
    const old = s.corner;
    s.corner = data.corner;
    s.moving = true;
    send(player, s, old, "");
    s.text = "";
    system.runTimeout(() => {
      s.moving = false;
      if (player.isValid) refresh(player, counted);
    }, 3);
    return;
  }
  const list = activeList(data);
  const text = data.hud ? hudText(list, counted, data.hudLines) : "";
  if (text !== s.text) {
    s.text = text;
    send(player, s, s.corner, text);
  }
  celebrate(player, s, list.name, counted);
}

/** A chime and a note, once, when the last line is ticked off (Counter.celebrate). */
function celebrate(player: Player, s: Shown, listName: string, counted: Counted[]) {
  const finished = counted.length > 0 && counted.every((c) => c.done);
  if (s.finishedList === listName && s.wasFinished === false && finished) {
    try {
      player.playSound("note.chime", { pitch: 0.6, volume: 1.4 });
    } catch {
      /* a sound that doesn't exist here is no reason to lose the note */
    }
    player.sendMessage(finishedMessage(activeList(dataOf(player))));
  }
  s.finishedList = listName;
  s.wasFinished = finished;
}

/** Forgets what was drawn for a player who left; a player who rejoins is drawn afresh. */
world.afterEvents.playerLeave.subscribe(({ playerId }) => shown.delete(playerId));
