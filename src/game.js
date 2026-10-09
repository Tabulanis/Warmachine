// War Machine — the whole game in one module.
//
// A night assault on a castle. The camera walks the player down a road,
// through the gates, the great hall and into the throne room. Enemies come
// at you on the beat; you swipe to cut them down with whichever weapon is
// in hand. Kept in one file so the flow reads top to bottom.
//
// Classic script: expects the THREE global from vendor/three.js and the
// BeatClock and Input classes from beat.js and input.js, loaded before it.


// --------------------------------------------------------------- tuning

const Z_SPAWN = -55;         // how far ahead of the strike line enemies appear
const Z_SLICE = 0;           // the strike line, relative to the camera rig
const Z_MISS = 9;            // past the camera = they got you
const CAMERA_HEIGHT = 2.0;
const CAMERA_BACK = 7;       // camera sits this far behind the strike line
const LANE_Y = [0.9, 3.0];
const PERFECT_WINDOW = 0.09;  // a strike within this many seconds of ANY beat is PERFECT
const DIR_TOLERANCE = Math.PI / 4 + 0.15;
const GRAVITY = 14;
const SCALE = 1.35;          // enemies are built at unit-ish size, then scaled
const TRAVEL_SPEED = 5;      // units per second while walking
const MAX_POINT_LIGHTS = 5;  // torches beyond this glow but cast no light

const ENEMIES = {
  skeleton: { name: 'SKELETON', points: 10, color: 0xe8e4d0, css: '#e8e4d0', r: 0.8,  y: [0.95, 1.05], beats: 4 },
  knight:   { name: 'KNIGHT',   points: 25, color: 0xaab4c6, css: '#aab4c6', r: 0.95, y: [1.05, 1.15], beats: 4, armored: true },
  bat:      { name: 'BAT',      points: 15, color: 0x9a5fd0, css: '#b57cff', r: 0.6,  y: [2.2, 3.3],   beats: 2.5 },
  skull:    { name: 'SKULL',    points: 0,  color: 0x5cff8a, css: '#5cff8a', r: 0.6,  y: [1.6, 2.8],   beats: 4, cursed: true },
};

const WEAPONS = {
  sword: { name: 'SWORD',        reach: 1.0,  cooldown: 0,    armor: false, mult: 1,   style: 'slice', trail: '#dfe8ff' },
  flail: { name: 'MORNING STAR', reach: 1.25, cooldown: 0.35, armor: true,  mult: 1.3, style: 'smash', trail: '#ff9a3c', aoe: 2.2 },
  whip:  { name: 'WHIP',         reach: 1.9,  cooldown: 0.1,  armor: false, mult: 0.8, style: 'slice', trail: '#c89bff' },
};

// Eight swipe directions a knight's weak point can demand. Screen plane,
// 0 = right, counter-clockwise, y up.
const DIRS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * Math.PI) / 4);

// Spawn probabilities per 16th-note tick, by difficulty level.
const LEVELS = [
  { every: 8, beat: 1.0, eighth: 0.0,  sixteenth: 0.0,  knight: 0.0,  skull: 0.0,  bat: 0.0,  double: 0.0 },
  { every: 4, beat: 0.9, eighth: 0.0,  sixteenth: 0.0,  knight: 0.2,  skull: 0.15, bat: 0.15, double: 0.0 },
  { every: 4, beat: 0.9, eighth: 0.3,  sixteenth: 0.0,  knight: 0.3,  skull: 0.2,  bat: 0.25, double: 0.1 },
  { every: 4, beat: 1.0, eighth: 0.5,  sixteenth: 0.05, knight: 0.35, skull: 0.25, bat: 0.3,  double: 0.2 },
  { every: 4, beat: 1.0, eighth: 0.65, sixteenth: 0.1,  knight: 0.4,  skull: 0.3,  bat: 0.35, double: 0.3 },
  { every: 4, beat: 1.0, eighth: 0.8,  sixteenth: 0.2,  knight: 0.45, skull: 0.35, bat: 0.4,  double: 0.4 },
];

// The level, bit by bit. Travel stages walk you forward (lighter waves);
// fight stages hold you at a landmark until you have cut down enough enemies.
const STAGES = [
  { name: 'THE ROAD',         kind: 'travel', theme: 'road',      length: 50, density: 0.5,  level: 0 },
  { name: 'THE CASTLE GATES', kind: 'fight',  landmark: 'gate',   kills: 8,  level: 1 },
  { name: 'THE COURTYARD',    kind: 'travel', theme: 'courtyard', length: 30, density: 0.6,  level: 1 },
  { name: 'THE GREAT HALL',   kind: 'fight',  landmark: 'hall',   kills: 12, level: 2 },
  { name: 'THE HALL',         kind: 'travel', theme: 'hall',      length: 30, density: 0.7,  level: 3 },
  { name: 'THE CRYPT STAIRS', kind: 'fight',  landmark: 'crypt',  kills: 14, level: 3 },
  { name: 'THE CRYPT',        kind: 'travel', theme: 'crypt',     length: 24, density: 0.8,  level: 4 },
  { name: 'THE THRONE ROOM',  kind: 'fight',  landmark: 'throne', kills: 20, level: 5 },
];
const LANDMARK_AHEAD = 14;   // landmarks sit this far past the stage boundary

