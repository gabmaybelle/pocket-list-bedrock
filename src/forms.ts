// The list screen, as forms (the Java edition's PocketListScreen and PocketListSettingsScreen): the
// active list with a button per line, adding by name, Paste List, Copy List, Clear Done, the other
// lists, and the settings.
import { Player, system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, FormRejectError, FormRejectReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CORNERS, CORNER_NAMES, Counted, MAX_HUD_LINES, activeList, addList, clampNeed, clearDone, deleteList, entryName, itemName, newList, ofItem, readListText, renameList, writeListText, topUp } from "./list-logic.js";
import { dataOf, saveData } from "./store.js";
import { counted } from "./count.js";
import { resolve, searchItems } from "./items.js";
import { refresh } from "./hud.js";

const wait = (ticks: number) => new Promise<void>((r) => system.runTimeout(() => r(), ticks));

/** Shows a form, waiting while the player is still in another screen (the chat, after a command), up to about ten seconds. */
async function show<T extends { canceled: boolean; cancelationReason?: FormCancelationReason }>(form: { show(p: Player): Promise<T> }, player: Player): Promise<T | undefined> {
  for (let tries = 0; tries < 40; tries++) {
    let r: T;
    try {
      r = await form.show(player);
    } catch (e) {
      // The player left with the form open: nothing to do, and nothing worth a warning.
      if (e instanceof FormRejectError && e.reason === FormRejectReason.PlayerQuit) return undefined;
      throw e;
    }
    if (r.cancelationReason !== FormCancelationReason.UserBusy) return r.canceled ? undefined : r;
    await wait(5);
  }
  return undefined;
}

function changed(player: Player) {
  saveData(player);
  refresh(player, counted(player));
}

// No colour codes on buttons: the hovered button turns green and coloured text vanishes on it.
const line = (c: Counted) => `${Math.min(c.have, c.entry.need)}/${c.entry.need} ${entryName(c.entry)}${c.done ? " - gathered" : ""}`;

/** The list screen: the active list, a button per line, and what you can do with the list. */
export async function openMenu(player: Player): Promise<void> {
  const data = dataOf(player);
  const list = activeList(data);
  const lines = counted(player);
  const gathered = lines.filter((c) => c.done).length;
  const form = new ActionFormData().title("Pocket List");
  form.body(lines.length ? `§e${list.name}§r  ${gathered}/${lines.length} gathered\n§7Tap a line to change it.` : `§e${list.name}§r\nNothing on this list yet. Add an item by name, or paste a list.`);
  for (const c of lines) form.button(line(c));
  if (lines.length) form.divider();
  const actions: [string, () => Promise<void>][] = [
    ["Add an item", () => addItem(player)],
    ["Paste List", () => pasteList(player)],
    ["Copy List", () => copyList(player)],
    ["Clear Done", () => clearDoneAsk(player)],
    ["Lists", () => lists(player)],
    ["Settings", () => settings(player)],
  ];
  for (const [label] of actions) form.button(label);
  const r = await show(form, player);
  if (r?.selection === undefined) return;
  if (r.selection < lines.length) return lineMenu(player, lines[r.selection]);
  return actions[r.selection - lines.length][1]();
}

/** One line: more, fewer, a typed amount, or off the list. */
async function lineMenu(player: Player, c: Counted): Promise<void> {
  const data = dataOf(player);
  const list = activeList(data);
  const entry = list.entries.find((e) => e === c.entry) ?? c.entry;
  const form = new ActionFormData().title(entryName(entry)).body(`You have ${c.have} of ${entry.need}.`);
  const steps = [1, 16, 64, -1, -16, -64];
  for (const s of steps) form.button(s > 0 ? `+${s}` : `${s}`);
  form.button("Set the amount");
  form.button("Remove from the list");
  form.button("Back");
  const r = await show(form, player);
  if (r?.selection === undefined) return;
  if (r.selection < steps.length) {
    entry.need = clampNeed(entry.need + steps[r.selection]);
    changed(player);
    return openMenu(player);
  }
  if (r.selection === steps.length) {
    const m = await show(new ModalFormData().title(entryName(entry)).textField("How many you need", String(entry.need), { defaultValue: String(entry.need) }).submitButton("Save"), player);
    if (!m) return;
    const typed = m.formValues?.[0];
    if (typeof typed === "string" && /^\d+$/.test(typed.trim())) {
      entry.need = clampNeed(Number(typed.trim()));
      changed(player);
    }
    return openMenu(player);
  }
  if (r.selection === steps.length + 1) {
    list.entries = list.entries.filter((e) => e !== entry);
    changed(player);
  }
  return openMenu(player);
}

