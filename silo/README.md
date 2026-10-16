# The Silo

An immersive 3D portfolio: a twelve-level underground structure you walk in
first person, from a domed head down through twelve decks, by a glass capsule
lift or a spiral stair. Built as a separate app from the main portfolio and
deployed to `/silo/` on GitHub Pages; the conventional site stays at the root.

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
@react-three/postprocessing · @react-three/rapier · GSAP · Zustand. All
geometry, every texture and every sound effect is procedural; the only
downloaded assets are the portrait image and the score, which streams once
sound is on.

## Layout

```
src/
  content/      portfolio.ts   all real copy and records, typed (copied from the
                               standard portfolio's src/data.js)
                records.ts     what each level holds, read by its wall AND its panel
                floors.ts      the geometry contract + the twelve level definitions
                stairs.ts      stair, landings, bridges: read by drawing AND collision
                level1.ts      the level 1 floor plan: rooms, furniture, the vault (same)
                layout.ts      where ribs, lamps and framing go: one grid, every level (same)
                dome.ts        the dome's geometry, its ribs and its vents
  state/        useSilo.ts     Zustand store: phase, level, the lift, overlays, preferences
  three/        SiloScene.tsx  the Canvas, fog, field of view, load gate, active floor
                Lighting.tsx   the shadow-casting sun / work light, fill, environment map
                Dome.tsx       the dome, its vents, and the glass dish on the core
                Effects.tsx    ambient occlusion, bloom, vignette
                materials.ts   procedural concrete, tread plate and brushed steel
                Structure.tsx  wall, ribs, decks, radial framing, lamps
                Water.tsx      the flooded pit under level 12
                Stairway.tsx   flights, landings, bridges and their lantern posts
                Elevator.tsx   the capsule, its shaft rings and the landing doors
                LiftDriver.tsx moves the car: rides with the visitor, and empty calls
                Rig.tsx        the opening camera only; GSAP tweens a pose object
                Exterior.tsx   the opening approach (mounted only for that phase)
                WallDisplay.tsx the curved glass display: the creed, and every
                               level's record
                Atmosphere.tsx dust
                floors/        Level01, Level06 and Level12's fit-out, CreedWall, and
                               RecordWall (each level's record on its display)
                DroneFlight.tsx the drone: its pad, its flight, the race gates
                wasteland.ts   the surface, as the screens show it
                physics/       the body and its colliders (lazy: Rapier is 850 kB)
  ui/           React overlay: intro, top bar, record panel, directory, CV viewer,
                walking HUD, soundscape binding
  lib/          input.ts       keys, mouse and the touch stick
                lift.ts        where the car is, shared without re-rendering
                daylight.ts    the hour outside: one clock for everything that shows it
                audio.ts       the synthesised soundscape
                music.ts       the score: the supplied track, streamed and looped
                jukebox.ts     the gramophone; synthScore.ts, the first score
                chamber.ts, drone.ts, reactor.ts  moving parts shared per frame
                capability.ts  WebGL probe for the 2D fallback
```

`content/floors.ts` is the single source of truth for the architecture. Level
height, shaft radius, deck geometry and the angular slots a level's fit-out may
occupy are all derived from it. Anything a body can touch is generated once, in
`content/`, and read by both the drawing and the physics, so what you see and
what you collide with cannot disagree.

## Why it looks the way it does

Reference WebGL portfolios usually *bake* their lighting into textures. This
project lights in real time instead, because the content is data-driven and the
visitor goes everywhere, so these stand in for baking:

1. **Procedural surfaces** (`materials.ts`). Concrete, tread plate and brushed
   steel are generated at boot as colour, normal and roughness maps from
   deterministic value noise.
2. **Ambient occlusion** (`Effects.tsx`). Point lights produce no contact
   shading, so every surface melts into the next without it.
3. **Warm key against cool fill**, so shadows go blue rather than browner.
4. **One real shadow.** A single directional light casts shadows. On level 1 it
   hangs in the glass dish and is daylight. Below level 1 it drops to just under
   the deck above whichever level the visitor is on, with its shadow camera
   reaching down from there — hung in the dish, it would have eleven decks
   between it and the visitor and everything would be in shadow.
5. **A procedural environment map**, built at boot from three.js's
   `RoomEnvironment` with no download. Without something to reflect, chrome
   renders black and glass is invisible.

Bloom then lets the lamps, signage and lit edges behave like light sources. The
post stack and the shadows are dropped on the low quality tier and on devices
`isLowPower()` flags.

## Things worth knowing before you change the geometry

