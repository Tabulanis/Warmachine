# War Machine — running handoff

Kept current so work can resume from any fresh session. Updated with every
commit. Last updated: 2026-10-09.

## What this is

A browser game: Fruit Ninja meets Beat Saber, Castlevania flavoured. A
night assault on a castle: skeletons, armoured knights, bats and cursed
skulls come down a moonlit road in time with a synthesised gothic beat; the
player swipes to cut them in half with a sword, morning star or whip, and
advances through the castle gates, great hall and throne room. Three.js,
plain JavaScript, no server, no build step: index.html runs from a
double-click.

## Current state

- Second version, the medieval rework, is in and playable: level with 6
  stages (3 travel, 3 fight), 4 enemy types, 3 weapons, stage banners,
  progress bar, blade trail overlay, victory screen. Verified in headless
  Chromium with no console errors: road -> gate fight cleared -> courtyard.
- Owner's pitch for this version (2026-10-09): "Middle Ages, Castlevania
  vibe; different weapons like a morning star and swords; it moves forward
  as you go: castle gates, big fight, move forward a bit, you can even move
  forward while it's going; Fruit Ninja stuff to kill things."
- Owner's follow-up (2026-10-09): "like Fruit Ninja in a haunted house,
  bit by bit; soundtrack 80 to 100 BPM; a perfect strike always happens on
  a beat, and every strike that happens on a beat gets the whole PERFECT
  and a better score." Done: tempos are 80/90/100; PERFECT is judged
  against the beat grid (within PERFECT_WINDOW of any quarter-note beat),
  not against the enemy's arrival; the GREAT tier is gone; the level is 8
  shorter stages including a crypt.
