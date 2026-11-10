#!/usr/bin/env node
// Builds the two packs and the .mcaddon.
//
//   node tools/build.js [--java <Java repo folder>] [--ref <git ref>]
//
// The pack files in packs/ are copied as they are, with the version from package.json written into
// the manifests. The icon is the Java edition's, read from its repo (gabmaybelle/pocket-list) at the ref
// in java-source.json, so both editions share one. The scripts in src/ (and the self-test in test/)
// are TypeScript, compiled here. Output:
//   build/packs/bp, build/packs/rp   the behaviour and resource packs
//   build/packs/bp-test              the self-test pack (test worlds only, never shipped)
//   dist/PocketList-<version>.mcaddon
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { zip } = require('./zip.js');
const { javaRepo, ASSETS } = require('./java-source.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const out = path.join(root, 'build', 'packs');
const writeFile = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const writeJson = (p, obj) => writeFile(p, JSON.stringify(obj, null, '\t') + '\n');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = (why) => { console.error('build failed: ' + why); process.exit(1); };

// The manifests carry the version from package.json, and the script module versions the typings were
// installed at, so the pack never asks the game for an API the code wasn't checked against.
function manifest(file) {
	const m = readJson(file);
	const v = pkg.version.split('.').map(Number);
	m.header.version = v;
	for (const mod of m.modules) mod.version = v;
	for (const d of m.dependencies || []) {
		if (d.module_name) {
			d.version = pkg.devDependencies[d.module_name];
			if (!d.version) fail(`${file} asks for ${d.module_name}, which package.json doesn't pin`);
		}
		else if (d.uuid) d.version = v;
	}
	return m;
}

function build() {
	const java = javaRepo({ dir: opt('--java', null), ref: opt('--ref', undefined) });
	console.log(`Java edition: ${java.repo} at ${java.ref} (${java.commit.slice(0, 10)})`);

	fs.rmSync(out, { recursive: true, force: true });
	const bp = path.join(out, 'bp'), rp = path.join(out, 'rp'), bpTest = path.join(out, 'bp-test');
	fs.cpSync(path.join(root, 'packs', 'bp'), bp, { recursive: true });
	fs.cpSync(path.join(root, 'packs', 'rp'), rp, { recursive: true });
	writeJson(path.join(bp, 'manifest.json'), manifest(path.join(root, 'packs', 'bp', 'manifest.json')));
	writeJson(path.join(rp, 'manifest.json'), manifest(path.join(root, 'packs', 'rp', 'manifest.json')));
	writeJson(path.join(bpTest, 'manifest.json'), manifest(path.join(root, 'test', 'manifest.json')));
	const icon = java.read(`${ASSETS}icon.png`);
	writeFile(path.join(bp, 'pack_icon.png'), icon);
	writeFile(path.join(rp, 'pack_icon.png'), icon);

	// Every texture the item file names must be there.
	const textures = readJson(path.join(rp, 'textures', 'item_texture.json')).texture_data;
	for (const [key, t] of Object.entries(textures)) {
		if (!fs.existsSync(path.join(rp, t.textures + '.png'))) fail(`item_texture.json names ${t.textures}.png for ${key}, which isn't in the resource pack`);
	}
	for (const f of fs.readdirSync(path.join(bp, 'items'))) {
		const icon = readJson(path.join(bp, 'items', f))['minecraft:item'].components['minecraft:icon'];
		if (!textures[icon]) fail(`${f} uses the icon ${icon}, which item_texture.json doesn't define`);
	}
	// The script's version string is the package's.
	const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
	if (!main.includes(`VERSION = "${pkg.version}"`)) fail(`src/main.ts VERSION isn't ${pkg.version}`);

	// Scripts: TypeScript to JavaScript.
	const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
	if (!fs.existsSync(tsc)) fail('TypeScript is not installed: run npm install');
	fs.rmSync(path.join(root, 'build', 'js'), { recursive: true, force: true });
	cp.execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json')], { stdio: 'inherit' });
	fs.cpSync(path.join(root, 'build', 'js', 'src'), path.join(bp, 'scripts'), { recursive: true });
	fs.cpSync(path.join(root, 'build', 'js', 'test'), path.join(bpTest, 'scripts'), { recursive: true });

	// The .mcaddon: both packs, each in its own folder.
	const files = [];
	for (const [dir, prefix] of [[bp, 'PocketList_BP'], [rp, 'PocketList_RP']]) {
		(function walk(d) {
			for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) walk(p);
				else files.push({ name: prefix + '/' + path.relative(dir, p).split(path.sep).join('/'), data: fs.readFileSync(p) });
			}
		})(dir);
	}
	const addon = path.join(root, 'dist', `PocketList-${pkg.version}.mcaddon`);
	writeFile(addon, zip(files));
	console.log(`built: ${path.relative(root, addon)} (${files.length} files, ${Math.round(fs.statSync(addon).size / 1024)} KB)`);
}

build();