**three.js measures cylinder theta from +Z, this project measures angles from
+X.** `x = r·sin(theta)` versus `x = r·cos(a)`. Passing a project angle straight
into a `CylinderGeometry` puts the feature 90° from where every other placement
expects it. Convert with `toTheta()` from `content/floors.ts`.

**The cutaway sector must stay empty.** One arc of the wall is not built, which
is what makes the structure readable as a section from outside. `inCut()` is the
predicate every generator checks.

**An `InstancedMesh` whose `count` exceeds its allocated capacity renders
garbage** — geometry large enough to fill the screen, which looks exactly like a
lighting or culling failure and is neither.

**Texture tiling must follow the proportions of the surface**, and **metalness
plus a normal map at a grazing angle shimmers**; most of this structure is seen
edge-on, so roughness stays high on architectural surfaces.

**Nothing drawn at walking height may overlap anything else that is.** Two
surfaces at the same height cannot win the depth test against each other, so
they show through one another in stripes that crawl as you move. The bridge
used to be a box laid over the landing at one end and the deck at the other,
and that was the flickering floor by the lift. It is now cut to fit between
them using their own polygon corners, and the deck, landing and bridge share
one plate material mapped from world position (`planarUV`), so the pattern
runs straight across the joins.

**The wall's structure is on one grid.** Ribs stand on the cladding's vertical
joints (`CLAD_JOINT`, counted from the cut edge), at the same angles on every
level, so they line up as columns down the whole shaft; joists land on every
other rib and lamps sit between them. They used to be spaced from each level's
content angle, which turns a little from level to level, so no rib was ever
under the one above it. The dome is the same: its vents are placed bay by bay
between its ribs -- one, two and three a bay from the top down -- so none sits
on a rib.

**Fit-out parts belong on +Z.** A group rotated by `PI/2 - a + PI` has local +Z
pointing back at the shaft axis, where the visitor stands. A solid box spanning
an aperture occludes whatever is behind it — window casings are built from four
slabs, never one box.

## Performance

The three.js chunk is 349 kB gzipped, of which about 100 kB is the
post-processing stack; it is lazy-loaded, so it does not affect first paint.

Instanced ribs, posts, framing, lamps, vents, furniture and table settings; each
flight of stairs is one mesh. Only the current level and its neighbours mount
their fit-out, and only three decks' worth of colliders exist at once. One
shadow-casting light; four pooled lamps follow the visitor round the promenade
instead of a set per level; the landing lamps' real lights exist only on the
levels next to the visitor. DPR is capped at 1.9, with Drei's `AdaptiveDpr` and
`PerformanceMonitor` tiering down on sustained frame drops.

Horizontal field of view is held constant — 86° on foot, 64° for the opening —
because three.js `fov` is vertical, and on a tall phone the horizontal view
would otherwise narrow until the room left the frame.

## Accessibility and fallbacks

Every level's content is real HTML over the canvas, not WebGL-only: the
**Record** button opens it at any time, and it comes up by itself whenever the
mouse is let go. Every floor is one click away in the **Directory**, which puts
you aboard the lift if you are not standing in it. Devices without WebGL get a
2D route to everything. `prefers-reduced-motion` is honoured and can be toggled
in the top bar. Sound comes on with the first click, tap or key press.

### Sound and the score

Browsers play nothing before a gesture, so sound starts with the visitor's
first click, tap or key press anywhere on the page. **Sound** turns it all off,
and that choice is remembered for the next visit; **Music** turns the score off
and on by itself.

The score is *Subterranean Ritual*, supplied by the site's owner
(`public/audio/subterranean-ritual.mp3`). It is looped very softly
underneath everything else — about −33 dBFS on average against footsteps that
peak near −12 — with its top end rolled off, so every interaction is heard
clearly above it. It streams through an `<audio>` element routed into the Web
Audio graph rather than being decoded whole, and it dips while the lift speaks.

Under the score, a synthesised hum and the movement of air in the shaft follow
the visitor's depth. Every interaction has its own synthesised sound:

- **Footsteps**: a heel strike, the click of a sole on steel and a scuff on the
  decks; a ringing tread on the stair.
- **The lift**: the landing's call button; the car's panel opening and closing;
  the floor chosen; the doors sliding shut and open; the brake letting go and
  catching; the motor while it travels; the arrival chime, then a voice saying
  where you are ("Level 3. Residence, Inspira."). The voice is the browser's
  own speech synthesis, so it is whichever English voice the system provides.
