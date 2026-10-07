# War Machine — running handoff

Kept current so work can resume from any fresh session. Updated with every
commit. Last updated: 2026-10-07.

## What this is

A browser game: Fruit Ninja meets Beat Saber. Drones, missiles and mines
fly down a neon tunnel in time with a synthesised beat; the player swipes
to slice them in half. Three.js, plain JavaScript, no build step.

## Current state

- Fully playable first version. Menu, three tempos, gameplay, pause,
  game over, saved best score. Verified in headless Chromium with no
  console errors.
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
- Three.js is vendored (`vendor/three.module.js` + `three.core.js`,
  v0.186.1, MIT) so the game runs offline. The jsDelivr/unpkg CDNs were
  unreachable from the cloud container; npm registry was reachable.

## Run it

```bash
cd war-machine
python3 -m http.server 8300     # any static server works
# open http://localhost:8300
```

## Layout

```
index.html      page, HUD and menus (plain DOM)
styles.css
src/main.js     boots the game, exposes window.warMachine for debugging
src/game.js     Three.js scene, spawning, slicing, scoring, menus
src/beat.js     Web Audio metronome + synth drums + sfx; the game clock
src/input.js    pointer tracking -> swipe segments
vendor/         Three.js
```

## How the core works (so you don't have to re-derive it)

- `beat.js` schedules kick/snare/hat on the AudioContext clock. `now()`
  is seconds since the first beat. Targets get an `arrive` time on a
  16th-note tick; their z position each frame is computed from the clock,
  not integrated, so they stay locked to the music.
- Targets spawn at z=-55 and cross the beat line at z=0 four beats later.
  Past z=9 a drone/missile counts as missed (one life). Three lives.
- Slicing: every pointer move while held becomes a segment. Each target is
  projected to screen space; a segment within the projected radius is a
  hit. Missiles also require the swipe angle to be within ~50 degrees of
  their arrow. Mines: slicing one costs a life.
- Timing: within 0.09 s of the arrive time = PERFECT (2x), within 0.2 s =
  GREAT (1.5x). Combo adds +1 multiplier every 8 hits, max 4x.
- Halves: the swipe direction and view direction define a world-space cut
  plane. Two clones of the target get a clipping plane each
  (`renderer.localClippingEnabled`), fly apart along the normal and spin
  about it. The plane is re-anchored to each piece's centre every frame.
- Difficulty: `LEVELS` table in `game.js`, one level per 4 bars.

## Tuning knobs (all at the top of src/game.js)

`Z_SPAWN`, `Z_MISS`, `APPROACH_BEATS`, `LANE_Y`, `PERFECT_WINDOW`,
`GREAT_WINDOW`, `DIR_TOLERANCE`, `TARGET_SCALE`, `LEVELS`, and the
tempo buttons in `index.html` (`data-bpm`).

## Testing

A Playwright script was used in the cloud session (not committed): load
the page, click SOLDIER, wait ~1.2 s for the count-in, then read
`window.warMachine.targets`, project them with
`warMachine.projectTarget(t)`, and drive `page.mouse` across each one.
Score, halves, pause (`p` key), game over and localStorage best were all
checked. Note: with nothing sliced the run ends in ~4 s from three misses,
so start swiping right after the count-in.

## Next ideas (not started, owner has not prioritised)

- Real songs: beat-detect an audio file and spawn from it.
- Charted levels instead of the procedural ramp.
- Bloom post-processing for proper neon.
- Two-colour targets for left/right hand on touch screens.
