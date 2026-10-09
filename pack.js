#!/usr/bin/env node
// Packs the whole game into ONE self-contained HTML file for sharing:
// stylesheet and every script inlined. No dependencies; plain Node.
//
//   node pack.js            -> dist/war-machine.html
//
// The folder itself already runs from a double-click; this is just for
// when you want to send the game as a single file.
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);

const out = path.join(root, 'dist', 'war-machine.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