- **The vault**: the lever thrown; the wheel's ratchet, a click at a time; the
  bolts; the hinge groaning only while the door actually moves; a dead stop at
  the end of its swing; a warning buzz when it is held by someone in its way.
- **The vault room**: the terminal waking and sleeping; two hollow knocks and
  the lock's refusal at the sealed door.
- **The interface**: a small tick on every button, and the record panel
  sliding in and out.

## Walking

Walking is the only way round. The opening shot flies in through the cutaway and
ends standing on the level 1 promenade facing the portrait, and from there the
visitor has a body: a 1.8 m capsule, 0.3 m in radius, moved by Rapier's
character controller.

| Input | Action |
| --- | --- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / arrows | Walk |
| <kbd>Shift</kbd> | Run |
| Mouse | Look, once the pointer is taken (click the scene) |
| <kbd>E</kbd> | Use: lift controls, call the lift, open or shut the vault, read the record |
| <kbd>Esc</kbd> | Let go of the mouse; close overlays |
| Touch | Left thumb walks, right thumb looks; the use prompt is a button |

**The camera follows the body, never the other way round.** The body is moved,
the physics decides where it ended up, and the camera is put at the result.
Speed eases in and out exponentially (frame-rate independent), mouse look is
lightly smoothed, and the camera follows autosteps over a few frames so a kerb
reads as a step rather than a jolt.

### The route between floors

Each level has one opening in its ring of handrail. Through it a **bridge**
crosses the void to a **landing** wrapped round the core. The lift doors open
onto the landing's inner edge; the stair arrives and leaves across its two
radial edges.

The stair's pitch is forced by the plan: each level's landing sits at that
level's content angle, so a flight has to sweep the step between two of them
plus a whole turn, which with an 11 m storey gives a 134 mm rise on a 312 mm
going — a real stair. Collision is a smooth ramp under the treads rather than
82 autosteps a flight, which would stutter; the two are never more than 67 mm
apart.

### The lift

The car carries the body. Step in, press <kbd>E</kbd>, pick a floor: the doors
shut, the car travels, the doors open, and you walk out. It does not follow you,
so if you take the stair it stays where you left it; each landing has doors that
are shut whenever the car is not standing there, and <kbd>E</kbd> at them calls
it. Using the directory from across the deck makes the one cut: a short fade
while the car is brought to you and you are put aboard.

- **Riding is latched for the whole journey.** Deciding every frame whether the
  body was still in the car lost the visitor on the first slow frame: the car
  fell further than the tolerance in one step and left the body standing in the
  shaft.
- **The lift and the opening shot run on wall-clock time.** A capped frame delta
  turned a 7 s ride into minutes on a slow device, and a timeline that ran out
  between two frames left the camera frozen 40 m out in the cavern. The rig now
  writes its final pose itself before it hands over.
- **Placement happens in the frame loop.** A position set from an effect is
  silently overwritten if the physics steps after the frame callback.

### Collision

All derived from the same data as the drawing: each deck's floor, a barrier on
the handrail line open only at the bridge, the outer wall closed right round
(including across the cutaway), the ribs, the bridge and its parapets, the
landing and its edge barriers, the car or the shut landing doors, and on level 1
every wall, table, chair, desk and cabinet in the floor plan. Three decks and
the two flights between them exist at once; walking from one level to the next
never rebuilds the ground underfoot.

- **Declare colliders explicitly.** `colliders="trimesh"` on a `<mesh>` skips
  meshes that are `visible={false}`; the first version had no colliders at all
  and the visitor fell 1,800 m without an error.
- **The physics is lazily imported.** Rapier is roughly 851 kB gzipped, more
  than everything else together. It is fetched while the opening plays, and the
  walking prompt says "Starting the physics" until the body exists rather than
  ignoring clicks. Do not add a manual rolldown chunk group for it: both
  attempts left a static import in the entry chunk.

## Level 1

- **Arrival.** The bridge from the lift lands facing the portrait and the
  personnel monitor.
- **The dome.** A concrete dome on the wall head, ringed with louvred vents, with
  a glass dish in its crown on a column that is the top of the lift core. The
  dish, the vents and the light falling into the atrium follow the hour outside,
  which runs a full day every ten minutes from the visitor's own clock
  (`lib/daylight.ts`).
- **Cafeteria.** Two rows of tables either side of a central aisle, a serving
  counter, a ceiling rose of lights, and a long screen showing the surface: a
  scorched plain of rubble, craters and dead trees under an ash sky by day and
  a field of stars by night (`three/wasteland.ts`). It is a picture on a
  screen, painted once on a canvas and mapped onto the glass, so it holds still
  as you walk past; the hour comes from the same clock as the dome.
