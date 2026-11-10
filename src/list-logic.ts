// The lists and their rules, with no game objects, so the unit tests run them as they are. The Java
// edition's Lists, Entry, Counter, PocketHud and ListText are the spec; every rule here mirrors one
// of theirs. The game-side modules (store, count, hud, forms) apply them.

/** No line asks for more than this (Lists.MAX_NEED). */
export const MAX_NEED = 99_999;
/** The most lines the HUD will show (Lists.MAX_HUD_LINES). */
export const MAX_HUD_LINES = 20;
/** Lines on the HUD by default (Lists.Data.hudLines). */
export const DEFAULT_HUD_LINES = 8;
/** A list's name is at most this long (Lists.addList). */
export const MAX_NAME = 40;
/** At most this many remembered containers per player; the oldest are forgotten first. */
export const MAX_CHESTS = 200;
/** Containers further away than this (in blocks) don't count (ChestMemory.RADIUS). */
export const CHEST_RADIUS = 32;

export type Corner = "top_left" | "top_right" | "bottom_left" | "bottom_right";
export const CORNERS: Corner[] = ["top_left", "top_right", "bottom_left", "bottom_right"];
export const CORNER_NAMES: Record<Corner, string> = { top_left: "Top Left", top_right: "Top Right", bottom_left: "Bottom Left", bottom_right: "Bottom Right" };

/** One line on a list: how many of something you want. The something is an item, or an item tag ("any planks"). */
export interface Entry {
  /** An item tag such as "minecraft:planks"; when set it wins over items (Entry.tag). */
  tag?: string;
  /** Item ids; any of them counts. Usually just one (Entry.items). */
  items: string[];
  need: number;
}

export interface ListData {
  name: string;
  entries: Entry[];
}

/** A player's lists and settings (Lists.Data). Kept on the player, so they're theirs, not the world's. */
export interface Data {
  lists: ListData[];
  active: number;
  /** Show the active list in a corner of the screen. */
  hud: boolean;
  corner: Corner;
  /** Count what's in containers you've opened nearby. */
  countChests: boolean;
  /** At most this many lines on the HUD; the rest are summed up as "and 3 more". */
  hudLines: number;
  /** The one-time welcome note has been shown. */
  welcomed: boolean;
}

export function newData(): Data {
  return { lists: [], active: 0, hud: true, corner: "top_left", countChests: true, hudLines: DEFAULT_HUD_LINES, welcomed: false };
}

/** A new list's name ("List 1"). */
export const listName = (number: number) => `List ${number}`;

export function newList(number: number): ListData {
  return { name: listName(number), entries: [] };
}

/** The active list; a first list is made when there is none (Lists.active). */
export function activeList(data: Data): ListData {
  if (data.lists.length === 0) data.lists.push(newList(1));
  data.active = ((data.active % data.lists.length) + data.lists.length) % data.lists.length;
  return data.lists[data.active];
}

export const ofItem = (id: string, need: number): Entry => ({ items: [id], need });
export const ofTag = (tag: string, need: number): Entry => ({ tag, items: [], need });

/** Two entries with the same key are the same line, so adding one tops up the other (Entry.key). */
export const keyOf = (e: Entry) => (e.tag ? "#" + e.tag : e.items.join("|"));

export const clampNeed = (n: number) => Math.max(1, Math.min(MAX_NEED, Math.trunc(n)));

/**
 * Tops up the line with this entry's key, or puts the entry in at index when there's no such line
 * (Lists.topUp). True if a line was added.
 */
export function topUp(entries: Entry[], entry: Entry, index: number): boolean {
  if (entry.need <= 0) return false;
  const key = keyOf(entry);
  const existing = entries.find((e) => keyOf(e) === key);
  if (existing) {
    existing.need = Math.min(MAX_NEED, existing.need + entry.need);
    return false;
  }
  entry.need = Math.min(MAX_NEED, entry.need);
  entries.splice(Math.min(index, entries.length), 0, entry);
  return true;
}

/** Adds to the active list, topping up a line that's already there (Lists.add). */
export function add(data: Data, entry: Entry) {
  const entries = activeList(data).entries;
  topUp(entries, entry, entries.length);
}

/** A new list with these lines (the same item twice becomes one line), switched to; named name, or "List N" (Lists.addList). */
export function addList(data: Data, name: string | null | undefined, entries: Entry[]): ListData {
  const list = newList(data.lists.length + 1);
  const trimmed = (name ?? "").trim();
  if (trimmed) list.name = trimmed.length > MAX_NAME ? trimmed.slice(0, MAX_NAME) : trimmed;
  for (const e of entries) topUp(list.entries, { ...e, items: [...e.items] }, list.entries.length);
  data.lists.push(list);
  data.active = data.lists.length - 1;
  return list;
}

