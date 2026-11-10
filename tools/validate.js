#!/usr/bin/env node
// Checks every JSON file in the built packs against two schema sets:
//   - Mojang's own (bedrock-samples, metadata/json_schemas, at the tag in SAMPLES_TAG), where Mojang
//     publishes one for that kind of file (entities, blocks, spawn rules, format-3 manifests);
//   - the community schemas (Blockception/Minecraft-bedrock-json-schemas, at BLOCKCEPTION_COMMIT),
//     which also cover the resource-pack files Mojang has none for. A client entity the game
//     rejects (which shows as a white box) is caught here, headless.
// Both are fetched once into .cache/ with a sparse git clone.
//
//   node tools/validate.js            (after npm run build)
//
// A schema can lag the game. Findings listed in KNOWN are each settled against Mojang's own
// vanilla files and are reported but don't fail the check; anything else does.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SAMPLES_TAG = 'v1.26.60.5';
const BLOCKCEPTION_COMMIT = 'e04436c149ab2f9592e2b623aac9e19f0c6b2849';
const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.cache');
const packs = path.join(root, 'build', 'packs');

// Each entry: [file pattern, schema set, message pattern, why it's fine].
const KNOWN = [
	[/^rp\/ui\//, 'community', /must match pattern|property name must be valid|must match a schema in anyOf/,
		'the community UI schema allows plain element names only; a vanilla element is modified by its path ("hud_title_text/title_frame/title"), which the game reads (the spike showed the title hidden and the labels drawn)'],
	[/manifest\.json$/, 'community', /version|uuid|must match exactly one schema|must be equal to constant|must be >= 1|must be string|must match "then" schema|additional properties \(metadata\)/,
		'the community manifest schema wants string versions and a version of at least 1; the game loads format-2 manifests with array versions and 0.x versions (every Bedrock pack before 1.0 does)'],
	[/bp\/entities\//, 'community', /must NOT have additional properties \(minecraft:pushable\)/,
		'the community schema does not list minecraft:pushable inside a component group; 25 vanilla entities at the same format use it there'],
	[/bp\/spawn_rules\//, 'Mojang', /biome_filter must be array|must match exactly one schema in oneOf/,
		'Mojang publishes spawn-rule schemas from 1.21.50 only; at format 1.8.0 a single biome_filter object is what 42 of 60 vanilla spawn rules use'],
];

function sparseClone(url, dir, ref, paths) {
	if (fs.existsSync(path.join(dir, '.ok'))) return;
	fs.rmSync(dir, { recursive: true, force: true });
	console.log(`fetching ${url} (${ref}) into ${path.relative(root, dir)}`);
	const git = (...a) => cp.execFileSync('git', a, { stdio: ['ignore', 'ignore', 'inherit'] });
	git('clone', '--quiet', '--filter=blob:none', '--no-checkout', url, dir);
	if (paths) { git('-C', dir, 'sparse-checkout', 'init', '--cone'); git('-C', dir, 'sparse-checkout', 'set', ...paths); }
	git('-C', dir, 'checkout', '--quiet', ref);
	fs.writeFileSync(path.join(dir, '.ok'), ref);
}
sparseClone('https://github.com/Mojang/bedrock-samples', path.join(cache, 'bedrock-samples'), SAMPLES_TAG, ['metadata/json_schemas']);
sparseClone('https://github.com/Blockception/Minecraft-bedrock-json-schemas', path.join(cache, 'blockception'), BLOCKCEPTION_COMMIT, null);
const mojangRoot = path.join(cache, 'bedrock-samples', 'metadata', 'json_schemas');
const bcRoot = path.join(cache, 'blockception');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) files.push(p); } })(packs);

const opts = { strict: false, allErrors: true, validateSchema: false, allowUnionTypes: true, unicodeRegExp: false, logger: false };
const formats = (ajv) => { addFormats(ajv); for (const f of ['molang', 'color-hex', 'colox-hex']) ajv.addFormat(f, true); return ajv; };