- **Sheriff's office.** Desks with terminals, filing cabinets, green-tiled
  walls, a timber ceiling, a fan, a clock showing the visitor's real time, a
  fluorescent tube that flickers, and the **records vault**: a round door in a
  deep portal in the back wall. <kbd>E</kbd> spins the wheel, draws the door out
  of its seat and swings it out into the office -- and it will not swing
  through you: stand in its way and it stops, says so, and waits for you to step
  back. Behind it a round tunnel goes through the silo wall, one step up, into
  a room cut into the rock: archive shelving down one side, the terminal with
  the personnel record (<kbd>E</kbd> reads it) on the other, and at the far end
  a second round door, marked sealed, which does not open. <kbd>E</kbd> at the
  open door swings it shut again, as carefully. The door is shared state in
  `lib/vault.ts`, read by the drawing, by a moving collider, and by the body.
- **The creed wall.** A curved display of dark glass set into the wall across
  the atrium from the arrival, on a steel plinth between two lit fins. It
  glows faintly from a distance and wakes as you approach, a scan line
  running down the glass and leaving the text at full brightness. The text is
  the creed from the series, quoted as the portfolio owner supplied it and
  credited on the wall.
- **The level.** Each level's number and name are on its wall display, large,
  where the bridge lands facing it. There used to be a sign on a post at the
  end of each bridge; it stood in front of the display and could not be read
  from the deck.
- **The wall.** The shaft is clad in precast panels — joints, tie-holes and
  ribbed service strips, in a cool grey — with a line of light round every
  level under the structural band.

Under level 12 the shaft is flooded. Still, dark water fills it wall to wall,
lit by lamps sunk round the foot of the core and a ring of wall lamps just above
it, whose reflections are a mirrored copy under the surface seen through it --
no second render of the scene.

Built from the ideas in the reference images, not their assets: no geometry,
texture, logo or sound effect here is copied. The one borrowed thing is the creed's
short text, which is credited where it appears.

## Level 6 — Recreation

Nothing professional is hidden here. Planned in `content/level6.ts`, drawn by
`three/floors/Level06.tsx`.

- **The maze.** A hedge maze across the deck from the promenade to the silo
  wall, cut on a polar grid -- rings out from the atrium, sectors round it -- by
  a seeded depth-first walk, so it is a *perfect* maze: one way through, and
  the same maze on every visit. Hedges are boxes, drawn as they are collided.
  It keeps time from the gap in the first hedge to the cell in front of the
  door, and the best run on this device.
- **The round door.** At the heart of the maze. It stands inside the wall's
  thickness behind a round opening and rolls aside into a pocket in the wall,
  on a track sunk in the floor; it will not roll back across anyone standing in
  the doorway.
- **The chamber.** A round room cut into the rock, dark until someone steps
  in, then lit a section at a time round the room, each with the clack of a
  breaker, the orrery overhead last. Paper birds hang under the dome,
  chalkboards of payoff matrices run round the wall above counters of curios,
  and a brass maze is inlaid in the floor.
- **The music nook.** A cassette closet and a gramophone. A tape plays through
  the gramophone's own chain -- lows and top rolled off, a little crackle --
  louder the nearer you stand, while the silo's score waits. The tapes are
  listed in `content/cassettes.ts`: to add one, put the file in
  `public/audio/tapes/` and add a line. Two for now: *Subterranean Ritual*, and
  *Pentatonic Hall*, the silo's first score, synthesised live.
- **The arcade.** Five cabinets. Four are game theory, one round each and then
  explained: the Prisoner's Dilemma (dominant strategies and a Nash equilibrium
  worse for both), the Ultimatum (subgame perfection against fairness), the
  Stag Hunt (payoff- against risk-dominance) and Guess 2/3 (iterated reasoning
  and level-k thinking). The other player is always the machine, and each game
  says how it chose. The fifth is Maze Run, with the right-hand rule played out.
- **Drone control.** The drone waits on its pad on the promenade. From the
  desk it flies for a minute of battery, its camera the view and the body left
  standing at the desk: freely round the silo, or the shaft race, twelve gates
  spiralling down the void from level 6 to level 10. Where it may fly is worked
  out from the architecture (`content/drone.ts`) rather than the physics world,
  which only holds the decks near the body: straight up and down only in the
  open void, over a deck only between it and the one above, and never into the
  rooms or the maze. Race times go on a board kept on this device -- a static
  site has nowhere to keep anyone else's.

## Level 12 — Deep Core & Contact