const STATE = { MENU: 'menu', PLAY: 'play', PAUSE: 'pause', OVER: 'over' };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let u = 0;
  if (len2 > 0) u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}

// ---------------------------------------------------------- 3D helpers

// Lambert, not Standard: the scene carries a handful of point lights and
// Lambert keeps the per-pixel cost low enough for weak phones.
function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}
function glow(color, intensity = 0.6, extra = {}) {
  return mat(color, { emissive: color, emissiveIntensity: intensity, ...extra });
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  arrowHead: new THREE.ConeGeometry(0.3, 0.45, 3),
  arrowShaft: new THREE.BoxGeometry(0.14, 0.4, 0.1),
};
function box(parent, m, w, h, d, x, y, z) {
  const o = new THREE.Mesh(G.box, m);
  o.scale.set(w, h, d);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function cyl(parent, m, r, h, x, y, z) {
  const o = new THREE.Mesh(G.cyl, m);
  o.scale.set(r * 2, h, r * 2);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function sphere(parent, m, r, x, y, z) {
  const o = new THREE.Mesh(G.sphere, m);
  o.scale.setScalar(r * 2);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

const M = {
  bone: glow(0xe8e4d0, 0.3),
  eye: glow(0xff3030, 1.2),
  steel: glow(0x8a95a8, 0.12),
  steelDark: mat(0x3a404c),
  weak: glow(0xff3a3a, 1.0),
  batBody: mat(0x2a1838),
  batWing: mat(0x4a2a6a, { side: THREE.DoubleSide }),
  skull: glow(0x5cff8a, 0.7),
  skullDark: mat(0x0a2a14),
  stone: mat(0x3a3a42),
  stoneDark: mat(0x26262d),
  road: mat(0x1f1e24),
  carpet: mat(0x4a1018),
  ground: mat(0x0e0f14),
  wood: mat(0x3a2518),
  leaf: mat(0x16211c),
  flame: glow(0xff9a3c, 1.4),
  gold: glow(0xd9a441, 0.3),
  gem: glow(0xd7263d, 1.2),
  moon: new THREE.MeshBasicMaterial({ color: 0xcdd6ff, fog: false }),
};

/** Build an enemy's visual as a Group so the halves can clone it. */
function buildEnemy(type, dir) {
  const g = new THREE.Group();
  if (type === 'skeleton') {
    sphere(g, M.bone, 0.3, 0, 0.75, 0);
    sphere(g, M.eye, 0.06, -0.11, 0.78, 0.25);
    sphere(g, M.eye, 0.06, 0.11, 0.78, 0.25);
    box(g, M.bone, 0.5, 0.65, 0.28, 0, 0.15, 0);
    for (let i = 0; i < 3; i++) box(g, M.bone, 0.56, 0.06, 0.32, 0, 0.3 - i * 0.16, 0);
    const armL = cyl(g, M.bone, 0.06, 0.6, -0.36, 0.1, 0); armL.name = 'armL';
    const armR = cyl(g, M.bone, 0.06, 0.6, 0.36, 0.1, 0); armR.name = 'armR';
    cyl(g, M.bone, 0.07, 0.7, -0.14, -0.6, 0);
    cyl(g, M.bone, 0.07, 0.7, 0.14, -0.6, 0);
  } else if (type === 'knight') {
    box(g, M.steel, 0.8, 1.0, 0.5, 0, 0, 0);
    box(g, M.steelDark, 0.9, 0.12, 0.6, 0, 0.56, 0);              // pauldrons
    box(g, M.steel, 0.5, 0.5, 0.5, 0, 0.85, 0);                    // helm
    box(g, M.steelDark, 0.4, 0.08, 0.1, 0, 0.85, 0.26);            // visor
    box(g, M.steelDark, 0.6, 0.8, 0.12, -0.6, 0, 0.1);             // shield
    box(g, M.steel, 0.25, 0.85, 0.25, -0.2, -0.9, 0);
    box(g, M.steel, 0.25, 0.85, 0.25, 0.2, -0.9, 0);
    // The weak point: a glowing arrow on the breastplate showing the cut.
    const arrow = new THREE.Group();
    const head = new THREE.Mesh(G.arrowHead, M.weak); head.position.y = 0.28;
    const shaft = new THREE.Mesh(G.arrowShaft, M.weak); shaft.position.y = -0.1;
    arrow.add(head, shaft);
    arrow.position.z = 0.3;
    arrow.rotation.z = dir - Math.PI / 2;
    g.add(arrow);
  } else if (type === 'bat') {
    sphere(g, M.batBody, 0.2, 0, 0, 0);
    sphere(g, M.eye, 0.04, -0.08, 0.05, 0.17);
    sphere(g, M.eye, 0.04, 0.08, 0.05, 0.17);
    const wl = box(g, M.batWing, 0.7, 0.04, 0.35, -0.5, 0, 0); wl.name = 'wingL';
    const wr = box(g, M.batWing, 0.7, 0.04, 0.35, 0.5, 0, 0); wr.name = 'wingR';
  } else {
    sphere(g, M.skull, 0.45, 0, 0.05, 0);
    sphere(g, M.skullDark, 0.1, -0.15, 0.1, 0.38);
    sphere(g, M.skullDark, 0.1, 0.15, 0.1, 0.38);
    box(g, M.skull, 0.4, 0.2, 0.3, 0, -0.4, 0.1);
    for (let i = 0; i < 4; i++) box(g, M.skullDark, 0.05, 0.12, 0.05, -0.15 + i * 0.1, -0.33, 0.26);
  }
  return g;
}

// ------------------------------------------------------------ particles

class Sparks {
  constructor(scene, n = 600) {
    this.n = n;
    this.next = 0;
    this.pos = new Float32Array(n * 3).fill(1000);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.2, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }

  burst(p, color, count, power) {
    this.tmp.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.next++ % this.n;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(rand(0.3, 1) * power);
      this.vel.set([dir.x, dir.y, dir.z], i * 3);
      const bright = rand(0.6, 1.4);
      this.col.set([this.tmp.r * bright, this.tmp.g * bright, this.tmp.b * bright], i * 3);
      this.life[i] = rand(0.4, 0.9);
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 2] = 1000; continue; }
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.vel[j + 1] -= 9 * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ----------------------------------------------------------------- game

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.fx = document.getElementById('fx');
    this.fxCtx = this.fx.getContext('2d');
    this.beat = new BeatClock();
    this.input = new Input(canvas);
    this.state = STATE.MENU;
    this.best = Number(localStorage.getItem('warmachine.best') || 0);
    this.enemies = [];
    this.halves = [];
    this.torches = [];
    this.shake = 0;
    this.lastFrame = 0;
    this.progress = 0;
    this.weapon = 'sword';
    this.weaponReadyAt = 0;

    this.setupScene();
    this.buildLevel();
    this.setupDOM();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === STATE.PLAY) this.pause();
    });
  }

  // ------------------------------------------------------------- setup

  setupScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.localClippingEnabled = true;   // needed for the sliced halves

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 16, 62);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

    this.scene.add(new THREE.AmbientLight(0x505a80, 1.4));
    const moon = new THREE.DirectionalLight(0x9fb0ff, 2.0);
    moon.position.set(-6, 14, 4);
    this.scene.add(moon);
    // A warm pulse that follows the player and throbs on the beat.
    this.pulseLight = new THREE.PointLight(0xff9a3c, 30, 40, 1.6);
    this.scene.add(this.pulseLight);

    // The strike line: a faint ember glow across the road at the beat.
    this.beatLine = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beatLine.rotation.x = -Math.PI / 2;
    this.scene.add(this.beatLine);

    this.sparks = new Sparks(this.scene);
    this.resize();
  }

  /** Lay out every stage's scenery once. World z = -distance along the level. */
  buildLevel() {
    this.world = new THREE.Group();
    this.scene.add(this.world);
    let d = 0;
    this.totalLength = 0;
    for (const s of STAGES) {
      s.start = d;
      if (s.kind === 'travel') {
        this.buildTheme(s.theme, d, d + s.length);
        d += s.length;
      } else {
        this.buildLandmark(s.landmark, d + LANDMARK_AHEAD);
      }
    }
    this.totalLength = d;

    // Ground and road run the whole way, plus some slack at both ends.
    const ground = box(this.world, M.ground, 400, 0.1, d + 400, 0, -0.06, -d / 2);
    ground.receiveShadow = false;
    box(this.world, M.road, 8, 0.08, d + 400, 0, -0.03, -d / 2);

    const moonBall = sphere(this.world, M.moon, 9, -60, 70, -d - 150);
    moonBall.frustumCulled = false;
  }

  buildTheme(theme, from, to) {
    const w = this.world;
    if (theme === 'road') {
      for (let z = from; z < to; z += rand(5, 8)) {
        for (const side of [-1, 1]) {
          const x = side * rand(7, 15), h = rand(4, 7);
          cyl(w, M.wood, 0.25, h, x, h / 2, -z);
          // Bare, twisted branches.
          for (let i = 0; i < 3; i++) {
            const b = cyl(w, M.wood, 0.08, rand(1.5, 2.5), x, h * rand(0.6, 0.95), -z);
            b.rotation.z = rand(-1.2, 1.2) * side;
            b.rotation.x = rand(-0.6, 0.6);
          }
        }
        if (Math.random() < 0.5) {
          const gx = pick([-1, 1]) * rand(5, 7);
          box(w, M.stoneDark, 0.7, 1.0, 0.2, gx, 0.5, -z - rand(0, 3));
        }
      }
    } else if (theme === 'courtyard') {
      for (let z = from; z < to; z += 10) {
        for (const side of [-1, 1]) {
          box(w, M.stone, 1.5, 5, 10, side * 8.5, 2.5, -z - 5);
          for (let i = 0; i < 5; i++) box(w, M.stoneDark, 1.5, 0.7, 1, side * 8.5, 5.35, -z - 1 - i * 2);
          if ((z - from) % 20 === 0) this.torch(side * 7.6, 3.2, -z - 5);
        }
      }
    } else if (theme === 'hall') {
      box(w, M.carpet, 3, 0.04, to - from, 0, 0.03, -(from + to) / 2);
      for (let z = from; z < to; z += 8) {
        for (const side of [-1, 1]) {
          cyl(w, M.stone, 0.7, 9, side * 6, 4.5, -z - 4);
          box(w, M.stoneDark, 1.8, 0.4, 1.8, side * 6, 9.1, -z - 4);
          box(w, M.carpet, 0.9, 3.5, 0.08, side * 6, 5.5, -z - 4 + 0.75);   // banner
          if ((z - from) % 16 === 0) this.torch(side * 5.1, 3.4, -z - 4);
        }
        box(w, M.stone, 20, 1.5, 8, 0, 10.5, -z - 4);                        // ceiling beam
      }
    } else if (theme === 'crypt') {
      // Low, close, candle-lit. Coffins along the walls.
      for (let z = from; z < to; z += 6) {
        for (const side of [-1, 1]) {
          box(w, M.stoneDark, 2, 4, 6, side * 6, 2, -z - 3);
          box(w, M.wood, 0.8, 0.6, 2.2, side * 4.6, 0.3, -z - 3 + rand(-1, 1));
          if ((z - from) % 12 === 0) this.candle(side * 4.6, 0.75, -z - 3);
        }
        box(w, M.stoneDark, 14, 1, 6, 0, 4.5, -z - 3);                          // low ceiling
      }
    }
  }

  buildLandmark(kind, dist) {
    const w = this.world, z = -dist;
    if (kind === 'gate') {
      for (const side of [-1, 1]) {
        cyl(w, M.stone, 3, 14, side * 7.5, 7, z);
        const roof = new THREE.Mesh(G.cone, M.stoneDark);
        roof.scale.set(7, 5, 7); roof.position.set(side * 7.5, 16.5, z); w.add(roof);
        this.torch(side * 4.2, 3.4, z + 0.5);
      }
      box(w, M.stone, 9, 4, 3, 0, 9, z);                                       // arch lintel
      for (let i = 0; i < 6; i++) box(w, M.stoneDark, 1, 0.8, 3.2, -4.5 + i * 1.8, 11.4, z);
      box(w, M.stone, 60, 9, 2.5, 0, 4.5, z);                                   // curtain wall
      box(w, M.ground, 7.5, 7.5, 2.6, 0, 3.75, z);                              // the open gateway
    } else if (kind === 'hall') {
      for (const side of [-1, 1]) {
        cyl(w, M.stone, 1.2, 12, side * 5.5, 6, z);
        this.torch(side * 4, 3.4, z + 0.6);
      }
      box(w, M.stone, 14, 2.5, 2.5, 0, 12.5, z);
      box(w, M.stone, 60, 14, 2, 0, 7, z);
      box(w, M.ground, 8, 11, 2.2, 0, 5.5, z);
    } else if (kind === 'crypt') {
      // A sunken archway with steps down and skulls on the posts.
      for (const side of [-1, 1]) {
        box(w, M.stoneDark, 1.5, 6, 1.5, side * 4.5, 3, z);
        sphere(w, M.bone, 0.35, side * 4.5, 6.3, z);
        this.candle(side * 3.4, 0.2, z + 1.5);
      }
      box(w, M.stoneDark, 10.5, 1.5, 1.5, 0, 6.5, z);
      for (let i = 0; i < 4; i++) box(w, M.stone, 8, 0.3, 1.2, 0, -0.15 - i * 0.3, z - 1 - i * 1.2);   // steps down
      box(w, M.stoneDark, 60, 10, 2, 0, 5, z);
      box(w, M.ground, 7.5, 6, 2.2, 0, 3, z);
    } else if (kind === 'throne') {
      box(w, M.stone, 10, 1, 6, 0, 0.5, z - 2);
      box(w, M.stone, 8, 1, 4, 0, 1.5, z - 3);
      box(w, M.gold, 2, 1, 2, 0, 2.5, z - 3);                                   // seat
      box(w, M.gold, 2.4, 4, 0.4, 0, 4.5, z - 4);                               // back
      sphere(w, M.gem, 0.3, 0, 6.2, z - 3.9);
      for (const side of [-1, 1]) {
        box(w, M.gold, 0.3, 1.6, 2, side * 1.0, 3.3, z - 3);
        this.torch(side * 3.5, 3.4, z - 1);
        this.torch(side * 6, 3.4, z + 4);
      }
      box(w, M.stone, 60, 16, 2, 0, 8, z - 7);                                   // back wall
    }
  }

  candle(x, y, z) {
    cyl(this.world, M.bone, 0.08, 0.35, x, y + 0.17, z);
    const flame = new THREE.Mesh(G.cone, M.flame);
    flame.scale.set(0.16, 0.3, 0.16);
    flame.position.set(x, y + 0.5, z);
    this.world.add(flame);
    this.torches.push({ flame, light: null, phase: Math.random() * 10, small: true });
  }

  torch(x, y, z) {
    const w = this.world;
    cyl(w, M.wood, 0.08, 1.2, x, y - 0.4, z);
    const flame = new THREE.Mesh(G.cone, M.flame);
    flame.scale.set(0.45, 0.8, 0.45);
    flame.position.set(x, y + 0.4, z);
    w.add(flame);
    let light = null;
    if (this.torches.length < MAX_POINT_LIGHTS) {
      light = new THREE.PointLight(0xff9a3c, 18, 22, 1.8);
      light.position.set(x, y + 0.6, z);
      w.add(light);
    }
    this.torches.push({ flame, light, phase: Math.random() * 10 });
  }

  setupDOM() {
    const $ = (id) => document.getElementById(id);
    this.dom = {
      hud: $('hud'), score: $('score'), lives: $('lives'), combo: $('combo'),
      stageName: $('stage-name'), stageGoal: $('stage-goal'), weapons: $('weapons'),
      progressFill: $('progress-fill'), beatFill: $('beat-fill'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      menu: $('menu'), pause: $('pause'), over: $('over'), overTitle: $('over-title'),
      final: $('final'), finalBest: $('final-best'), best: $('best'), again: $('again'),
    };
    this.dom.menu.querySelectorAll('button[data-bpm]').forEach((b) => {
      b.addEventListener('click', () => this.startRun(Number(b.dataset.bpm), b.dataset.name));
    });
    this.dom.weapons.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => this.setWeapon(b.dataset.weapon));
    });
    this.dom.again.addEventListener('click', () => this.toMenu());
    this.dom.pause.addEventListener('click', () => this.resume());
    this.dom.best.textContent = this.best ? `BEST ${String(this.best).padStart(6, '0')}` : '';
    this.setWeapon('sword');
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fx.width = w * dpr;
    this.fx.height = h * dpr;
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep spawns inside the visible lane whatever the aspect ratio.
    const halfW = Math.tan(THREE.MathUtils.degToRad(30)) * CAMERA_BACK * this.camera.aspect;
    this.laneX = Math.min(3.4, halfW * 0.7);
  }

  // -------------------------------------------------------------- flow

  run() {
    const loop = (ts) => {
      const dt = Math.min(0.05, (ts - this.lastFrame) / 1000 || 0);
      this.lastFrame = ts;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.drawTrail();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  startRun(bpm, name) {
    this.clearField();
    this.score = 0;
    this.combo = 0;
    this.lives = 3;
    this.chartTick = 0;
    this.progress = 0;
    this.stageIndex = -1;
    this.stageKills = 0;
    this.bpm = bpm;
    this.difficultyName = name;
    this.weaponReadyAt = 0;
    this.setWeapon('sword');
    this.beat.start(bpm);
    this.state = STATE.PLAY;
    this.dom.menu.classList.add('hidden');
    this.dom.over.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.enterStage(0);
    this.updateHUD();
  }

  pause() {
    if (this.state !== STATE.PLAY) return;
    this.state = STATE.PAUSE;
    this.beat.pause();
    this.dom.pause.classList.remove('hidden');
  }

  resume() {
    if (this.state !== STATE.PAUSE) return;
    this.state = STATE.PLAY;
    this.beat.resume();
    this.dom.pause.classList.add('hidden');
    this.input.consumeSegments();
  }

  endRun(won) {
    this.state = STATE.OVER;
    this.beat.stop();
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('warmachine.best', String(this.best));
    }
    this.dom.overTitle.textContent = won ? 'THE CASTLE FALLS' : 'YOU HAVE FALLEN';
    this.dom.overTitle.classList.toggle('win', won);
    this.dom.final.textContent = String(this.score).padStart(6, '0');
    this.dom.finalBest.textContent = `BEST ${String(this.best).padStart(6, '0')}`;
    setTimeout(() => this.dom.over.classList.remove('hidden'), won ? 1800 : 900);
  }

  toMenu() {
    this.clearField();
    this.state = STATE.MENU;
    this.progress = 0;
    this.dom.over.classList.add('hidden');
    this.dom.hud.classList.add('hidden');
    this.dom.menu.classList.remove('hidden');
    this.dom.best.textContent = this.best ? `BEST ${String(this.best).padStart(6, '0')}` : '';
  }

  clearField() {
    for (const e of this.enemies) this.scene.remove(e.obj);
    for (const h of this.halves) this.disposeHalf(h);
    this.enemies = [];
    this.halves = [];
    document.querySelectorAll('.floater').forEach((el) => el.remove());
  }

  // ------------------------------------------------------------ stages

  get stage() { return STAGES[this.stageIndex]; }

  enterStage(i) {
    if (i >= STAGES.length) { this.endRun(true); return; }
    this.stageIndex = i;
    this.stageKills = 0;
    const s = this.stage;
    this.showBanner(s.name, s.kind === 'fight' ? `CUT DOWN ${s.kills}` : 'ONWARD');
    this.dom.stageName.textContent = s.name;
    if (s.kind === 'fight') this.beat.bell();
    this.updateHUD();
  }

  showBanner(title, sub) {
    const b = this.dom.banner;
    this.dom.bannerTitle.textContent = title;
    this.dom.bannerSub.textContent = sub || '';
    b.classList.add('hidden');
    void b.offsetWidth;            // restart the CSS animation
    b.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2700);
  }

  setWeapon(key) {
    if (!WEAPONS[key]) return;
    this.weapon = key;
    this.dom.weapons.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.weapon === key));
  }

  // ------------------------------------------------------------ update

  update(dt) {
    for (const k of this.input.consumeKeys()) {
      if (k === 'p' || k === 'P' || k === 'Escape') {
        if (this.state === STATE.PLAY) this.pause();
        else if (this.state === STATE.PAUSE) this.resume();
      }
      if (['1', '2', '3'].includes(k)) {
        if (this.state === STATE.MENU) this.dom.menu.querySelectorAll('button[data-bpm]')[Number(k) - 1].click();
        else this.setWeapon(['sword', 'flail', 'whip'][Number(k) - 1]);
      }
    }

    const phase = this.state === STATE.PLAY ? this.beat.beatPhase() : (performance.now() / 600) % 1;
    if (this.state === STATE.PLAY) this.updatePlay(dt);
    else this.input.consumeSegments();
    this.placeCamera(dt, phase);
    this.animateWorld(dt, phase);
    this.input.pruneTrail();
    this.updateHalves(dt);
    this.sparks.update(dt);
  }

  /** Camera rig: where the player is standing on the level right now. */
  get camZ() { return CAMERA_BACK - this.progress; }

  placeCamera(dt, phase) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.6;
    const walking = this.state === STATE.PLAY && this.stage && this.stage.kind === 'travel';
    const bob = walking ? Math.sin(performance.now() / 180) * 0.05 : 0;
    this.camera.position.set(
      (Math.random() - 0.5) * s,
      CAMERA_HEIGHT + bob + (Math.random() - 0.5) * s,
      this.camZ,
    );
    this.camera.lookAt(0, CAMERA_HEIGHT - 0.4, this.camZ - 40);
    this.beatLine.position.set(0, 0.02, this.camZ - CAMERA_BACK);
    this.pulseLight.position.set(0, 3, this.camZ - 3);
  }

  animateWorld(dt, phase) {
    const pulse = Math.pow(1 - phase, 3);
    const t = performance.now() / 1000;
    this.pulseLight.intensity = 10 + pulse * 50;
    this.beatLine.material.opacity = 0.2 + pulse * 0.6;
    this.beatLine.scale.y = 1 + pulse * 2;
    for (const tr of this.torches) {
      const flicker = 0.8 + Math.sin(t * 13 + tr.phase) * 0.12 + Math.sin(t * 29 + tr.phase * 2) * 0.08;
      tr.flame.scale.y = (tr.small ? 0.3 : 0.8) * flicker + pulse * (tr.small ? 0.1 : 0.4);
      if (tr.light) tr.light.intensity = 18 * flicker + pulse * 10;
    }
    if (this.dom.beatFill) this.dom.beatFill.style.transform = `scaleX(${1 - phase})`;
  }

  updatePlay(dt) {
    const now = this.beat.now();
    const s = this.stage;

    // Advance through the level.
    if (s.kind === 'travel') {
      this.progress = Math.min(s.start + s.length, this.progress + TRAVEL_SPEED * dt);
      if (this.progress >= s.start + s.length) this.enterStage(this.stageIndex + 1);
    } else if (this.stageKills >= s.kills) {
      this.showBanner('ONWARD', '');
      this.beat.bell();
      this.enterStage(this.stageIndex + 1);
    }
    if (this.state !== STATE.PLAY) return;
    this.dom.progressFill.style.width = `${(this.progress / this.totalLength) * 100}%`;

    // Plan the chart far enough ahead that enemies exist before they are visible.
    const maxApproach = 4 * this.beat.beatLen;
    while (this.beat.tickTime(this.chartTick) < now + maxApproach + 0.2) {
      this.planTick(this.chartTick);
      this.chartTick++;
    }

    // Move enemies. Position comes straight from the audio clock, so they
    // stay glued to the beat even if frames hitch.
    const strike = this.camZ - CAMERA_BACK;
    for (const e of this.enemies) {
      const speed = (Z_SLICE - Z_SPAWN) / (e.def.beats * this.beat.beatLen);
      e.zRel = Z_SLICE + (now - e.arrive) * speed;
      const bob = e.type === 'bat' ? Math.sin(now * 9 + e.bob) * 0.25 : Math.sin(now * 5 + e.bob) * 0.06;
      e.obj.position.set(e.x, e.y + bob, strike + e.zRel);
      e.punch = Math.max(0, e.punch - dt * 4);
      e.obj.scale.setScalar(SCALE * (1 + e.punch * 0.3));
      this.animateEnemy(e, now);
      if (e.zRel > Z_MISS) {
        e.dead = true;
        if (!e.def.cursed) this.miss(e);
      }
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead) this.scene.remove(e.obj);
      return !e.dead;
    });

    const segs = this.input.consumeSegments();
    if (segs.length && this.enemies.length) this.slice(segs, now);
  }

  animateEnemy(e, now) {
    if (e.type === 'skeleton') {
      const sw = Math.sin(now * 6 + e.bob) * 0.6;
      e.obj.getObjectByName('armL').rotation.x = sw;
      e.obj.getObjectByName('armR').rotation.x = -sw;
      e.obj.rotation.y = Math.sin(now * 3 + e.bob) * 0.15;
    } else if (e.type === 'bat') {
      const flap = Math.sin(now * 22 + e.bob) * 0.7;
      e.obj.getObjectByName('wingL').rotation.z = flap;
      e.obj.getObjectByName('wingR').rotation.z = -flap;
    } else if (e.type === 'skull') {
      e.obj.rotation.y = Math.sin(now * 2 + e.bob) * 0.5;
    } else if (e.type === 'knight') {
      e.obj.rotation.z = Math.sin(now * 5 + e.bob) * 0.04;
    }
  }

  planTick(tick) {
    const bar = Math.floor(tick / BeatClock.TICKS_PER_BAR);
    const inBar = tick % BeatClock.TICKS_PER_BAR;
    if (bar < 1) return; // one bar of count-in
    const s = this.stage;
    const L = LEVELS[Math.min(LEVELS.length - 1, s.level)];
    const density = s.kind === 'fight' ? 1 : s.density;
    const arrive = this.beat.tickTime(tick);
    const spawns = [];
    const roll = (p) => Math.random() < p * density;
    const main = () => (Math.random() < L.knight ? 'knight' : 'skeleton');

    if (inBar % L.every === 0) {
      if (roll(L.beat)) spawns.push(main());
      if (roll(L.double)) spawns.push(Math.random() < L.bat ? 'bat' : 'skeleton');
    } else if (inBar % 2 === 0) {
      if (roll(L.eighth)) spawns.push(Math.random() < L.bat ? 'bat' : main());
      if (inBar % 4 === 2 && roll(L.skull)) spawns.push('skull');
    } else if (roll(L.sixteenth)) {
      spawns.push('bat');
    }

    const usedX = [];
    for (const type of spawns) {
      let x = rand(-this.laneX, this.laneX);
      for (let tries = 0; tries < 6 && usedX.some((u) => Math.abs(u - x) < 1.8); tries++) {
        x = rand(-this.laneX, this.laneX);
      }
      usedX.push(x);
      this.spawn(type, x, arrive);
    }
  }

  spawn(type, x, arrive) {
    const def = ENEMIES[type];
    const dir = def.armored ? pick(DIRS) : 0;
    const obj = buildEnemy(type, dir);
    obj.position.set(x, 1, this.camZ - CAMERA_BACK + Z_SPAWN);
    obj.scale.setScalar(SCALE);
    this.scene.add(obj);
    this.enemies.push({
      type, def, obj, x, y: rand(def.y[0], def.y[1]) * SCALE, arrive, dir,
      zRel: Z_SPAWN, bob: Math.random() * Math.PI * 2, punch: 0, flashUntil: 0, dead: false,
    });
  }

  // ------------------------------------------------------------ slicing

  /** Screen-space position and radius (in CSS px) of an enemy. */
  project(e) {
    const W = window.innerWidth, H = window.innerHeight;
    const c = e.obj.position.clone().project(this.camera);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const edge = e.obj.position.clone().addScaledVector(up, e.def.r * SCALE).project(this.camera);
    const sx = (c.x + 1) / 2 * W, sy = (1 - c.y) / 2 * H;
    const ex = (edge.x + 1) / 2 * W, ey = (1 - edge.y) / 2 * H;
    return { x: sx, y: sy, r: Math.hypot(ex - sx, ey - sy), behind: c.z > 1 };
  }

  slice(segs, now) {
    const weapon = WEAPONS[this.weapon];
    const projected = this.enemies.map((e) => this.project(e));
    for (const s of segs) {
      if (now < this.weaponReadyAt) return;
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      if (len < 3) continue;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const p = projected[i];
        if (e.dead || p.behind || now < e.flashUntil) continue;
        if (pointSegmentDistance(p.x, p.y, s.x1, s.y1, s.x2, s.y2) > p.r * weapon.reach) continue;

        const swipeAngle = Math.atan2(-dy, dx); // y up
        if (e.def.armored && !weapon.armor && angleDiff(swipeAngle, e.dir) > DIR_TOLERANCE) {
          this.clang(e, now, p);
          continue;
        }
        if (weapon.style === 'smash') {
          // The morning star flattens everything near the point of impact.
          for (let j = 0; j < this.enemies.length; j++) {
            const o = this.enemies[j], q = projected[j];
            if (o.dead || q.behind) continue;
            if (Math.hypot(q.x - p.x, q.y - p.y) <= p.r * weapon.aoe) this.kill(o, now, q, weapon, null);
          }
          this.weaponReadyAt = now + weapon.cooldown;
          this.beat.smash();
          this.shake = Math.max(this.shake, 0.5);
        } else {
          this.kill(e, now, p, weapon, { ndx: dx / len, ndy: dy / len });
          if (weapon.cooldown) this.weaponReadyAt = now + weapon.cooldown;
        }
        if (now < this.weaponReadyAt) break;
      }
    }
  }

  kill(e, now, p, weapon, cut) {
    if (e.dead) return;
    e.dead = true;
    this.scene.remove(e.obj);
    const pos = e.obj.position.clone();

    if (e.def.cursed) {
      this.lives--;
      this.combo = 0;
      this.shake = 1;
      this.beat.explode();
      this.sparks.burst(pos, 0x5cff8a, 90, 9);
      this.sparks.burst(pos, 0xd7263d, 40, 5);
      this.floater('CURSED', p.x, p.y, ENEMIES.skull.css);
      this.updateHUD();
      if (this.lives <= 0) this.endRun(false);
      return;
    }

    if (cut) {
      // Cut plane: contains the swipe direction (lifted into camera space)
      // and the view direction, passing through the enemy's centre.
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      const swipe = right.multiplyScalar(cut.ndx).addScaledVector(up, -cut.ndy).normalize();
      const view = this.camera.getWorldDirection(new THREE.Vector3());
      const normal = new THREE.Vector3().crossVectors(swipe, view).normalize();
      this.spawnHalves(e, normal);
      this.beat.slice();
      this.sparks.burst(pos, e.def.color, 30, 6);
    } else {
      this.sparks.burst(pos, e.def.color, 70, 9);
    }

    // PERFECT is about the strike, not the enemy: land it on any beat and
    // it counts, wherever the enemy happens to be.
    const beatPos = now / this.beat.beatLen;
    const off = Math.abs(beatPos - Math.round(beatPos)) * this.beat.beatLen;
    let label, timing, color;
    if (off <= PERFECT_WINDOW) { label = 'PERFECT'; timing = 2; color = '#ffd166'; this.beat.perfect(); }
    else { label = cut ? 'CUT' : 'SMASH'; timing = 1; color = '#ffffff'; }
    this.combo++;
    this.stageKills++;
    const pts = Math.round(e.def.points * timing * weapon.mult * this.multiplier);
    this.score += pts;
    this.floater(`${label} +${pts}`, p.x, p.y, color);
    this.updateHUD();
  }

  clang(e, now, p) {
    e.flashUntil = now + 0.4;
    e.punch = 1;
    this.combo = 0;
    this.beat.clang();
    this.sparks.burst(e.obj.position, 0xffd166, 12, 4);
    this.floater('ARMOUR', p.x, p.y, ENEMIES.knight.css);
    this.updateHUD();
  }

  miss(e) {
    this.lives--;
    this.combo = 0;
    this.shake = Math.max(this.shake, 0.7);
    this.beat.miss();
    this.floater('HIT', window.innerWidth / 2, window.innerHeight * 0.75, '#d7263d');
    this.updateHUD();
    if (this.lives <= 0) this.endRun(false);
  }

  get multiplier() { return Math.min(4, 1 + Math.floor(this.combo / 8)); }

  // ------------------------------------------------------------- halves

  spawnHalves(e, normal) {
    const speed = (Z_SLICE - Z_SPAWN) / (e.def.beats * this.beat.beatLen);
    for (const side of [1, -1]) {
      const obj = e.obj.clone(true);
      const plane = new THREE.Plane();
      const mats = [];
      obj.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.clippingPlanes = [plane];
        m.material.side = THREE.DoubleSide;
        mats.push(m.material);
      });
      obj.scale.setScalar(SCALE);
      this.scene.add(obj);
      this.halves.push({
        obj, plane, mats, normal, side,
        vel: new THREE.Vector3(0, rand(1, 3), speed * 0.5).addScaledVector(normal, side * rand(3, 5)),
        spin: side * rand(2, 5),
        life: 1.1,
      });
    }
  }

  updateHalves(dt) {
    for (const h of this.halves) {
      h.life -= dt;
      if (h.life <= 0) { this.disposeHalf(h); continue; }
      h.obj.position.addScaledVector(h.vel, dt);
      h.vel.y -= GRAVITY * dt;
      h.obj.rotateOnWorldAxis(h.normal, h.spin * dt);
      // Keep the clip plane through the piece's centre so the cut face
      // stays put as it tumbles (rotation is about the plane normal).
      h.plane.setFromNormalAndCoplanarPoint(h.normal.clone().multiplyScalar(h.side), h.obj.position);
      const a = Math.min(1, h.life * 2.5);
      for (const m of h.mats) { m.transparent = true; m.opacity = a; }
    }
    this.halves = this.halves.filter((h) => h.life > 0);
  }

  disposeHalf(h) {
    this.scene.remove(h.obj);
    for (const m of h.mats) m.dispose();
  }

  // ---------------------------------------------------------------- HUD

  updateHUD() {
    this.dom.score.textContent = String(this.score).padStart(6, '0');
    this.dom.lives.querySelectorAll('span').forEach((s, i) => s.classList.toggle('off', i >= this.lives));
    this.dom.combo.innerHTML = this.combo >= 3
      ? `${this.combo}x COMBO${this.multiplier > 1 ? `<small>SCORE x${this.multiplier}</small>` : ''}`
      : '';
    const s = this.stage;
    if (s) this.dom.stageGoal.textContent = s.kind === 'fight' ? `${Math.min(this.stageKills, s.kills)} / ${s.kills}` : 'ONWARD';
  }

  floater(text, x, y, color) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  /** The blade: the recent pointer trail, drawn on the 2D overlay. */
  drawTrail() {
    const ctx = this.fxCtx;
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    const trail = this.input.trail;
    if (trail.length < 2 || this.state !== STATE.PLAY) return;
    const now = performance.now();
    const color = WEAPONS[this.weapon].trail;
    const cooling = this.beat.now() < this.weaponReadyAt;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const k = Math.max(0, 1 - (now - b.t) / 140) * (cooling ? 0.4 : 1);
        ctx.strokeStyle = pass === 0 ? color : '#ffffff';
        ctx.globalAlpha = pass === 0 ? k * 0.45 : k * 0.9;
        ctx.lineWidth = pass === 0 ? 16 * k + 2 : 5 * k + 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
