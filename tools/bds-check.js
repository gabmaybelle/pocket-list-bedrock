#!/usr/bin/env node
// Headless check on Bedrock Dedicated Server: puts the built packs and the self-test pack on a fresh
// flat world, starts the server with no window, keeps the middle of the world ticking, runs the
// self-test (/scriptevent pocket_list:test), stops the server and reads its log and content log.
// It proves the manifests, the JSON and the scripts load and that the the list, the counting and the chests work;
// it can't see the models, the animations or hear the sounds (a game client is needed for those).
//
//   node tools/bds-check.js <server folder> [--zip <bedrock-server-x.y.z.zip>] [--seconds 1200]
//        [--port 19260] [--event "pocket_list:test spawn_"] [--keep-world] [--packs <folder>]
//
// Run `npm run build` first. Downloading and running the server means you accept Minecraft's EULA.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) { console.error('usage: node tools/bds-check.js <server folder> [--zip <server zip>] [--seconds N] [--port N] [--event "..."]'); process.exit(2); }
const folder = path.resolve(args[0]);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const zip = opt('--zip', null);
const seconds = parseInt(opt('--seconds', '1200'), 10);
const port = parseInt(opt('--port', '19260'), 10);
const event = opt('--event', 'pocket_list:test');
const keepWorld = args.includes('--keep-world');
// --packs: another folder of bp, rp and bp-test (a test pack of your own in place of the self-test).
const packs = path.resolve(opt('--packs', path.join(root, 'build', 'packs')));
if (!fs.existsSync(path.join(packs, 'bp', 'manifest.json'))) { console.error('no build: run npm run build first'); process.exit(2); }

const exe = path.join(folder, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server');
if (!fs.existsSync(exe)) {
	if (!zip) { console.error('no server in the folder and no --zip given'); process.exit(2); }
	fs.mkdirSync(folder, { recursive: true });
	console.log('extracting', zip);
	if (process.platform === 'win32') cp.execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${folder}' -Force`], { stdio: 'inherit' });
	else cp.execFileSync('unzip', ['-q', '-o', zip, '-d', folder], { stdio: 'inherit' });
}

const copyDir = (src, dst) => { fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); };
copyDir(path.join(packs, 'bp'), path.join(folder, 'development_behavior_packs', 'PocketListBP'));
copyDir(path.join(packs, 'bp-test'), path.join(folder, 'development_behavior_packs', 'PocketListTestBP'));
copyDir(path.join(packs, 'rp'), path.join(folder, 'development_resource_packs', 'PocketListRP'));
const header = (p) => JSON.parse(fs.readFileSync(path.join(packs, p, 'manifest.json'), 'utf8')).header;

const level = 'plcheck';
const world = path.join(folder, 'worlds', level);
// --keep-world starts the server on the last run's world (the restart check: restart_setup, then restart_check).
if (!keepWorld) fs.rmSync(world, { recursive: true, force: true });
fs.mkdirSync(world, { recursive: true });
const ref = (h) => ({ pack_id: h.uuid, version: h.version });
fs.writeFileSync(path.join(world, 'world_behavior_packs.json'), JSON.stringify([ref(header('bp')), ref(header('bp-test'))], null, 2));
fs.writeFileSync(path.join(world, 'world_resource_packs.json'), JSON.stringify([ref(header('rp'))], null, 2));

const propsPath = path.join(folder, 'server.properties');
let props = fs.readFileSync(propsPath, 'utf8');
const set = (k, v) => { const re = new RegExp(`^${k}=.*$`, 'm'); props = re.test(props) ? props.replace(re, `${k}=${v}`) : props + `\n${k}=${v}`; };
set('server-port', port); set('server-portv6', port + 1); set('level-name', level); set('level-type', 'FLAT');
set('gamemode', 'creative'); set('allow-cheats', 'true'); set('content-log-file-enabled', 'true');
set('content-log-console-output-enabled', 'true'); set('online-mode', 'false'); set('allow-list', 'false');
set('max-players', '2'); set('server-name', 'Pocket List check'); set('enable-lan-visibility', 'false');
fs.writeFileSync(propsPath, props);

