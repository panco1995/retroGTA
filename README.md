# retroGTA

[中文](README.zh.md)

A GTA-style prototype built with Three.js. The map is data, the geometry is generated from it.

<p>
  <img src="docs/follow.png" alt="Follow camera on the hill road" width="49%">
  <img src="docs/iso.png" alt="2.5D camera at the same spot" width="49%">
</p>

## Play

**https://panco1995.github.io/retroGTA/** — nothing to install, it runs in the browser.

Every push to `main` publishes. The workflow installs, runs `npm run check`, builds to a single HTML file, and publishes only what comes out; a failing check stops the publish.

## Features

**Driving.** Walk, run, jump, punch, get in from either side, drive and brake. Four cameras: follow, first-person, top-down, 2.5D.

**Cars that follow the ground.** A car sits on its four wheels, not on the ground under its middle: each wheel reads the ground where it is, and the body's pitch and roll come from how the four heights differ. A wheel driven up a kerb lifts that corner alone. Each has spring travel.

**Cars that leave the ground.** A car carries its own vertical speed, so the crest of the hill throws it into the air and it lands with a shove into the springs. A slope is followed, not launched off — what counts as a crest is how sharply the grade changes.

**Ground with a surface.** Height, lean and material in one place. Sand takes grip and top speed away; a pavement is a little slower than the road. Everything asks the same object, so a car and a person always stand on the same answer.

**Collision with a sense of height.** A collider can carry `minY`/`maxY` and is then only in the way of a vehicle whose own range overlaps. The side of a hill is solid without walling off the street at its foot, where the hill is level with the street.

**One physics world.** Everything that falls shares it: people knocked down and furniture thrown by a car. One gravity for the whole game. Anything given to the world falls, lands and hits what is nearby without being registered anywhere.

**Knocked-down people really fall.** Each joint becomes a rigid body, the seams become constraints, and the pose it lands in is kept for the get up.

**Pedestrians.** Hand-placed walkers from the map, plus a streamed crowd of 12 kinds that walks the sidewalk network, waits at curbs, dodges cars, chats and idles. They do not walk through each other or through parked cars.

**Ambient traffic.** Cars drive right-hand lanes around city blocks, follow each other, and can be carjacked. Every traffic car carries a driver you can see inside.

**Street furniture that reacts.** A car throws the rubbish bags and the hydrant, shoves the skip, and knocks the lamp post over — it falls about its foot, lands across the road and sparks from its live cable. A tree is taller than a car and does not come down.

**Also.** Momentum in car crashes. Radar minimap and a full-island map (M). A HUD that stays out of the way: a speed reading, a toast for what just happened, and nothing that names a key. Main and pause menus with shared settings: language, camera, rebindable keys. Collection gallery of every vehicle, pedestrian, street prop and building. Cheats. English and Chinese.

## Run

Node.js 18 or newer.

```bash
npm install
npm run dev      # http://127.0.0.1:5173/
```

```bash
npm run check        # the checks, ~2 s
npm run build        # writes dist/
npm run build:single # one file, dist/retrogta.html
npm run preview      # serves the build
```

## Controls

Start from the main menu. Follow and first-person turn with the mouse; the first-person camera works on foot and behind the wheel, and follows the car's heading. `Esc` pauses, `Esc` again resumes, then click to recapture the mouse. Top-down and 2.5D are fixed, and the movement keys go by the screen.

Keys are rebindable in **Settings → Controls → Keyboard**: click an action, press the new key. `Esc` always pauses.

| Key | On foot | Driving |
| --- | --- | --- |
| W A S D | Move relative to the camera | Throttle, brake / reverse, steer |
| Shift | Run | — |
| V | Cycle cameras | Cycle cameras |
| M | Full-island map | Full-island map |
| E | Get in, from the near side | Get out when slow |
| Space | Jump | Brake |
| Left mouse | Punch | — |
| Esc | Pause | Pause |

The radar shows the area around the player, rotating with heading, and widens with speed. The arrow is the player, the cyan dot the safehouse, white dots are parked cars; moving traffic and pedestrians are not shown. The pause map shows the whole island, north up.

### On a phone

