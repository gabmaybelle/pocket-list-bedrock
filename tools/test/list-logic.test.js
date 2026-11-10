// Unit tests for the lists' rules (src/list-logic.ts, compiled here on the fly) against the Java
// edition's Lists, Entry, Counter, PocketHud and ListText: the same cases its game test uses, and
// its numbers read from its source at the tag in java-source.json.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), Module = require('module');
const ts = require('typescript');
const { javaRepo, JAVA } = require('../java-source.js');

const root = path.resolve(__dirname, '..', '..');
function loadTs(file) {
	const src = fs.readFileSync(path.join(root, file), 'utf8');
	const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
	const m = new Module(file);
	m._compile(js, path.join(root, file));
	return m.exports;
}
const L = loadTs('src/list-logic.ts');
const java = javaRepo();
const lists = java.text(`${JAVA}Lists.java`);
const listText = java.text(`${JAVA}ListText.java`);
const chestMemory = java.text(`${JAVA}ChestMemory.java`);

const ITEMS = ['minecraft:oak_planks', 'minecraft:birch_planks', 'minecraft:torch', 'minecraft:soul_torch', 'minecraft:glass_pane', 'minecraft:stick', 'minecraft:lantern', 'minecraft:tnt', 'minecraft:oak_log', 'minecraft:redstone_torch'];
const TAGS = { 'minecraft:planks': ['minecraft:oak_planks', 'minecraft:birch_planks'] };
const tagMatch = (id, tag) => (TAGS[tag] || []).includes(id);
const knownId = (id) => ITEMS.includes(id);
const knownTag = (tag) => tag in TAGS;
const index = L.nameIndex(ITEMS);
const resolve = (name, amount) => L.resolveName(name, amount, index, knownId, knownTag);

// ---------------------------------------------------------------- Java's numbers

test('the limits are the Java edition\'s', () => {
	assert.match(lists, new RegExp(`MAX_NEED = ${L.MAX_NEED.toLocaleString('en-US').replace(/,/g, '_')};`));
	assert.match(lists, new RegExp(`MAX_HUD_LINES = ${L.MAX_HUD_LINES};`));
	assert.match(lists, new RegExp(`public int hudLines = ${L.DEFAULT_HUD_LINES};`));
	assert.match(lists, new RegExp(`length\\(\\) > ${L.MAX_NAME} \\?`), 'a list name is cut at the same length');
	assert.match(chestMemory, new RegExp(`RADIUS = ${L.CHEST_RADIUS};`));
	assert.match(lists, /hudPosition = HudPosition\.TOP_LEFT;/, 'the HUD starts top left on Java too');
	assert.strictEqual(L.newData().corner, 'top_left');
	assert.strictEqual(L.newData().hud, true);
	assert.strictEqual(L.newData().countChests, true);
});

// ---------------------------------------------------------------- names

test('an item is named by its id\'s words', () => {
	assert.strictEqual(L.itemName('minecraft:oak_planks'), 'Oak Planks');
	assert.strictEqual(L.itemName('minecraft:tnt'), 'TNT');
	assert.strictEqual(L.itemName('pocket_list:notebook'), 'Notebook');
	assert.strictEqual(L.entryName(L.ofTag('minecraft:planks', 1)), 'Any planks');
	assert.strictEqual(L.entryName({ items: ['minecraft:oak_log', 'minecraft:birch_log'], need: 1 }), 'Oak Log (or similar)');
});

// ---------------------------------------------------------------- lists

test('adding tops up a line that is there, clamps at the limit, and keeps the order', () => {
	const d = L.newData();
	L.add(d, L.ofItem('minecraft:torch', 16));
	L.add(d, L.ofItem('minecraft:oak_planks', 64));
	L.add(d, L.ofItem('minecraft:torch', 8));
	assert.deepStrictEqual(L.activeList(d).entries.map((e) => [e.items[0], e.need]), [['minecraft:torch', 24], ['minecraft:oak_planks', 64]]);
	L.add(d, L.ofItem('minecraft:torch', L.MAX_NEED));
	assert.strictEqual(L.activeList(d).entries[0].need, L.MAX_NEED);
	assert.strictEqual(L.topUp(L.activeList(d).entries, L.ofItem('minecraft:stick', 0), 0), false, 'nothing is added for 0');
	assert.strictEqual(L.activeList(d).name, 'List 1');
	assert.match(lists, /"pocket_list\.default_name"/, 'Java names the first list the same way');
});