console.log(`starting the server on port ${port}, up to ${seconds} s`);
const log = [];
const child = cp.spawn(exe, [], { cwd: folder, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let started = false, done = false, stopped = false;
const send = (cmd) => { console.log('> ' + cmd); child.stdin.write(cmd + '\n'); };
const stop = () => { if (stopped) return; stopped = true; try { send('stop'); } catch {} setTimeout(() => { try { child.kill(); } catch {} }, 15000); };
const onData = (d) => {
	const s = d.toString();
	log.push(s);
	process.stdout.write(s);
	const all = log.join('');
	if (!started && /Server started/.test(all)) {
		started = true;
		// Keep the middle of the flat world loaded and ticking with no player on, then run the test.
		// A kept world still has its ticking area (adding it again is an error line).
		if (!keepWorld) setTimeout(() => send('tickingarea add circle 0 -60 0 4 pltest'), 2000);
		setTimeout(() => send('scriptevent ' + event), 6000);
	}
	if (!done && /PL TEST: DONE/.test(all)) { done = true; setTimeout(stop, 2000); }
};
child.stdout.on('data', onData); child.stderr.on('data', onData);
// The time limit; cleared when the server exits, or it would keep Node running to the end of it.
const limit = setTimeout(stop, seconds * 1000);
child.on('exit', (code) => {
	clearTimeout(limit);
	const all = log.join('');
	let contentLog = '';
	const m = /Writing log to: (.+ContentLog[^\r\n]+\.txt)/.exec(all);
	if (m && fs.existsSync(m[1].trim())) contentLog = fs.readFileSync(m[1].trim(), 'utf8');
	console.log('content log: ' + (m ? m[1].trim() + ' (' + contentLog.split(/\r?\n/).filter(Boolean).length + ' lines)' : 'not written'));
	const both = all + '\n' + contentLog;
	const lines = both.split(/\r?\n/);
	const problems = [];
	// A problem is a line the server tags ERROR or WARN (console) or [error]/[warning] (content
	// log), or one that names an exception; the test's own lines use warn so they show, and are
	// left out.
	const errLines = lines.filter((l) => (/ (ERROR|WARN)\] /.test(l) || /\]\[(error|warning)\]/i.test(l) || /exception/i.test(l))
		&& !/PL TEST|Pocket List test pack started|errorMessage=\(null\)|Content logging to console/.test(l));
	if (!/Server started/.test(all)) problems.push('the server never said "Server started"');
	if (!/Pocket List [\d.]+: script loaded/.test(both)) problems.push('the pack\'s script never said it loaded');
	if (!/PL TEST: start/.test(both)) problems.push('the self-test never started');
	const fails = lines.filter((l) => /PL TEST: (CASE \S+: )?FAIL|PL TEST: \d+ of \d+ FAILED/.test(l));
	const cases = lines.filter((l) => /PL TEST: CASE /.test(l)).map((l) => l.replace(/^.*PL TEST: /, ''));
	console.log('\ncases:\n  ' + (cases.join('\n  ') || '(none)'));
	if (fails.length) problems.push('the self-test failed:\n  ' + fails.map((l) => l.replace(/^.*PL TEST: /, '')).join('\n  '));
	else if (!/PL TEST: PASS all/.test(both)) problems.push('the self-test never passed' + (done ? '' : ' (no DONE line: it timed out)'));
	if (errLines.length) problems.push(`${errLines.length} error or warning line(s):\n  ` + errLines.join('\n  '));
	const version = (/Version:? ([\d.]+)/.exec(all) || [])[1] || '?';
	console.log('\n=== result ===');
	console.log(`server ${version}, exit code ${code}`);
	if (problems.length) { console.log('FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
	console.log(`ok: ${cases.length} cases passed; the packs and scripts loaded with no error or warning lines in the console or the content log`);
});