// ---- Mojang: every schema loaded under its $id so the relative refs resolve.
const mojang = formats(new Ajv(opts));
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) { walk(p); continue; }
		if (!e.name.endsWith('.json')) continue;
		const s = read(p);
		const rel = '/' + path.relative(mojangRoot, p).split(path.sep).map(encodeURIComponent).join('/');
		s.$id = 'https://mojang.local' + (s.$id ? s.$id.replace(/ /g, '%20') : rel);
		try { mojang.addSchema(s); } catch { /* the same id in two versions */ }
	}
})(mojangRoot);
const vNum = (v) => String(v).split('.').map((n) => n.padStart(4, '0')).join('.');
function folderFor(kind, fv) {
	const vs = fs.readdirSync(path.join(mojangRoot, kind)).filter((v) => /^\d/.test(v)).sort((a, b) => (vNum(a) < vNum(b) ? -1 : 1));
	if (vs.includes(fv)) return [fv, 'same version'];
	const lower = vs.filter((v) => vNum(v) <= vNum(fv)).pop();
	return lower ? [lower, `nearest older to ${fv}`] : [vs[0], `oldest published; the file is ${fv}`];
}
const fmt = (errs) => errs.map((e) => `${e.instancePath || '/'} ${e.message}${e.params && e.params.additionalProperty ? ' (' + e.params.additionalProperty + ')' : ''}${e.params && e.params.allowedValues ? ' ' + JSON.stringify(e.params.allowedValues) : ''}`);
function mojangCheck(file, data) {
	let kind, body, doc;
	if (data['minecraft:entity']) [kind, body, doc] = ['server/entity', data['minecraft:entity'], 'ActorDocument.json'];
	else if (data['minecraft:block']) [kind, body, doc] = ['server/block', data['minecraft:block'], 'Blocks.json'];
	else if (data['minecraft:spawn_rules']) [kind, body, doc] = ['server/spawn', data['minecraft:spawn_rules'], 'Spawn Rules.json'];
	else if (data['minecraft:item']) [kind, body, doc] = ['server/item', data['minecraft:item'], 'ItemDocument.json'];
	else return { note: 'no Mojang schema for this kind of file (or this manifest format)' };
	let [ver, why] = folderFor(kind, data.format_version);
	let v = mojang.getSchema(`https://mojang.local/${kind}/${ver}/${encodeURIComponent(doc)}`);
	if (!v) {
		// Mojang's early folders for some kinds hold parts only (items: the whole document from 1.26.30).
		const has = fs.readdirSync(path.join(mojangRoot, kind)).filter((x) => /^\d/.test(x) && fs.existsSync(path.join(mojangRoot, kind, x, doc))).sort((a, b) => (vNum(a) < vNum(b) ? -1 : 1));
		if (has.length) {
			[ver, why] = [has[0], `the oldest with the whole document; the file is ${data.format_version}`];
			v = mojang.getSchema(`https://mojang.local/${kind}/${ver}/${encodeURIComponent(doc)}`);
		}
	}
	if (!v) return { note: `no schema: ${kind}/${ver}/${doc} did not load` };
	return v(body) ? { note: `OK (${kind}/${ver}, ${why})` } : { errors: fmt(v.errors), note: `${kind}/${ver} (${why})` };
}

// ---- Community: one bundled schema per kind of file.
const bc = formats(new Ajv(opts));
const bcFor = (r) => {
	if (/^bp(-test)?\/manifest\.json$/.test(r) || r === 'rp/manifest.json') return 'general/manifest.json';
	if (r.startsWith('bp/entities/')) return 'behavior/entities/entities.json';
	if (r.startsWith('bp/blocks/')) return 'behavior/blocks/blocks.json';
	if (r.startsWith('bp/recipes/')) return 'behavior/recipes/recipes.json';
	if (r.startsWith('bp/spawn_rules/')) return 'behavior/spawn_rules/spawn_rules.json';
	if (r.startsWith('bp/items/')) return 'behavior/items/items.json';
	if (r.startsWith('rp/entity/')) return 'resource/entity/entity.json';
	if (r.startsWith('rp/particles/')) return 'resource/particles/particles.json';
	if (r.startsWith('rp/animations/')) return 'resource/animations/actor_animation.json';
	if (r.startsWith('rp/animation_controllers/')) return 'resource/animation_controllers/animation_controller.json';
	if (r.startsWith('rp/render_controllers/')) return 'resource/render_controllers/render_controllers.json';
	if (r.startsWith('rp/models/entity/')) return 'resource/models/entity/model_entity.json';
	if (r === 'rp/blocks.json') return 'resource/blocks.json';
	if (r === 'rp/sounds.json') return 'resource/sounds.json';
	if (r === 'rp/sounds/sound_definitions.json') return 'resource/sounds/sound_definitions.json';
	if (r === 'rp/textures/terrain_texture.json') return 'resource/textures/terrain_texture.json';
	if (r === 'rp/textures/item_texture.json') return 'resource/textures/item_texture.json';
	if (r === 'rp/texts/languages.json') return 'language/languages.json';
	if (r.startsWith('rp/ui/')) return fs.existsSync(path.join(bcRoot, 'resource/ui/ui.json')) ? 'resource/ui/ui.json' : null;
	return null;
};
const compiled = new Map();
function bcCheck(rel, data) {
	const s = bcFor(rel);
	if (!s) return { note: 'no community schema for this kind of file' };
	if (!fs.existsSync(path.join(bcRoot, s))) return { errors: [`the schema ${s} is missing from the community set`], note: s };
	if (!compiled.has(s)) { const sch = read(path.join(bcRoot, s)); delete sch.$id; compiled.set(s, bc.compile(sch)); }
	const v = compiled.get(s);
	return v(data) ? { note: `OK (${s})` } : { errors: fmt(v.errors), note: s };
}

let bad = 0, known = 0, checked = 0;
for (const f of files.sort()) {
	const rel = path.relative(packs, f).split(path.sep).join('/');
	let data;
	try { data = read(f); } catch (e) { console.log(`${rel}\n  PARSE ERROR ${e.message}`); bad++; continue; }
	console.log(rel);
	for (const [set, res] of [['Mojang', mojangCheck(f, data)], ['community', bcCheck(rel, data)]]) {
		if (!res.errors) { console.log(`  ${set}: ${res.note}`); if (/^OK/.test(res.note)) checked++; continue; }
		const rule = KNOWN.find(([fp, s, mp]) => fp.test(rel) && s === set && res.errors.every((e) => mp.test(e)));
		if (rule) { known++; console.log(`  ${set}: known schema lag, not a fault (${rule[3]}):\n      ${res.errors.slice(0, 6).join('\n      ')}`); }
		else { bad++; console.log(`  ${set}: ERRORS against ${res.note}:\n      ${res.errors.slice(0, 20).join('\n      ')}`); }
	}
}
console.log(`\n${files.length} files: ${checked} schema passes, ${known} known schema lags, ${bad} with errors`);
process.exit(bad ? 1 : 0);