- Owner's deployment rule (2026-10-09): no server, as simple as possible
  to deploy, this will go out on phones. Done: no ES modules anywhere.
  Three.js is bundled once (esbuild, IIFE, global THREE) into
  vendor/three.js and committed; the four game files are plain scripts
  loaded in order by index.html. Verified from a file:// URL. `node
  pack.js` inlines everything into dist/war-machine.html (gitignored) for
  single-file sharing; that file is what to wrap (Capacitor or similar)
  when it goes to app stores. The README's old "serve over HTTP" step is
  gone.
- Owner (2026-10-09): "we want to secure it somehow ... a compressed or
  encrypted file, like a WAD for the old Doom games, because we don't want
  people getting in and monkeying with it." Done: `node pack.js` now
  produces the WAD build (see Ship it below). The limit was stated to the
  owner: the loader carries the key, so this deters casual editing and
  detects tampering (authenticated encryption), it does not hide the game
  from a determined person. Real paid-access protection is the app stores;
  trusted scores/unlocks would need a small server. Neither built.
- Owner (2026-10-09): "make a fake little browser of our own to run the
  game" -> "go ahead, set it all up." Done: two app shells around the WAD
  build. Capacitor (android/ and ios/ generated with cap 7.6.9 and
  committed; capacitor.config.json; root package.json scripts) and
  Electron (desktop/main.js + package.json with electron-builder config).
  The Electron shell was smoke-tested in the cloud container under Xvfb
  (`WM_SMOKE=1 electron . --no-sandbox`: the packed game reached the menu,
  THREE r186 loaded). The phone builds have NOT been run: the container
  has no Android SDK and no Xcode. The owner builds those on their
  machine (see README "App shells"). First thing to check there:
  `npm run android` opens Android Studio and the app runs on a device.
- The first version (neon tunnel, drones/missiles/mines) is commit d420b82
  if anything from it is ever wanted back.
- On GitHub: https://github.com/Tabulanis/Warmachine (public), branch
  `main`. This is the source of truth. Start new sessions with this repo
  selected.
- Cloud-session note: the Claude GitHub integration cannot create repos
  (403), the owner created this one by hand. In the original session the
  working clone was `/home/user/warmachine`; `/home/user/war-machine` was
  the pre-push local repo and can be ignored.
- An early copy of the game also sits on the Hackbeat repo branch
  `ccr-a44f2736-oqxxet` under `war-machine/`. It is stale. Owner's rule:
  do not modify Hackbeat in any way.

## Decisions made (owner's)

- Separate repo, nothing to do with Hackbeat. Hackbeat was only the
  starting folder because no other existed.
- Three.js for everything. Plain JavaScript ("Java" in the transcript
  meant JavaScript). Keep it super simple: no bundler, no npm, no
  framework.
- Three.js v0.186.1 (MIT) is vendored as `vendor/three.js`, a classic
  script built with `npx esbuild three.module.js --bundle --format=iife
  --global-name=THREE --minify`. No CDN (they were unreachable from the
  cloud container anyway; the npm registry was reachable).

## Run it

Double-click `index.html`. A static server also works but is not needed.

## Ship it (the WAD build)

`node pack.js` writes `dist/war-machine.html` (gitignored), ~275 KB, the
only thing to distribute or wrap for phones. How it is made, all in
pack.js with no dependencies (Node 18+):
- Container: "WMWAD" + version u8 + count u32, then a directory of
  (nameLen u16, name, offset u32, size u32), then the data. Entries in
  load order: index.html (the page body only), styles.css, vendor/three.js,
  src/beat.js, src/input.js, src/game.js, src/main.js.
- gzip level 9, then AES-256-GCM with a random 12-byte IV; key =
  SHA-256(WM_KEY env var, default 'war-machine:a-night-at-the-castle').
  Output = IV + ciphertext + 16-byte auth tag, base64 in a
  <script type="application/octet-stream"> tag.
- Loader (inline in the same HTML): base64 -> WebCrypto AES-GCM decrypt
  (the raw key is embedded in the loader as base64) -> DecompressionStream
  gzip -> parse directory -> .html becomes document.body, .css becomes a
  <style>, .js becomes a <script> appended in order (synchronous
  execution, so load order is preserved). Any failure shows "This copy of
  War Machine is damaged or has been altered and will not run."
- Browser needs: WebCrypto + DecompressionStream (Chrome 80+, Safari
  16.4+, Firefox 113+). Both tested from file:// in headless Chromium,
  including a one-byte tamper test that correctly refuses to run.
- `node pack.js --plain` makes the old inlined plain-text single file for
  debugging. If a shipped build misbehaves, build --plain first.
- pack.js also writes dist/www/index.html (identical). That folder is
  Capacitor's webDir and what desktop/main.js loads; electron-builder
  copies it into the app as a resource.

## App shells

- Capacitor: `npm install` once, then `npm run android` / `npm run ios`
  (= pack, cap sync, cap open). android/ and ios/ are Capacitor's
  generated projects, committed as Capacitor recommends; they carry their
  own .gitignore for build output. cap sync copies dist/www into
  android/app/src/main/assets/public and ios/App/App/public (both
  gitignored by the templates). App id com.tabulanis.warmachine.
  webContentsDebuggingEnabled is false so the Android WebView is not
  inspectable; iOS release builds are not inspectable by default.
- Electron: desktop/main.js is the whole shell. devTools false,
  contextIsolation, sandbox, no menu, window.open denied, navigation
  blocked, browser shortcuts swallowed, F11 fullscreen. `WM_SMOKE=1`
  makes it print whether the game booted and quit (used for automated
  checks; on Linux as root add --no-sandbox). In dev it loads
  ../dist/www/index.html; packaged, it loads www/index.html from
  process.resourcesPath (extraResources in desktop/package.json).
- No native icons or splash screens yet: both shells use the Capacitor /
  Electron defaults. Add with @capacitor/assets when there is artwork.

## Layout

```
index.html      page, HUD and menus (plain DOM); loads the scripts in order
styles.css
src/beat.js     Web Audio metronome + synth drums/bass/arp + sfx; the clock
src/input.js    pointer tracking -> swipe segments
src/game.js     Three.js scene, level, enemies, weapons, slicing, scoring
src/main.js     boots the game, exposes window.warMachine for debugging
vendor/three.js Three.js as one classic script (global THREE)
pack.js         optional single-file packer -> dist/war-machine.html
```

Script order matters (three, beat, input, game, main): top-level classes
in classic scripts share one global lexical scope, so BeatClock and Input
are visible to game.js without imports. Do not reintroduce `import` or
`export`; that breaks file:// loading.

## How the core works (so you don't have to re-derive it)

- `beat.js` schedules kick/snare/hat plus a bass line and arpeggio over a
  4-bar Am-F-G-E progression on the AudioContext clock. `now()` is seconds
  since the first beat. Enemies get an `arrive` time on a 16th-note tick;
  their distance each frame is computed from the clock, not integrated, so
  they stay locked to the music.
- Level: `STAGES` in `game.js`, 8 stages: road, gates (fight), courtyard,
  great hall door (fight), hall, crypt stairs (fight), crypt, throne room
  (fight). Travel stages have a `theme` (road, courtyard, hall, crypt) and
  `length`; the camera walks forward at TRAVEL_SPEED and lighter waves
  spawn (`density`). Fight stages have a `landmark` (gate, hall, crypt,
  throne) built LANDMARK_AHEAD units past the boundary and a `kills`
  target; the camera holds until stageKills reaches it. Each stage has a
  `level` into the LEVELS spawn table. After the last stage: victory
  overlay ("THE CASTLE FALLS").
- World coordinates: distance d along the level is world z = -d. Camera
  sits at z = CAMERA_BACK - progress; the strike line is CAMERA_BACK in
  front of it. Enemies store zRel (relative to the strike line) and are
  placed at strike + zRel each frame, so they always approach the player
  whether or not the camera is moving. Scenery is built once at start.
- Enemies (`ENEMIES`): skeleton (any cut), knight (armored: cut must be
  within DIR_TOLERANCE of its arrow unless the weapon has `armor`), bat
  (fast: 2.5 beats approach), skull (cursed: cutting it costs a life).
  Each is a Group of primitives from buildEnemy(); named parts are
  animated in animateEnemy().
- Weapons (`WEAPONS`): reach multiplies the hit radius; cooldown gates
  hits (weaponReadyAt on the beat clock); armor ignores the knight arrow;
  mult scales points; style 'slice' spawns halves, 'smash' (morning star)
  kills every enemy within `aoe` x projected radius of the hit, skulls
  included, and shakes the camera.
- Timing (owner's rule): a strike within PERFECT_WINDOW (0.09 s) of ANY
  quarter-note beat is PERFECT (2x points) regardless of where the enemy
  is; everything else is a plain CUT/SMASH (1x). Judged in kill() from
  `now / beatLen`. Combo adds +1 multiplier every 8 hits, max 4x.
- Halves: the swipe direction and view direction define a world-space cut
  plane. Two clones get a clipping plane each
  (`renderer.localClippingEnabled`), fly apart along the normal and spin
  about it. The plane is re-anchored to each piece's centre every frame.
- Blade trail: drawn on the 2D `#fx` canvas over the WebGL canvas, in the
  weapon's colour, dimmed while the weapon is on cooldown.