Open the site on a phone and tap **Start**; the page goes fullscreen and asks for landscape. A device that will not turn shows a prompt until it is rotated, and the game holds still behind it. The pad changes shape with what the player is doing, and is laid out for two thumbs:

On foot:

- **Left stick** — walk, and push it all the way to run.
- **Drag anywhere else** — look around, in the same views where the mouse would.
- **Attack**, **jump** and **get in** sit under the right thumb; the two smaller keys above them cycle the camera and open the map.

Behind the wheel, the stick goes and the left thumb gets two arrows instead, because a car only keeps what the wheel is doing:

- **‹ ›** — steer left and right, held for as long as the turn lasts.
- **Gas** — the big key where the punch was; hold it to accelerate.
- **Brake** — the pedal in the middle row. It is the S key: hold it while rolling and it brakes, keep holding and the car backs up.
- **Exit** gets out when the car is slow enough.

**II** in the top right corner pauses, in either mode.

**Settings → Controls → Touch → Virtual pad → Hidden** hides the keys for a clean screen; the look drag and the pause key stay. The setting is remembered.

## Collection

A full-screen gallery from the main menu or the pause menu, in four tabs: **Vehicles** (all 12), **People** (all 12 kinds), **Street props** (lamp, hydrant, rubbish bags, tree, skip) and **Buildings** (eight types). Each sits on a turntable: drag to rotate, scroll (or pinch on a phone) to zoom, arrow keys to step through.

Vehicles also offer an **Interior view** that puts the camera in the driver's seat with the windshield hidden. Cars with a driver have a **Driver NPC** toggle.

## Map data

Y is up, +X is east, +Z is south. The island is [`data/saint-marks.json`](data/saint-marks.json); `src/city.js` reads it and builds the meshes.

| Key | What it is |
| --- | --- |
| `roads` | The orthogonal grid. Pavements, crossings, lamps and the lane loops follow from it |
| `blocks` | `residential` puts row houses on the north and south of a block, `industrial` puts two warehouses, `alley` puts skips in the middle |
| `rows` | Hand-placed rows of houses: width, floors, wall colour, shopfront, awning, fire escape, roof tank |
| `safehouse`, `stores`, `landmarks` | The safehouse, convenience stores, and the hospital and police station |
| `hill` | The climb outside the safehouse, with its `features`: the pieces of ground it is made of |
| `island`, `beach`, `landing` | Coast, beach, and the far landing of the bridge |
| `diagonals` | A road at any angle |
| `bridge`, `water`, `gate` | The bridge, the sea, and the gate with its approach |
| `trees`, `safehouseProps` | Trees, and the hydrant and rubbish bags by the safehouse |
| `vehicles`, `pedestrians` | 12 vehicle types and the hand-placed walkers |
| `bounds` | Extra collision walls; not used by this map |

Positions are absolute `x` / `z`, relative to the safehouse door as `dx` / `dz`, or a `lane` name. Headings are in degrees.

### Terrain

The ground is a list of pieces the map declares in `hill.features`:

```json
{ "kind": "ramp", "axis": "z", "from": -7, "to": -41,
  "cross": [-120.2, -99.8], "y": [0, 5.2], "ease": 8 }
{ "kind": "flat", "rect": [-120.2, -55, -99.8, -41], "y": 5.2 }
```

A piece answers how high it is and draws itself from the same numbers, so the ground that is drawn and the ground that is stood on cannot drift apart. A `ramp` eases the grade in and out of each end, so a climb meets the flat street without a fold. Reshaping the ground, or adding a second hill, is a change to the map and not to the code.

### Vehicles

| `type` | | |
| --- | --- | --- |
| `sedan` | Sedan | Four-door, the default; the car the player starts next to |
| `taxi` | Taxi | Sedan body with a roof sign |
| `hatchback` | Hatchback | Short body, liftback tailgate |
| `suv` | SUV | Tall body, roof rails, larger wheels |
| `pickup` | Pickup | Separate cab and open bed |
| `sports` | Sports car | Low body, fastback glass, rear wing |
| `van` | Van | Tall enclosed cargo body |
| `bus` | City bus | 10.6 m body, long side windows |
| `truck` | Box truck | Cab-over cab, cargo box, dual rear wheels |
| `ambulance` | Ambulance | White box, red stripe, red cross, light bar |
| `firetruck` | Fire truck | Equipment box, roof ladder, light bar, six wheels |
| `police` | Police car | Blue-and-white livery, red/blue light bar |