test('a new list merges repeats, takes a trimmed name of at most 40, and is switched to', () => {
	const d = L.newData();
	L.activeList(d);
	const list = L.addList(d, '  ' + 'x'.repeat(50), [L.ofItem('minecraft:torch', 4), L.ofItem('minecraft:torch', 6), L.ofTag('minecraft:planks', 16)]);
	assert.strictEqual(list.name.length, 40);
	assert.deepStrictEqual(list.entries.map(L.keyOf), ['minecraft:torch', '#minecraft:planks']);
	assert.strictEqual(list.entries[0].need, 10);
	assert.strictEqual(d.active, 1);
	assert.strictEqual(L.addList(d, '', []).name, 'List 3');
	L.deleteList(d, 2);
	assert.strictEqual(d.active, 1);
	L.deleteList(d, 0);
	assert.strictEqual(d.active, 0);
	assert.strictEqual(L.activeList(d), list);
});

test('counting matches items and tags, and Clear Done takes the gathered lines off', () => {
	const list = { name: 'Porch', entries: [L.ofItem('minecraft:oak_planks', 64), L.ofTag('minecraft:planks', 16), L.ofItem('minecraft:torch', 16)] };
	const totals = new Map([['minecraft:oak_planks', 24], ['minecraft:birch_planks', 10]]);
	const counted = L.count(list.entries, totals, tagMatch);
	assert.deepStrictEqual(counted.map((c) => [c.have, c.done]), [[24, false], [34, true], [0, false]]);
	assert.strictEqual(L.clearDone(list, counted), 1);
	assert.deepStrictEqual(list.entries.map(L.keyOf), ['minecraft:oak_planks', 'minecraft:torch']);
});

// ---------------------------------------------------------------- the HUD

test('the HUD reads as Java\'s: title with the tally, lines still to gather first, done lines green, the rest summed up', () => {
	const list = { name: 'Porch', entries: [L.ofItem('minecraft:oak_planks', 64), L.ofTag('minecraft:planks', 16), L.ofItem('minecraft:torch', 16)] };
	const counted = L.count(list.entries, new Map([['minecraft:oak_planks', 70], ['minecraft:birch_planks', 10]]), tagMatch);
	assert.strictEqual(L.hudText(list, counted, 8), '§ePorch  2/3\n§f0/16 Torch\n§a64/64 Oak Planks\n§a16/16 Any planks', 'have is capped at need');
	assert.strictEqual(L.hudText(list, counted, 1), '§ePorch  2/3\n§f0/16 Torch\n§7...and 2 more');
	const all = L.count(list.entries, new Map([['minecraft:oak_planks', 64], ['minecraft:torch', 16]]), tagMatch);
	assert.strictEqual(L.hudText(list, all, 8), '§aPorch: all gathered!\n§a64/64 Oak Planks\n§a16/16 Any planks\n§a16/16 Torch');
	assert.strictEqual(L.hudText({ name: 'Empty', entries: [] }, [], 8), '', 'an empty list draws nothing');
	assert.strictEqual(L.finishedMessage(list), '§aAll gathered! You have everything on Porch.');
});

// ---------------------------------------------------------------- lists as text