Planned in `content/level12.ts`, drawn by `three/floors/Level12.tsx`. Across
the atrium from the bridge, two round openings lead out into the rock.

- **The reactor.** A tunnel to a gallery round the rim of a deep round pit, and
  in it the machine that powers the silo: a burning core in a cage of gimbal
  rings, great rings turning up and down a column fifty metres tall, arcs, a
  beam of light up through its top. A catwalk runs out over the drop to a
  platform with a console, where E runs a surge test. Conduits carry its power
  out of the opening and up the silo wall to the dome, with light running up
  them, and they can be followed down from any level.
- **Communications.** A long room of racks full of status lights, a
  transmitter and a turning dish at the end, a hologram of the name, and on the
  floor beneath the machines a lit plate for each way to get in touch -- email,
  phone, LinkedIn, GitHub, the portfolio -- each taken from the portfolio data.
  E on a plate opens it: a link in a new tab, an email or a call in the
  visitor's own app.

## Where the portfolio is

Everything on the standard portfolio is in the silo, by level. Each level's
record is on a curved display on the wall the bridge lands facing, and in the
**Record** panel; the display shows what can be read standing in front of it,
the panel carries everything, including links and the full SQL.

| Level | What is there |
| --- | --- |
| 01 | Identity: name, headline, tagline, the three figures, bio, links; the personnel record in the vault |
| 02–04 | Cartup, Inspira, ARCED: role, dates, responsibilities, tools |
| 05 | The postings in sequence, the degree, and the soft skills |
| 06 | Nothing yet — no personal interests are on record |
| 07 | The six projects and the two Power BI case studies |
| 08 | The degree and its coursework, and the published op-ed |
| 09 | The four certifications |
| 10 | Every tool, in its six groups |
| 11 | The analytical skills and the SQL showcase, with the queries in the panel |
| 12 | Email, phone, LinkedIn, GitHub, the portfolio, location |

`content/portfolio.ts` copies `src/data.js` word for word; when one changes,
change the other.

## Status

Levels 1, 6 and 12 are fitted out. Levels 2–5 and 7–11 are walkable — deck,
stair, bridge, lift landing — and each carries its record on a wall display;
their own fit-out is still to come.

Verified by walking a body round it in a headless browser with held keys and a
steering loop that only reads the body's real position, never teleporting it:
along the promenade, into the cafeteria to its window, into a table (which
stops it), into the sheriff's office to the vault, over the bridge
into the lift, a ride to level 3 and out onto its deck, down the stair to level
4, against the landing doors over an empty shaft (they hold), calling the car
down and stepping in, and against the rail. The vault is walked separately: the shut door and
the open leaf are solid, the door stops short of a body in its swing and opens
once it steps back, the tunnel leads up into the room, the terminal opens the
record, the far door is sealed and solid, and the door will not shut on anyone
either; and nothing on level 1 stands where the door swings. W, A, S and D are each checked to
move the body the way the camera faces. The audio graph is checked by reading
it — nothing is built before a gesture, the first click turns it on, the score
is the supplied track and is playing, looping and soft, the Music and Sound
controls stop it and the choice is remembered, the lift announces its level
over a dipped score, walking fires footfalls, and each of the lift's and the
vault's sounds is counted as it plays.

Level 6 is walked too: from the lift round to the maze and through it cell by
cell to the door (the clock reports the run and keeps the best), against the
shut door, which stops the body, through the opened door into the chamber,
which is dark until then and lights with a breaker for every section; both
tapes play through the gramophone while the score is held, and eject brings it
back; every cabinet's game is played once and explained, the maze game takes
the keys without moving the body; and the door rolls shut again. The drone is
flown: its flying rules are checked against four thousand random points (none
end up inside a deck, the core or the wall), the keys fly and climb it while
the body stays put, an autopilot using the same controls flies all twelve
gates, the time goes on the board, and landing hands the view and the keys
back to the body. Level 12 is walked: through the reactor's tunnel, along the
catwalk and onto the platform (both hold the body over the pit, and the rails
keep it out), the console runs a surge, and every contact plate in the
communications room is offered, and one is used. Not verified: real GPU hardware, real phones and
touch, and how the audio sounds.

Not built yet: interiors for levels 2–5 and 7–11, a race board shared between
visitors (it needs somewhere to keep the times), and a contact form backend.

Content still needed from the portfolio owner is listed in `MISSING_CONTENT` in
`src/content/portfolio.ts` and surfaced in the CV viewer. Nothing in this app
invents dates, metrics, clients or credentials.