Every vehicle has clear glass and a lined cabin; the box-bodied ones get there by cutting real holes in the panels. To add a type, write a builder in `src/vehicle.js`, register it in `BUILDERS`, and set the `type` on a vehicle in the map.

### Pedestrians

`src/npc.js` picks from `KINDS` by `weight`; each spawn randomises height, build, skin, hair and outfit.

| | | |
| --- | --- | --- |
| `businessman` | Businessman | Suit, tie, briefcase |
| `businesswoman` | Businesswoman | Blazer, skirt, handbag |
| `student` | Student | Hoodie, jeans, backpack, headphones |
| `schoolkid` | Schoolkid | Short, bright backpack, walks fast |
| `tourist` | Tourist | Floral shirt, sun hat, camera bag, walks slow |
| `jogger` | Jogger | Sleeveless, shorts, headphones, fastest |
| `constructionWorker` | Construction worker | Heavy build, hi-vis vest, hard hat |
| `elderly` | Elderly | Stooped, grey hair, cane, slowest |
| `courier` | Courier | Uniform, cap, large bag |
| `shopper` | Shopper | Casual, shopping bags |
| `policeOfficer` | Police officer | Navy uniform, cap, belt; rare |
| `punk` | Punk | Dyed hair, beanie, dark clothes |

The crowd reacts to traffic: it waits at the curb, hurries across when a car appears, and dodges a car that mounts the pavement. People and parked cars are solid to each other. Two walkers meeting sometimes stop to talk.

## Ambient traffic

`src/city.js` derives a clockwise lane loop around each block whose four sides are unbroken road. Cars drive the right-hand lane, so neighbouring blocks give two-way traffic. They slow for corners and follow the car ahead, but do not stop for people. They spawn and despawn only off camera, and can be carjacked.

## Layout

| File | |
| --- | --- |
| `src/main.js` | Entry point |
| `src/game.js` | Loop, cameras, walking and driving, HUD |
| `src/city.js` | Roads, pavements, colliders, lane and sidewalk networks, buildings |
| `src/landform.js` | The pieces of ground: a ramp, a flat shelf, a slope through four corners. Each answers its height and draws itself |
| `src/terrain.js` | Height, lean and material; how a car sits on its wheels |
| `src/collision.js` | Circle and rectangle collision, the walkable region, height-aware colliders |
| `src/spatial.js` | Spatial index: static colliders in a grid, moving ones on a list always checked |
| `src/physics.js` | The one physics world, the one gravity, the collision groups |
| `src/prop-physics.js` | Street furniture thrown by a car: how it flies, lands, blocks the road it lands on |
| `src/ragdoll.js` | A knocked-down person: every joint a body, the seams constraints |
| `src/shocks.js` | Sparks from a lamp post that has been knocked down |
| `src/vehicle.js` | The 12 vehicle builders, driving state, wheels and suspension |
| `src/actor.js` | The person model: joints merged per material, walk, seated and down poses |
| `src/npc.js` | Pedestrian kinds, the sidewalk graph, the streamed crowd |
| `src/traffic.js` | Block lane loops, ambient traffic, car following |
| `src/building.js` | The shared building builder, also used by the collection gallery |
| `src/props.js` | Street furniture; the city and the gallery share one model per prop |
| `src/collection.js` | The collection gallery: catalogue, turntable camera, interior view |
| `src/menu.js` | Menu navigation and the shared settings page |
| `src/minimap.js` | Radar and the full-island map |
| `src/blood.js` | Blood left on the ground |
| `src/materials.js` | Brick and sign textures drawn on a canvas |
| `src/i18n.js` | English and Chinese strings |
| `src/bindings.js` | Key bindings, saved in the browser |
| `src/input.js` | Keyboard and pointer lock |
| `src/style.css` | HUD and menu styles |
| `index.html` | Page structure and HUD |
| `data/saint-marks.json` | The map |
| `scripts/*-check.mjs` | The checks behind `npm run check` |
