// A small zip writer (deflate, no extras), so the build needs nothing outside Node to make the
// .mcaddon. Files get a fixed timestamp, so the same packs always make the same archive.
'use strict';
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

// files: [{ name: 'folder/file.json', data: Buffer }]
function zip(files) {
	const locals = [], centrals = [];
	let offset = 0;
	for (const f of files) {
		const name = Buffer.from(f.name, 'utf8');
		const deflated = zlib.deflateRawSync(f.data, { level: 9 });
		const stored = deflated.length >= f.data.length;
		const body = stored ? f.data : deflated;
		const crc = crc32(f.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(stored ? 0 : 8, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(f.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		locals.push(local, name, body);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // made by
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(stored ? 0 : 8, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(f.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);
		offset += 30 + name.length + body.length;
	}
	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

module.exports = { zip, crc32 };
