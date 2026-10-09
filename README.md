# War Machine

Fruit Ninja meets Beat Saber, on a night assault on a castle. Skeletons,
armoured knights, bats and cursed skulls come at you down a moonlit road, in
time with the beat. Swipe to cut them in half. Fight through the gates, the
great hall and the throne room.

Built with [Three.js](https://threejs.org/) and plain JavaScript. No
server, no build step, no npm install, no accounts. Everything runs in the
browser: the game logic, the 3D rendering, and the music (synthesised with
the Web Audio API). Best score is saved in the browser's local storage.

## Play it

Double-click `index.html`. That's it. Works with a mouse, a trackpad, or a
finger on a phone.

## Ship it

The folder is the source. What you ship is one file:

```bash
node pack.js          # writes dist/war-machine.html
```

That builds the **WAD build**: every game file (page, stylesheet, scripts,
Three.js) is packed into a single binary container with a directory, like
Doom's WAD, gzip-compressed, then encrypted with AES-256-GCM and embedded
in a small loader page that unpacks it in memory at startup. About 275 KB.
It opens anywhere a browser does, from a double-click or any static host,
and it's the thing to wrap when the game goes to phones as an app.

Because the encryption is authenticated, a copy that has been edited, even
by one byte, refuses to run and says so instead of behaving strangely.

Set your own key with `WM_KEY="something secret" node pack.js`. Keep in
mind the loader has to carry the key to unpack the game, so this stops
casual poking and detects tampering; it cannot hide the game from someone
determined, and nothing that runs on the player's device can.

`node pack.js --plain` writes the same single file with everything inlined
in plain text, which is handy for debugging a shipped build.

## App shells

The game never runs in a visible browser for players. Two thin shells wrap
the operating system's web engine around the WAD build, with no address
bar, no devtools, no navigation and no new windows. The game code is the
same in both; `node pack.js` is still the only build step for the game.

### Phones (Capacitor): iOS and Android

The native projects live in `android/` and `ios/` and are committed. One
time, on your machine:

```bash
npm install                      # Capacitor CLI and platforms
```

Then, whenever the game changes:

```bash
npm run android                  # pack, sync, open in Android Studio
npm run ios                      # pack, sync, open in Xcode
```

From Android Studio or Xcode you run on a device or build the store
binary the normal way. Android needs Android Studio; iOS needs a Mac with
Xcode and CocoaPods. App id is `com.tabulanis.warmachine`, set in
`capacitor.config.json`. Remote debugging of the WebView is off there.

### Desktop (Electron): Windows, macOS, Linux

```bash
cd desktop
npm install                      # downloads Electron (~100 MB, once)
npm start                        # run the game in its own window
npm run dist                     # installers in desktop/out/
```

`desktop/main.js` is the whole shell: a locked-down window that loads the
packed game. F11 toggles fullscreen. Installers come out about 150 MB
because Chromium is inside them; that's the price of behaving identically
everywhere.

## How it plays

- **You advance through the castle bit by bit.** Travel stages walk you
  forward while lighter waves attack. Fight stages stop you at a landmark
  (the castle gates, the great hall door, the crypt stairs, the throne
  room) until you have cut down enough enemies, then it's onward.
- **Weapons** — switch with keys 1/2/3 or by tapping the icons.
  - **Sword**: clean cut, no cooldown.
  - **Morning Star**: slow, but smashes everything near the point of impact
    and goes straight through armour. Careful near cursed skulls.
  - **Whip**: reaches much further, scores a little less.
- **Enemies**
  - **Skeletons** (bone) — cut them any way you like.
  - **Knights** (steel) — cut *along the glowing weak point* on their
    chest, or just smash them with the morning star. Any other cut clangs
    off and breaks your combo.
  - **Bats** (purple) — fast, small, worth more.
  - **Cursed skulls** (green) — never cut one. It costs a life.
- **Strike on the beat.** Any cut or smash that lands on a beat is
  **PERFECT** and scores double, wherever the enemy is. Enemies cross the
  glowing strike line on the road exactly on a beat, so that's the natural
  moment, but you can also hold off and take an off-beat enemy on the next
  beat.
- Letting a skeleton, knight or bat reach you costs a life. Three lives.
- Consecutive hits build a **combo**; every 8 hits raises the score
  multiplier, up to 4x.
- Pick a tempo on the menu: **SQUIRE** 80 BPM, **KNIGHT** 90 BPM,
  **WARLORD** 100 BPM. Faster beat, faster enemies.
- Press **P** or **Esc** to pause. Best score is saved in the browser.

## Layout

```
index.html        page, HUD, weapon bar and menus (plain DOM)
styles.css
src/
  main.js         boots the game
  game.js         Three.js scene, level, enemies, weapons, slicing, scoring
  beat.js         Web Audio metronome + synth drums/bass/arpeggio + sfx
  input.js        pointer tracking → swipe segments
vendor/
  three.js        Three.js (MIT) as one classic script defining `THREE`
pack.js           builds dist/war-machine.html + dist/www/ (WAD build, or --plain)
package.json      Capacitor CLI + scripts (npm run android / ios / desktop)
capacitor.config.json
android/, ios/    Capacitor native projects (generated, committed)
desktop/          Electron shell: main.js + package.json
```

The scripts are plain (not ES modules) on purpose: browsers refuse to load
modules from `file://`, and plain scripts just work. `index.html` loads
them in order and each file's top-level classes are visible to the next.

`vendor/three.js` is Three.js r186 bundled once with esbuild into a
single script. To upgrade it some day:

```bash
npx esbuild node_modules/three/build/three.module.js --bundle --format=iife \
  --global-name=THREE --minify --outfile=vendor/three.js
```

## How it works

- `beat.js` schedules synthesised drums, a bass line and a harpsichord-ish
  arpeggio a little ahead of time on the audio clock. That clock is the
  game's notion of "now": each enemy gets an *arrive* time on a 16th-note
  tick and its distance each frame is computed straight from the clock, so
  enemies stay glued to the music even when frames hitch.
- The level is a list of stages in `game.js` (`STAGES`). Scenery for every
  stage is built once from primitives along the z axis; the camera walks
  down it during travel stages and holds position during fights. Enemies
  are placed relative to the camera, so they always come at the player.
- `input.js` turns pointer movement into line segments. `game.js` projects
  every enemy to screen space and tests the segments against its projected
  circle (times the weapon's reach), so a fast flick that crosses an enemy
  between two frames still counts.
- A cut builds a world-space plane from the swipe direction and the view
  direction. The two halves are clones of the enemy with a Three.js
  clipping plane each, pushed apart along the plane normal and spun about
  it, so the cut face stays clean while they tumble.

## Ideas for later

- A boss in the throne room.
- Real songs: beat-detect an audio file and drive spawns from it.
- Charted levels instead of the procedural ramp.
- Bloom post-processing for proper torchlight.
- More weapons: axe, holy water, throwing daggers.