test('typed lines read as Java\'s ListText does', () => {
	const r = L.parseLines('64 oak planks\nTorches x16\nminecraft:glass_pane 8\n- [x] 3 sticks\n• lantern\n10 x oak logs\n\n42\n+-----+\nsticks: 5\nnonsense thing');
	assert.deepStrictEqual(r.lines, [
		{ name: 'oak planks', amount: 64 }, { name: 'Torches', amount: 16 }, { name: 'minecraft:glass_pane', amount: 8 }, { name: 'sticks', amount: 3 },
		{ name: 'lantern', amount: 1 }, { name: 'oak logs', amount: 10 }, { name: 'sticks', amount: 5 }, { name: 'nonsense thing', amount: 1 },
	]);
	assert.strictEqual(r.title, null);
	assert.match(listText, /AMOUNT_FIRST = Pattern\.compile\("\^\(\\\\d\+\)\\\\s\*\[x×\]\?\\\\s\+\(\.\+\)\$"/, 'the amount-first pattern is Java\'s');
});

test('semicolons separate lines too (a form\'s text box is one line), and Litematica tables and csv rows read', () => {
	assert.deepStrictEqual(L.parseLines('64 oak planks; 16 torches;;').lines, [{ name: 'oak planks', amount: 64 }, { name: 'torches', amount: 16 }]);
	const table = L.parseLines('+--------+\n| Cottage roof |\n+--------+-------+---------+\n| Item | Total | Missing |\n| Oak Planks | 320 | 300 |\n| Glass Pane | 48 | 10 |');
	assert.strictEqual(table.title, 'Cottage roof');
	assert.deepStrictEqual(table.lines, [{ name: 'Oak Planks', amount: 320 }, { name: 'Glass Pane', amount: 48 }]);
	assert.deepStrictEqual(L.parseLines('"Item","Total","Missing"\n"Oak Planks","320","300"\noak planks, 64\n64, torches').lines, [{ name: 'Oak Planks', amount: 320 }, { name: 'oak planks', amount: 64 }, { name: 'torches', amount: 64 }]);
	assert.strictEqual(L.parseLines('oak planks 999999999999').lines[0].amount, L.MAX_NEED);
});

test('names match items as written, plural or not, by id or as a tag, and nothing is guessed', () => {
	assert.deepStrictEqual(resolve('Oak Planks', 2), L.ofItem('minecraft:oak_planks', 2));
	assert.deepStrictEqual(resolve('oak_planks', 2), L.ofItem('minecraft:oak_planks', 2));
	assert.deepStrictEqual(resolve('torches', 1), L.ofItem('minecraft:torch', 1));
	assert.deepStrictEqual(resolve('glass panes', 1), L.ofItem('minecraft:glass_pane', 1));
	assert.deepStrictEqual(resolve('minecraft:lantern', 1), L.ofItem('minecraft:lantern', 1));
	assert.deepStrictEqual(resolve('#planks', 16), L.ofTag('minecraft:planks', 16));
	assert.deepStrictEqual(resolve('#minecraft:planks', 16), L.ofTag('minecraft:planks', 16));
	assert.strictEqual(resolve('#minecraft:plonks', 1), null);
	assert.strictEqual(resolve('minecraft:nonsense', 1), null);
	assert.strictEqual(resolve('nonsense thing', 1), null);
	assert.strictEqual(resolve('TNT', 1).items[0], 'minecraft:tnt');
});

test('a pasted list makes lines and names the unknown ones; a copied list pastes back as the same list', () => {
	const read = L.readListText('64 oak planks\n16 torches\nmystery block 3', resolve);
	assert.deepStrictEqual(read.entries, [L.ofItem('minecraft:oak_planks', 64), L.ofItem('minecraft:torch', 16)]);
	assert.deepStrictEqual(read.unknown, ['mystery block']);
	const list = { name: 'L', entries: [L.ofItem('minecraft:oak_planks', 64), L.ofTag('minecraft:planks', 16), L.ofItem('minecraft:torch', 16)] };
	assert.strictEqual(L.writeListText(list), '64 Oak Planks\n16 #minecraft:planks\n16 Torch');
	const text = L.writeListText(list, '; ');
	assert.strictEqual(text, '64 Oak Planks; 16 #minecraft:planks; 16 Torch');
	assert.deepStrictEqual(L.readListText(text, resolve).entries, list.entries);
});

test('search puts the exact name first, then names starting with the words, then the rest, within the limit', () => {
	assert.deepStrictEqual(L.search('torch', ITEMS, 10), ['minecraft:torch', 'minecraft:soul_torch', 'minecraft:redstone_torch']);
	assert.deepStrictEqual(L.search('oak', ITEMS, 1), ['minecraft:oak_log']);
	assert.deepStrictEqual(L.search('planks oak', ITEMS, 5), ['minecraft:oak_planks']);
	assert.deepStrictEqual(L.search('  ', ITEMS, 5), []);
});

// ---------------------------------------------------------------- loading

test('saved data of any shape loads with every field sound', () => {
	assert.deepStrictEqual(L.cleanData(undefined), { ...L.newData(), lists: [{ name: 'List 1', entries: [] }] });
	assert.deepStrictEqual(L.cleanData('garbage').lists.length, 1);
	const d = L.cleanData({ lists: [{ name: '', entries: [{ items: ['minecraft:torch'], need: 1e9 }, { items: [], need: 2 }, null, { tag: 'minecraft:planks', need: -5 }] }, 'x'], active: 7, hud: 'yes', corner: 'middle', hudLines: 99, countChests: false, welcomed: true });
	assert.deepStrictEqual(d.lists, [{ name: 'List 1', entries: [{ items: ['minecraft:torch'], need: L.MAX_NEED }, { tag: 'minecraft:planks', items: [], need: 1 }] }]);
	assert.strictEqual(d.active, 0, 'the active index wraps');
	assert.strictEqual(d.hud, true);
	assert.strictEqual(d.corner, 'top_left');
	assert.strictEqual(d.hudLines, L.MAX_HUD_LINES);
	assert.strictEqual(d.countChests, false);
	assert.strictEqual(d.welcomed, true);
	assert.strictEqual(L.cleanData({ corner: 'bottom_right', hudLines: 0 }).corner, 'bottom_right');
	assert.strictEqual(L.cleanData({ hudLines: 0 }).hudLines, 1);
});

// ---------------------------------------------------------------- remembered containers

test('places are remembered once each, the oldest forgotten past the cap, and read within 32 blocks', () => {
	const places = [];
	assert.strictEqual(L.remember(places, { d: 'minecraft:overworld', x: 1, y: 2, z: 3 }), true);
	assert.strictEqual(L.remember(places, { d: 'minecraft:overworld', x: 1, y: 2, z: 3 }), false);
	for (let i = 0; i < L.MAX_CHESTS + 5; i++) L.remember(places, { d: 'minecraft:overworld', x: 100 + i, y: 0, z: 0 });
	assert.strictEqual(places.length, L.MAX_CHESTS);
	assert.strictEqual(places[0].x, 105, 'the oldest went first');
	const near = L.nearbyPlaces([{ d: 'minecraft:overworld', x: 10, y: 0, z: 0 }, { d: 'minecraft:overworld', x: 40, y: 0, z: 0 }, { d: 'minecraft:nether', x: 10, y: 0, z: 0 }], 'minecraft:overworld', { x: 0.5, y: 0, z: 0.5 });
	assert.deepStrictEqual(near.map((p) => p.x), [10]);
	assert.deepStrictEqual(L.cleanPlaces([{ d: 'minecraft:overworld', x: 1, y: 2, z: 3 }, { d: 'minecraft:overworld', x: 1.5, y: 2, z: 3 }, { x: 1 }, 'x']), [{ d: 'minecraft:overworld', x: 1, y: 2, z: 3 }]);
});

test('of a double chest remembered as two halves, the lower half is read for both', () => {
	const p = (x, z, kind = 'chest') => ({ d: 'minecraft:overworld', x, y: 0, z, kind });
	const pairable = (q) => q.kind === 'chest';
	const sameKind = (a, b) => a.kind === b.kind;
	assert.deepStrictEqual(L.dedupeDoubleChests([p(0, 0), p(1, 0), p(5, 0), p(5, 1), p(8, 0, 'barrel'), p(9, 0, 'barrel')], pairable, sameKind).map((q) => [q.x, q.z]), [[0, 0], [5, 0], [8, 0], [9, 0]]);
	assert.deepStrictEqual(L.dedupeDoubleChests([p(0, 0), p(1, 0, 'trapped')], pairable, sameKind).length, 2, 'a trapped chest beside a chest is its own');
});