/** Add an item by name: what to look for and how many, then a button per match. */
async function addItem(player: Player): Promise<void> {
  const ask = new ModalFormData().title("Add an item").textField("Type its name", "oak planks", { tooltip: "Part of the name is enough. An id such as minecraft:torch works too, and #minecraft:planks for any planks." }).textField("How many (1 if empty)", "1", { defaultValue: "1" }).submitButton("Search");
  const r = await show(ask, player);
  if (!r?.formValues) return;
  const query = String(r.formValues[0] ?? "").trim();
  const amountText = String(r.formValues[1] ?? "").trim();
  const amount = /^\d+$/.test(amountText) ? clampNeed(Number(amountText)) : 1;
  if (!query) return openMenu(player);
  return pickItem(player, query, amount);
}

/** The items matching what was typed, a button each; an id or a tag is added as it is. */
async function pickItem(player: Player, query: string, amount: number): Promise<void> {
  const data = dataOf(player);
  // An id or a tag as typed is taken as it is.
  const exact = query.includes(":") || query.startsWith("#") ? resolve(query, amount) : null;
  if (exact) {
    topUp(activeList(data).entries, exact, activeList(data).entries.length);
    changed(player);
    player.sendMessage(`§eAdded ${amount} ${entryName(exact)}.`);
    return openMenu(player);
  }
  const hits = searchItems(query, 24);
  if (!hits.length) {
    const none = new ActionFormData().title("Add an item").body(`No items match "${query}".`).button("Try again").button("Back");
    const n = await show(none, player);
    if (n?.selection === undefined) return;
    return n.selection === 0 ? addItem(player) : openMenu(player);
  }
  const pick = new ActionFormData().title("Add an item").body(`Add ${amount} of which?`);
  for (const id of hits) pick.button(itemName(id));
  pick.button("Back");
  const p = await show(pick, player);
  if (p?.selection === undefined) return;
  if (p.selection >= hits.length) return openMenu(player);
  const entry = ofItem(hits[p.selection], amount);
  topUp(activeList(data).entries, entry, activeList(data).entries.length);
  changed(player);
  player.sendMessage(`§eAdded ${amount} ${entryName(entry)}.`);
  return openMenu(player);
}

/** Paste List: a new list from typed or pasted text (pocket_list.screen.paste). */
async function pasteList(player: Player): Promise<void> {
  const ask = new ModalFormData().title("Paste List").textField("One item per line, or between semicolons, with how many", "64 oak planks; 16 torches", { tooltip: "Such as \"64 oak planks\", \"Torches x16\" or \"minecraft:glass_pane 8\". Lines that match no item are named, never guessed." }).textField("Name the new list (or leave it empty)", "List name").submitButton("Make the list");
  const r = await show(ask, player);
  if (!r?.formValues) return;
  const text = String(r.formValues[0] ?? "");
  const name = String(r.formValues[1] ?? "");
  if (!text.trim()) {
    player.sendMessage("§eNothing to paste: type some lines first, one item per line with how many.");
    return openMenu(player);
  }
  const read = readListText(text, resolve);
  if (!read.entries.length) {
    player.sendMessage(`§eNo items recognised in that text: ${read.unknown.join(", ")}`);
    return openMenu(player);
  }
  const data = dataOf(player);
  const list = addList(data, name.trim() || read.title, read.entries);
  changed(player);
  player.sendMessage(read.unknown.length ? `§eMade ${list.name} with ${list.entries.length} lines. Not recognised: ${read.unknown.join(", ")}` : `§eMade ${list.name} with ${list.entries.length} lines.`);
  return openMenu(player);
}

/** Copy List: the list as text in a box to select and copy (there's no clipboard for scripts). */
async function copyList(player: Player): Promise<void> {
  const list = activeList(dataOf(player));
  const text = writeListText(list, "; ");
  const form = new ModalFormData().title("Copy List").label(list.entries.length ? "Select the text in the box and copy it. Pasted back into Pocket List, it makes the same list." : "This list is empty.").textField("The list as text", text, { defaultValue: text }).submitButton("Done");
  if (!(await show(form, player))) return;
  return openMenu(player);
}

