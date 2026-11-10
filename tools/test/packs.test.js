// Unit tests for the pack files: the manifests agree with each other and with package.json, the
// notebook's item, recipe, texture and name fit together, and the HUD's JSON UI knows the same four
// corner keys the script sends.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const pkg = read('package.json');
const bp = read('packs/bp/manifest.json'), rp = read('packs/rp/manifest.json'), bpTest = read('test/manifest.json');

test('the manifests: distinct uuids, the behaviour pack depends on the resource pack, the script modules match package.json', () => {
	const uuids = [bp.header.uuid, bp.modules[0].uuid, bp.modules[1].uuid, rp.header.uuid, rp.modules[0].uuid, bpTest.header.uuid, bpTest.modules[0].uuid];
	assert.strictEqual(new Set(uuids).size, uuids.length);
	assert.ok(bp.dependencies.some((d) => d.uuid === rp.header.uuid), 'the behaviour pack brings the resource pack with it');
	for (const d of [...bp.dependencies, ...bpTest.dependencies]) if (d.module_name) assert.ok(pkg.devDependencies[d.module_name], `${d.module_name} is pinned in package.json`);
	assert.strictEqual(bp.modules.find((m) => m.type === 'script').entry, 'scripts/main.js');
	for (const m of [bp, rp, bpTest]) assert.deepStrictEqual(m.header.min_engine_version, [1, 26, 0]);
});

test('the notebook: item, recipe, texture and name fit together', () => {
	const item = read('packs/bp/items/notebook.json')['minecraft:item'];
	assert.strictEqual(item.description.identifier, 'pocket_list:notebook');
	const textures = read('packs/rp/textures/item_texture.json').texture_data;
	assert.ok(textures[item.components['minecraft:icon']], 'the icon is in item_texture.json');
	assert.ok(fs.existsSync(path.join(root, 'packs/rp', textures[item.components['minecraft:icon']].textures + '.png')), 'the sprite exists');
	const lang = fs.readFileSync(path.join(root, 'packs/rp/texts/en_US.lang'), 'utf8');
	assert.match(lang, new RegExp(`^${item.components['minecraft:display_name'].value}=Pocket List Notebook$`, 'm'));
	const recipe = read('packs/bp/recipes/notebook.json')['minecraft:recipe_shapeless'];
	assert.strictEqual(recipe.result.item, 'pocket_list:notebook');
	assert.strictEqual(recipe.description.identifier, 'pocket_list:notebook');
	assert.ok(recipe.unlock.length, 'the recipe says what unlocks it (a format with unlock needs one)');
	const main = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
	assert.match(main, /two paper and string/, 'the welcome note names the recipe as it is');
	assert.deepStrictEqual(recipe.ingredients, [{ item: 'minecraft:paper', count: 2 }, { item: 'minecraft:string' }]);
});

test('the HUD JSON UI keeps one label per corner, keyed as the script keys them, and hides the centre title for them', () => {
	const ui = read('packs/rp/ui/hud_screen.json');
	const hud = fs.readFileSync(path.join(root, 'src/hud.ts'), 'utf8');
	const keys = [...hud.matchAll(/"(\[pl:[a-z]{2}\])"/g)].map((m) => m[1]);
	assert.strictEqual(new Set(keys).size, 4);
	const text = JSON.stringify(ui);
	for (const k of keys) assert.ok(text.includes(`'${k}'`), `${k} is caught by a label`);
	assert.ok(ui.root_panel.modifications.some((m) => m.operation === 'insert_back'), 'the labels are added to the HUD');
	assert.ok(text.includes("(#text - '[pl:') = #text"), 'the centre title hides itself for list text');
	assert.strictEqual(ui.pl_hud.controls.length, 4);
});

test('the version is one number everywhere', () => {
	const main = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
	assert.match(main, new RegExp(`VERSION = "${pkg.version.replace(/\./g, '\\.')}"`));
	const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
	assert.match(changelog, new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}$`, 'm'), 'the changelog has this version');
});
