# The Silo

An immersive 3D portfolio: a twelve-level underground structure you descend by
elevator. Built as a separate app from the main portfolio and deployed to
`/silo/` on GitHub Pages; the conventional site stays at the root.

## Running it

```bash
cd silo
npm install
npm run dev        # http://localhost:5173/silo/
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build into `silo/dist` |
| `npm run preview` | Serve the built output |
| `npm run lint` | oxlint |
| `npx tsc --noEmit` | Type check (strict, no emit) |

The base path is `/silo/`, so the dev server serves the app at `/silo/`, not `/`.

Deployment is handled by `.github/workflows/deploy.yml` at the repo root, which
builds the root site plus each sub-app and copies `silo/dist` to `/silo/`.

## Stack

React 19 · TypeScript · Vite · three.js · React Three Fiber · Drei ·
@react-three/postprocessing · GSAP · Zustand. All geometry *and* every texture
is procedural — the only downloaded asset is the portrait image, so there are
no models or texture files to fetch.

## Layout

```
src/
  content/      portfolio.ts   all real copy and records, typed
                floors.ts      the geometry contract + the twelve level definitions
  state/        useSilo.ts     Zustand store: phase, level, overlays, preferences
  three/        SiloScene.tsx  the Canvas, fog, load gate, active-floor mounting
                Effects.tsx    ambient occlusion, bloom, vignette
                materials.ts   procedural concrete, tread plate and brushed steel
                Structure.tsx  wall, ribs, decks, radial corridors, stair, lamps
                Elevator.tsx   shaft cage, landings, and the car
                Rig.tsx        owns the camera; GSAP tweens a pose object
                Exterior.tsx   the opening approach (mounted only for that phase)
                Atmosphere.tsx dust, travelling lights, level signage
                floors/        per-level fit-out; Level01 is the only one built
  ui/           React overlay: intro, top bar, floor panel, directory, CV viewer
  lib/          capability.ts  WebGL probe for the 2D fallback
```

`content/floors.ts` is the single source of truth for the architecture. Level
height, shaft radius, deck geometry, the camera standing radius and the angular
slots a level's fit-out may occupy are all derived from it, so the stair,
decks, signage and camera stay aligned when any one changes.

## Why it looks the way it does

Reference WebGL portfolios usually *bake* their lighting: shading and occlusion
are rendered offline into textures and displayed with `MeshBasicMaterial`, which
is why they read so crisply. This project lights in real time instead, because
the content is data-driven and the camera goes everywhere, so three things stand
in for baking:

1. **Procedural surfaces** (`materials.ts`). Concrete, tread plate and brushed
   steel are generated at boot as colour, normal and roughness maps from
   deterministic value noise. Untextured `MeshStandardMaterial` under a couple
   of warm point lights has nothing to catch the light and collapses into flat
   brown.
2. **Ambient occlusion** (`Effects.tsx`). Real-time point lights produce no
   contact shading at all, so every surface melts into the next. AO is what
   separates a deck from the wall it meets.
3. **Warm key against cool fill.** The lamps are warm and the ambient is cool,
   so shadows go blue rather than browner. Value and hue separation is most of
   what "crisp" actually means.

Bloom then lets the lamps, signage and void-edge strips behave like light
sources. The whole post stack is dropped on the low quality tier and on devices
`isLowPower()` flags.

## Things worth knowing before you change the geometry

**three.js measures cylinder theta from +Z, this project measures angles from
+X.** `x = r·sin(theta)` versus `x = r·cos(a)`. Passing a project angle straight
into a `CylinderGeometry` puts the feature 90° from where every other placement
expects it. Convert with `toTheta()` from `content/floors.ts`.

**The cutaway sector must stay empty.** One arc of the wall is not built, which
is what makes the structure readable as a section from outside. `inCut()` is the
predicate every generator checks; `contentAngle()` distributes the twelve levels
across the arc that remains so no fit-out is ever placed into the void.

**An `InstancedMesh` whose `count` exceeds its allocated capacity renders
garbage.** The renderer reads past the end of `instanceMatrix` and draws
geometry large enough to fill the screen, which looks exactly like a lighting or
culling failure and is neither. Any loop that writes instances must be counted
against the capacity passed to the constructor.

**Texture tiling must follow the proportions of the surface.** Repeating a
patterned map 4x across a long, short panel stretches the pattern into stripes,
and minifying a high-frequency map on a small face aliases into what looks like
a rendering fault. Both happened here and both cost real debugging time.

**Metalness plus a normal map at a grazing angle shimmers.** Most of this
structure is seen edge-on most of the time, so the roughness floors are kept
high and metalness low; they are architectural surfaces, not mirrors.

**Fit-out parts belong on +Z.** Level components are positioned on the wall and
then `lookAt` the axis, so local +Z points into the shaft. Anything on -Z is
behind the wall and invisible. A solid box spanning an aperture occludes
whatever is behind it — window casings are built from four slabs, never one box.

## Performance

The three.js chunk is 349 kB gzipped, of which about 100 kB is the
post-processing stack; it is lazy-loaded, so it does not affect first paint.

Instanced ribs, treads, posts, corridor members and lamps. Only the current
level and its immediate neighbours mount their fit-out. Two pooled point lights
follow the visitor instead of twelve static sets, and the exterior's lights
unmount with it. Exponential fog means distant levels cost nothing. DPR is
capped at 1.9 with Drei's `AdaptiveDpr` and `PerformanceMonitor` tiering down on
sustained frame drops. The three.js chunk is loaded lazily so the boot screen
and the 2D fallback paint first.

Horizontal field of view is held constant: three.js `fov` is vertical, so on a
tall phone the horizontal view narrows and off-axis content leaves the frame.

## Accessibility and fallbacks

Every level's content is real HTML over the canvas, not WebGL-only. Devices
without WebGL get a 2D route to everything. `prefers-reduced-motion` is honoured
and can be toggled in the top bar. Audio is muted by default and the control is
currently inert — there is no audio yet.

Controls on a deck:

| Input | Action |
| --- | --- |
| Drag on the canvas | Turn to look, with no limit on yaw — you can face any part of the floor |
| <kbd>&larr;</kbd> <kbd>&rarr;</kbd> | Turn |
| <kbd>&uarr;</kbd> <kbd>&darr;</kbd> / Page Up / Page Down | Ride one level |
| <kbd>D</kbd> | Floor directory |
| <kbd>Esc</kbd> | Close overlays, seal the airlock |

Drags that start on an HTML panel are left alone so text stays selectable, and a
drag of more than a few pixels suppresses the click it would otherwise end with,
so turning past the airlock does not open it.

## Status

Level 01 (Monitoring & Identity) is fitted out: the portrait window, the identity
console, service runs and the personnel airlock. Levels 02–12 exist
architecturally and are navigable, but are not yet fitted out; each says so and
links to the standard portfolio.

Not built yet: audio, the recreation mini-game, per-level interiors for 02–12,
and a contact form backend.

Content still needed from the portfolio owner is listed in `MISSING_CONTENT` in
`src/content/portfolio.ts` and surfaced in the CV viewer. Nothing in this app
invents dates, metrics, clients or credentials.
