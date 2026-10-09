# War Machine

Fruit Ninja meets Beat Saber, on a night assault on a castle. Skeletons,
armoured knights, bats and cursed skulls come at you down a moonlit road, in
time with the beat. Swipe to cut them in half. Fight through the gates, the
great hall and the throne room.

Built with [Three.js](https://threejs.org/) and plain JavaScript. No build
step, no npm install, no accounts. One HTML file, four small modules, and a
vendored copy of Three.js.

## Play it

Browsers won't load ES modules from `file://`, so serve the folder over HTTP.
Any static server works. From this folder:

```bash
python3 -m http.server 8300
```

Then open **http://localhost:8300**. Works with a mouse, a trackpad, or a
finger on a phone.

## How it plays

- **You advance through the castle.** Travel stages walk you forward while
  lighter waves attack. Fight stages stop you at a landmark (the castle
  gates, the great hall, the throne room) until you have cut down enough
  enemies, then it's onward.
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
- Every enemy crosses the glowing **strike line** on the road exactly on a
  beat. Cut it within a few frames of that moment for **PERFECT** (2x) or
  **GREAT** (1.5x).
- Letting a skeleton, knight or bat reach you costs a life. Three lives.
- Consecutive hits build a **combo**; every 8 hits raises the score
  multiplier, up to 4x.
- Pick a tempo on the menu: **SQUIRE** 100 BPM, **KNIGHT** 125 BPM,
  **WARLORD** 150 BPM. Faster beat, faster enemies.
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
  three.module.js Three.js (MIT), pinned copy so it works offline
  three.core.js
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