export function renameList(list: ListData, name: string) {
  const trimmed = name.trim();
  if (trimmed) list.name = trimmed.length > MAX_NAME ? trimmed.slice(0, MAX_NAME) : trimmed;
}

/** Deletes the list at index; the active list stays a real one. */
export function deleteList(data: Data, index: number) {
  if (index < 0 || index >= data.lists.length) return;
  data.lists.splice(index, 1);
  if (data.active >= index && data.active > 0) data.active--;
  activeList(data);
}

/** What you have towards each line, from totals by item id (Counter.update). */
export interface Counted {
  entry: Entry;
  have: number;
  done: boolean;
}

export function count(entries: Entry[], totals: Map<string, number>, tagMatch: (itemId: string, tag: string) => boolean): Counted[] {
  return entries.map((entry) => {
    let have = 0;
    if (entry.tag) {
      for (const [id, n] of totals) if (tagMatch(id, entry.tag)) have += n;
    } else {
      for (const id of entry.items) have += totals.get(id) ?? 0;
    }
    return { entry, have, done: have >= entry.need };
  });
}

/** Takes everything you've gathered off the list (Clear Done). Returns how many lines went. */
export function clearDone(list: ListData, counted: Counted[]): number {
  const done = new Set(counted.filter((c) => c.done).map((c) => c.entry));
  const before = list.entries.length;
  list.entries = list.entries.filter((e) => !done.has(e));
  return before - list.entries.length;
}

// ---------------------------------------------------------------- names

/** Items whose name isn't just their id's words. */
const NAME_OVERRIDES: Record<string, string> = {
  "minecraft:tnt": "TNT",
};

