#!/usr/bin/env node
// Packs the game into ONE self-contained HTML file: dist/war-machine.html.
//
// Default build is the "WAD" build. Every game file (page body, stylesheet,
// scripts, Three.js) goes into a single binary container with a directory,
// like Doom's WAD. The container is gzip-compressed, then encrypted with
// AES-256-GCM (authenticated, so a tampered WAD is refused, not run), then
// embedded as base64 in a small loader page that unpacks it in memory.
//
//   node pack.js                 -> dist/war-machine.html (WAD build)
//   node pack.js --plain         -> dist/war-machine.html (everything inlined
//                                   in plain text; handy for debugging)
//   WM_KEY="your secret" node pack.js   use your own key instead of the
//                                       built-in one
//
// No dependencies; plain Node 18+. Honest note: the loader must carry the
// key to decrypt the WAD, so this deters casual editing and detects
// tampering. It does not hide the game from someone determined; nothing
// that runs on the player's device can.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const root = __dirname;
const read = (rel) => fs.readFileSync(path.join(root, rel));
const indexHtml = read('index.html').toString('utf8');

// ----------------------------------------------------------- the files

// Everything index.html references, in load order.
const styles = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const scripts = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const head = indexHtml.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/<script[\s\S]*?<\/script>\s*/g, '');
const body = indexHtml.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>\s*/g, '')
  .replace(/<!--[\s\S]*?-->\s*/g, '');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'war-machine.html');

// ---------------------------------------------------------- plain build

if (process.argv.includes('--plain')) {
  let html = indexHtml;
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, h) => `<style>\n${read(h)}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, s) => `<script>\n${read(s).toString().replace(/<\/script/gi, '<\\/script')}\n</script>`);
  fs.writeFileSync(out, html);
  console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB, plain)`);
  process.exit(0);
}

// ------------------------------------------------------------ WAD build

// Container layout (all integers little-endian):
//   "WMWAD" + version u8 | count u32 | directory | data
//   directory entry: nameLen u16 | name (utf8) | offset u32 | size u32
// Entries are loaded in directory order. Name suffix decides how:
//   .html -> becomes the page body, .css -> <style>, .js -> <script>.
const entries = [
  { name: 'index.html', data: Buffer.from(body, 'utf8') },
  ...styles.map((s) => ({ name: s, data: read(s) })),
  ...scripts.map((s) => ({ name: s, data: read(s) })),
];
const dir = [];
let offset = 0;
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8');
  const rec = Buffer.alloc(2 + name.length + 8);
  rec.writeUInt16LE(name.length, 0);
  name.copy(rec, 2);
  rec.writeUInt32LE(offset, 2 + name.length);
  rec.writeUInt32LE(e.data.length, 6 + name.length);
  dir.push(rec);
  offset += e.data.length;
}
const header = Buffer.alloc(10);
header.write('WMWAD', 0, 'ascii');
header.writeUInt8(1, 5);
header.writeUInt32LE(entries.length, 6);
const wad = Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]);

const packed = zlib.gzipSync(wad, { level: 9 });
const key = crypto.createHash('sha256').update(process.env.WM_KEY || 'war-machine:a-night-at-the-castle').digest();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(packed), cipher.final(), cipher.getAuthTag()]); // WebCrypto expects tag appended
const blob = Buffer.concat([iv, enc]).toString('base64');

// --------------------------------------------------------------- loader

const loader = `
(async () => {
  const say = (m) => { document.body.innerHTML = '<p style="font:16px system-ui;color:#f1ecdf;text-align:center;margin-top:40vh">' + m + '</p>'; };
  try {
    const b64 = document.getElementById('wad').textContent.trim();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob('${key.toString('base64')}'), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter(); w.write(new Uint8Array(plain)); w.close();
    const wad = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    const dv = new DataView(wad.buffer);
    const td = new TextDecoder();
    if (td.decode(wad.subarray(0, 5)) !== 'WMWAD') throw new Error('bad magic');
    const count = dv.getUint32(6, true);
    let p = 10;
    const dir = [];
    for (let i = 0; i < count; i++) {
      const n = dv.getUint16(p, true); p += 2;
      const name = td.decode(wad.subarray(p, p + n)); p += n;
      const off = dv.getUint32(p, true); p += 4;
      const size = dv.getUint32(p, true); p += 4;
      dir.push({ name, off, size });
    }
    const base = p;
    for (const e of dir) {
      const text = td.decode(wad.subarray(base + e.off, base + e.off + e.size));
      if (e.name.endsWith('.html')) document.body.innerHTML = text;
      else if (e.name.endsWith('.css')) { const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }
      else if (e.name.endsWith('.js')) { const s = document.createElement('script'); s.textContent = text; document.body.appendChild(s); }
    }
  } catch (err) {
    console.error(err);
    say('This copy of War Machine is damaged or has been altered and will not run.');
  }
})();
`;

const html = `<!doctype html>
<html lang="en">
<head>${head}</head>
<body>
<script id="wad" type="application/octet-stream">${blob}</script>
<script>${loader}</script>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB, WAD build: ${entries.length} files, ${(wad.length / 1024).toFixed(0)} KB raw -> ${(packed.length / 1024).toFixed(0)} KB packed)`);