- Materials are MeshLambert on purpose: with 5 point lights (torches) the
  PBR material was fill-rate heavy. Point lights are capped at
  MAX_POINT_LIGHTS; later torches only glow.

## Tuning knobs (all at the top of src/game.js)

`Z_SPAWN`, `Z_MISS`, `LANE_Y`, `PERFECT_WINDOW`, `DIR_TOLERANCE`,
`SCALE`, `TRAVEL_SPEED`, `MAX_POINT_LIGHTS`, the
`ENEMIES`, `WEAPONS`, `LEVELS` and `STAGES` tables, and the tempo buttons
in `index.html` (`data-bpm`).

## Testing

A Playwright script was used in the cloud session (not committed): load
the page, click a tempo button, wait ~1 s for the count-in, then read
`window.warMachine.enemies` (those with zRel between -10 and 5), project
them with `warMachine.project(e)`, and drive `page.mouse` across each one
(along `e.dir` for knights). Keys 1/2/3 switch weapons. Use a 640x360
viewport: headless SwiftShader manages ~25 fps there but only ~5 fps at
720p, and since enemies run on the audio clock a slow renderer just gets
you killed. To eyeball a later stage: `g.progress = g.totalLength;
g.enterStage(5)`. With nothing cut the run ends in a few seconds from
three misses, so start swiping right after the count-in. To test PERFECT,
wait for `(1 - g.beat.beatPhase()) * g.beat.beatLen` before swiping.

## Next ideas (not started, owner has not prioritised)

- A boss in the throne room (the throne is built, nobody sits on it).
- More weapons: axe, holy water, throwing daggers.
- Real songs: beat-detect an audio file and spawn from it.
- Charted levels instead of the procedural ramp.
- Bloom post-processing for proper torchlight.
- Difficulty tuning after real play: TRAVEL_SPEED, kill counts, bat speed.