async function clearDoneAsk(player: Player): Promise<void> {
  const list = activeList(dataOf(player));
  const removed = clearDone(list, counted(player));
  changed(player);
  player.sendMessage(removed ? `§eTook ${removed} gathered ${removed === 1 ? "line" : "lines"} off ${list.name}.` : `§eNothing on ${list.name} is gathered yet.`);
  return openMenu(player);
}

/** The other lists: switch, make, rename or delete. */
async function lists(player: Player): Promise<void> {
  const data = dataOf(player);
  activeList(data);
  const form = new ActionFormData().title("Lists").body("Tap a list to switch to it.");
  data.lists.forEach((l, i) => form.button(`${l.name} (${l.entries.length} ${l.entries.length === 1 ? "line" : "lines"})${i === data.active ? " - open now" : ""}`));
  form.divider();
  form.button("New List");
  form.button("Rename this list");
  form.button("Delete this list");
  form.button("Back");
  const r = await show(form, player);
  if (r?.selection === undefined) return;
  const n = data.lists.length;
  if (r.selection < n) {
    data.active = r.selection;
    changed(player);
    return openMenu(player);
  }
  switch (r.selection - n) {
    case 0:
      data.lists.push(newList(data.lists.length + 1));
      data.active = data.lists.length - 1;
      changed(player);
      return openMenu(player);
    case 1: {
      const list = activeList(data);
      const m = await show(new ModalFormData().title("Rename").textField("List name", list.name, { defaultValue: list.name }).submitButton("Save"), player);
      if (!m) return;
      const typed = m.formValues?.[0];
      if (typeof typed === "string" && typed.trim()) {
        renameList(list, typed);
        changed(player);
      }
      return openMenu(player);
    }
    case 2: {
      const list = activeList(data);
      const m = await show(new MessageFormData().title("Delete List").body(`Really delete ${list.name} and its ${list.entries.length} lines?`).button1("Delete").button2("Keep it"), player);
      if (m?.selection === undefined) return;
      if (m.selection === 0) {
        deleteList(data, data.active);
        changed(player);
      }
      return openMenu(player);
    }
    default:
      return openMenu(player);
  }
}

/** The settings (PocketListSettingsScreen): the HUD, its corner and lines, and chest counting. */
async function settings(player: Player): Promise<void> {
  const data = dataOf(player);
  const form = new ModalFormData()
    .title("Pocket List Settings")
    .toggle("HUD", { defaultValue: data.hud, tooltip: "Show the active list in a corner of your screen while you play." })
    .dropdown("HUD position", CORNERS.map((c) => CORNER_NAMES[c]), { defaultValueIndex: CORNERS.indexOf(data.corner), tooltip: "Which corner the list sits in. On a phone the bottom corners are under your thumbs." })
    .slider("HUD lines", 1, MAX_HUD_LINES, { defaultValue: data.hudLines, valueStep: 1, tooltip: 'How many lines the HUD shows at most; the rest are summed up as "and 3 more".' })
    .toggle("Count nearby containers", { defaultValue: data.countChests, tooltip: "Count what's in the chests, barrels and shulker boxes you've opened within 32 blocks." })
    .submitButton("Save");
  const r = await show(form, player);
  if (!r) return;
  if (r.formValues) {
    const [hud, corner, lines, chests] = r.formValues;
    if (typeof hud === "boolean") data.hud = hud;
    if (typeof corner === "number" && CORNERS[corner]) data.corner = CORNERS[corner];
    if (typeof lines === "number") data.hudLines = Math.max(1, Math.min(MAX_HUD_LINES, Math.trunc(lines)));
    if (typeof chests === "boolean") data.countChests = chests;
    changed(player);
  }
  return openMenu(player);
}

/** Each screen by name, for the test hooks (a test opens a screen without clicking through to it). */
export const screens: Record<string, (player: Player, arg?: string) => Promise<void>> = {
  menu: openMenu,
  add: addItem,
  pick: (player, arg) => pickItem(player, arg ?? "torch", 16),
  line: (player) => {
    const first = counted(player)[0];
    return first ? lineMenu(player, first) : openMenu(player);
  },
  paste: pasteList,
  copy: copyList,
  lists,
  settings,
};
