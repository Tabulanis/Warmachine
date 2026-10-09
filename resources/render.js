// Renders resources/*.png from emblem.svg with headless Chromium.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const dir = __dirname;
const svg = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(dir, 'emblem.svg')).toString('base64');
const layouts = {
  // Capacitor assets inputs
  'icon-only.png':       { w: 1024, h: 1024, bg: true, emblem: { x: 72, y: 72, s: 880 } },
  'icon-foreground.png': { w: 1024, h: 1024, bg: false, emblem: { x: 212, y: 212, s: 600 } },   // adaptive icon safe zone
  'icon-background.png': { w: 1024, h: 1024, bg: true },
  'splash.png':          { w: 2732, h: 2732, bg: true, moon: true, emblem: { x: 1016, y: 760, s: 700 }, title: true },
  'splash-dark.png':     { w: 2732, h: 2732, bg: true, moon: true, emblem: { x: 1016, y: 760, s: 700 }, title: true },
  // Electron
  '../desktop/build/icon.png': { w: 1024, h: 1024, bg: true, emblem: { x: 72, y: 72, s: 880 }, radius: 180 },
};
(async () => {
  const browser = await chromium.launch();
  for (const [name, L] of Object.entries(layouts)) {
    const page = await browser.newPage({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(dir, 'render.html'));
    await page.evaluate(({ L, svg }) => {
      const b = document.body;
      b.style.width = L.w + 'px'; b.style.height = L.h + 'px'; b.style.position = 'relative'; b.style.overflow = 'hidden';
      if (L.bg) { b.classList.add('bg'); if (L.radius) b.style.borderRadius = L.radius + 'px'; }
      if (L.moon) { const m = document.createElement('div'); m.className = 'moon'; m.style.cssText += `width:${L.w*0.09}px;height:${L.w*0.09}px;left:${L.w*0.68}px;top:${L.h*0.16}px`; b.appendChild(m); }
      if (L.emblem) { const i = document.createElement('img'); i.src = svg; i.style.cssText = `left:${L.emblem.x}px;top:${L.emblem.y}px;width:${L.emblem.s}px;height:${L.emblem.s}px`; b.appendChild(i); }
      if (L.title) {
        const t = document.createElement('div'); t.className = 'title'; t.textContent = 'WAR MACHINE'; t.style.cssText += `top:${L.h*0.58}px;font-size:${L.w*0.085}px`; b.appendChild(t);
        const s = document.createElement('div'); s.className = 'sub'; s.textContent = 'A NIGHT AT THE CASTLE'; s.style.cssText += `top:${L.h*0.69}px;font-size:${L.w*0.026}px`; b.appendChild(s);
      }
    }, { L, svg });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(dir, name), omitBackground: !L.bg, fullPage: false });
    await page.close();
    console.log('rendered', name);
  }
  await browser.close();
})();