/** "minecraft:oak_planks" is "Oak Planks": the id's words, each capitalized (the Java edition shows the game's own names). */
export function itemName(id: string): string {
  const over = NAME_OVERRIDES[id];
  if (over) return over;
  const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return path
    .split(/[_./]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** What a line is called: the item, "Any planks" for a tag, "Oak Planks (or similar)" for a choice (Entry.name). */
export function entryName(entry: Entry): string {
  if (entry.tag) {
    const path = entry.tag.includes(":") ? entry.tag.slice(entry.tag.indexOf(":") + 1) : entry.tag;
    return `Any ${path.replace(/[/_]/g, " ").toLowerCase()}`;
  }
  if (entry.items.length === 0) return "?";
  const first = itemName(entry.items[0]);
  return entry.items.length > 1 ? `${first} (or similar)` : first;
}

// ---------------------------------------------------------------- the HUD

/** The HUD as lines of text (PocketHud): the title, still-to-gather lines first, then the done ones, then "and N more". */
export function hudText(list: ListData, counted: Counted[], maxLines: number): string {
  if (counted.length === 0) return "";
  const lines = Math.max(1, Math.min(MAX_HUD_LINES, maxLines));
  const sorted = [...counted].sort((a, b) => Number(a.done) - Number(b.done));
  const gathered = sorted.filter((c) => c.done).length;
  const allDone = gathered === sorted.length;
  const shown = Math.min(sorted.length, lines);
  const hidden = sorted.length - shown;
  const out = [allDone ? `§a${list.name}: all gathered!` : `§e${list.name}  ${gathered}/${sorted.length}`];
  for (const c of sorted.slice(0, shown)) out.push(`${c.done ? "§a" : "§f"}${Math.min(c.have, c.entry.need)}/${c.entry.need} ${entryName(c.entry)}`);
  if (hidden > 0) out.push(`§7...and ${hidden} more`);
  return out.join("\n");
}

/** The note when the last line is ticked off (pocket_list.finished.text). */
export const finishedMessage = (list: ListData) => `§aAll gathered! You have everything on ${list.name}.`;

// ---------------------------------------------------------------- lists as text (ListText)

/** One line read from the text: the name as written, and how many. */
export interface TextLine {
  name: string;
  amount: number;
}

/** "64 oak planks", "64x oak planks", "64 x oak planks". */
const AMOUNT_FIRST = /^(\d+)\s*[x×]?\s+(.+)$/i;
/** "oak planks 64", "oak planks x64", "oak planks: 64", "oak planks = 64". */
const AMOUNT_LAST = /^(.+?)\s*[x×*:=]?\s*(\d+)$/i;
/** A bullet or checkbox in front of a line from a notes app: "- ", "* ", "• ", "[ ] ", "- [x] ". */
const BULLET = /^(?:[-*•]\s*)?(?:\[[ xX]?\]\s*)?/;
/** A Litematica table border: "+-------+-----+". */
const BORDER = /^[+\-=|\s]*$/;
const ID = /^#?([a-z0-9_.\-]+:)?[a-z0-9_./\-]+$/;

const isNumber = (s: string) => /^\d+$/.test(s.trim());

/** The cells of a comma-separated line, with quotes taken off. One cell if there's no comma. */
function csv(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

/** Adds the line if the amount is a number above 0 (headers such as "Item | Total" aren't). */
function addIfCounted(name: string, amount: string, out: TextLine[]): boolean {
  if (!isNumber(amount) || !name.trim()) return false;
  const n = Number(amount.trim());
  const count = Number.isSafeInteger(n) ? n : MAX_NEED;
  if (count > 0) out.push({ name: name.trim(), amount: Math.min(MAX_NEED, count) });
  return true;
}

/**
 * Splits the text into lines with an amount (ListText.lines). A line ends at a line break or a
 * semicolon (a form's text box is one line, so "64 oak planks; 16 torches" works there). Returns the
 * title of a Litematica table (its schematic's name), or null.
 */
export function parseLines(text: string): { title: string | null; lines: TextLine[] } {
  const out: TextLine[] = [];
  let title: string | null = null;
  for (const raw of text.split(/\r\n|\r|\n|;/)) {
    let line = raw.trim();
    if (!line || BORDER.test(line)) continue;
    if (line.includes("|")) {
      // A Litematica table row: | Item | Total | Missing | Available | ...
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length === 1 && title === null && out.length === 0) title = cells[0];
      else if (cells.length >= 2) addIfCounted(cells[0], cells[1], out);
      continue;
    }
    const cells = csv(line);
    if (cells.length >= 2) {
      // Litematica's .csv ("Item","Total",...), or "oak planks, 64".
      if (!addIfCounted(cells[0], cells[1], out) && isNumber(cells[0])) addIfCounted(cells[1], cells[0], out);
      continue;
    }
    line = line.replace(BULLET, "").trim();
    if (!line) continue;
    const first = AMOUNT_FIRST.exec(line);
    const last = AMOUNT_LAST.exec(line);
    if (first) addIfCounted(first[2], first[1], out);
    else if (last && !isNumber(line)) addIfCounted(last[1], last[2], out);
    else if (!isNumber(line)) out.push({ name: line, amount: 1 });
  }
  return { title, lines: out };
}

/** Every item by its name and by its id's words, lower case (ListText.names). */
export function nameIndex(itemIds: Iterable<string>): Map<string, string> {
  const byName = new Map<string, string>();
  for (const id of itemIds) {
    const name = itemName(id).toLowerCase();
    if (!byName.has(name)) byName.set(name, id);
  }
  for (const id of itemIds) {
    const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    const words = path.replace(/_/g, " ");
    if (!byName.has(words)) byName.set(words, id);
  }
  return byName;
}

/**
 * A name as written to a line (ListText.entry): an id with its namespace, "#tag", or a name in the
 * index (plurals tried without their "es" or "s"). Nothing is guessed: null when it matches no item.
 */
export function resolveName(name: string, amount: number, byName: Map<string, string>, knownId: (id: string) => boolean, knownTag: (tag: string) => boolean): Entry | null {
  const lower = name.trim().toLowerCase();
  if ((ID.test(lower) && lower.includes(":")) || lower.startsWith("#")) {
    if (lower.startsWith("#")) {
      const tag = lower.slice(1).includes(":") ? lower.slice(1) : "minecraft:" + lower.slice(1);
      return knownTag(tag) ? ofTag(tag, amount) : null;
    }
    return knownId(lower) ? ofItem(lower, amount) : null;
  }
  const words = lower.replace(/_/g, " ").replace(/\s+/g, " ");
  let id = byName.get(words);
  if (!id && words.endsWith("es")) id = byName.get(words.slice(0, -2));
  if (!id && words.endsWith("s")) id = byName.get(words.slice(0, -1));
  return id ? ofItem(id, amount) : null;
}

export interface ReadResult {
  title: string | null;
  entries: Entry[];
  unknown: string[];
}

/** Reads text into list lines, matching each name to an item (ListText.read). Names that match no item are handed back. */
export function readListText(text: string, resolve: (name: string, amount: number) => Entry | null): ReadResult {
  const { title, lines } = parseLines(text);
  const entries: Entry[] = [];
  const unknown: string[] = [];
  for (const line of lines) {
    const entry = resolve(line.name, line.amount);
    if (entry) entries.push(entry);
    else unknown.push(line.name);
  }
  return { title, entries, unknown };
}

/** The list as text to copy (ListText.write): "64 Oak Planks" per line, "16 #minecraft:planks" for a tag, joined with the separator. */
export function writeListText(list: ListData, separator = "\n"): string {
  return list.entries.map((e) => `${e.need} ${e.tag ? "#" + e.tag : entryName(e)}`).join(separator);
}

// ---------------------------------------------------------------- search

/** Item ids whose name has every word of the query, names starting with it first, then shorter names (PocketListScreen's search). */
export function search(query: string, itemIds: Iterable<string>, limit: number): string[] {
  const q = query.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!q) return [];
  const words = q.split(" ");
  const hits: { id: string; name: string; rank: number }[] = [];
  for (const id of itemIds) {
    const name = itemName(id).toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : 2;
    hits.push({ id, name, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
  return hits.slice(0, limit).map((h) => h.id);
}

// ---------------------------------------------------------------- loading

/** Saved data (JSON from an older or newer version, or anything else) as a Data with every field sound (Lists.load). */
export function cleanData(raw: unknown): Data {
  const d = newData();
  if (!raw || typeof raw !== "object") {
    activeList(d);
    return d;
  }
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.lists)) {
    for (const l of r.lists) {
      if (!l || typeof l !== "object") continue;
      const lr = l as Record<string, unknown>;
      const list: ListData = { name: typeof lr.name === "string" && lr.name.trim() ? lr.name.slice(0, MAX_NAME) : listName(d.lists.length + 1), entries: [] };
      if (Array.isArray(lr.entries)) {
        for (const e of lr.entries) {
          if (!e || typeof e !== "object") continue;
          const er = e as Record<string, unknown>;
          const items = Array.isArray(er.items) ? er.items.filter((i): i is string => typeof i === "string" && i.length > 0) : [];
          const tag = typeof er.tag === "string" && er.tag ? er.tag : undefined;
          if (!tag && items.length === 0) continue;
          const need = typeof er.need === "number" && Number.isFinite(er.need) ? clampNeed(er.need) : 1;
          list.entries.push(tag ? { tag, items: [], need } : { items, need });
        }
      }
      d.lists.push(list);
    }
  }
  if (typeof r.active === "number" && Number.isFinite(r.active)) d.active = Math.trunc(r.active);
  if (typeof r.hud === "boolean") d.hud = r.hud;
  if (typeof r.corner === "string" && (CORNERS as string[]).includes(r.corner)) d.corner = r.corner as Corner;
  if (typeof r.countChests === "boolean") d.countChests = r.countChests;
  if (typeof r.hudLines === "number" && Number.isFinite(r.hudLines)) d.hudLines = Math.max(1, Math.min(MAX_HUD_LINES, Math.trunc(r.hudLines)));
  if (typeof r.welcomed === "boolean") d.welcomed = r.welcomed;
  activeList(d);
  return d;
}

// ---------------------------------------------------------------- remembered containers

/** Where a container you've opened is (ChestMemory.Place). */
export interface Place {
  d: string;
  x: number;
  y: number;
  z: number;
}

export const placeKey = (p: Place) => `${p.d} ${p.x} ${p.y} ${p.z}`;

/** Remembers a place, newest last, dropping the oldest past the cap. True if it was new. */
export function remember(places: Place[], place: Place): boolean {
  const key = placeKey(place);
  if (places.some((p) => placeKey(p) === key)) return false;
  places.push(place);
  while (places.length > MAX_CHESTS) places.shift();
  return true;
}

/** Saved places as Place[] with every field sound. */
export function cleanPlaces(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const out: Place[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    if (typeof r.d !== "string" || typeof r.x !== "number" || typeof r.y !== "number" || typeof r.z !== "number") continue;
    if (![r.x, r.y, r.z].every(Number.isInteger)) continue;
    remember(out, { d: r.d, x: r.x, y: r.y, z: r.z });
  }
  return out;
}

/** The places in this dimension within the radius of a point, as the crow flies (ChestMemory.nearby). */
export function nearbyPlaces(places: Place[], dimension: string, at: { x: number; y: number; z: number }): Place[] {
  const r2 = CHEST_RADIUS * CHEST_RADIUS;
  return places.filter((p) => p.d === dimension && (p.x + 0.5 - at.x) ** 2 + (p.y + 0.5 - at.y) ** 2 + (p.z + 0.5 - at.z) ** 2 <= r2);
}

/**
 * Of a set of chest places, those to read: a double chest shows its whole inventory from either half,
 * so when both halves are remembered only the one with the lower x or z is read (its neighbour at
 * x-1 or z-1 counts for both). Only chests of the same kind pair, and only side by side at one height.
 */
export function dedupeDoubleChests(places: Place[], isPairable: (p: Place) => boolean, sameKind: (a: Place, b: Place) => boolean): Place[] {
  const byKey = new Map(places.map((p) => [placeKey(p), p]));
  return places.filter((p) => {
    if (!isPairable(p)) return true;
    for (const n of [{ ...p, x: p.x - 1 }, { ...p, z: p.z - 1 }]) {
      const other = byKey.get(placeKey(n));
      if (other && isPairable(other) && sameKind(p, other)) return false;
    }
    return true;
  });
}
