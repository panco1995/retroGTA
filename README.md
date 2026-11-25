# retroGTA

[中文](README.zh.md)

A GTA-like game prototype built with Three.js. Geometry is generated in code. The playable area is the east island.

## Implemented

- Walk, run, enter a car, drive, brake, and exit
- Three cameras: follow, top-down, and 2.5D
- Safehouse: a light three-story building with a stoop, door light, and ground ring, at the foot of the riverside avenue
- The slope outside the safehouse, ending at a small raised intersection
- Row houses and warehouses: brick walls, windows, awnings, signs, fire escapes, and roof tanks
- Coast, beach, a diagonal road on the east shore, a bridge to the west, and a landing
- An elevated track over the water on the west side, and a gate on the south edge
- Three pedestrians walking the sidewalks
- One driveable sedan, plus parked taxis, vans, and other cars
- Building collision; people and cars follow the road height
- Movement limited to the island, the bridge deck, and the landing
- Minimap showing the safehouse, vehicles, and the player's heading

## Languages

The settings button at the top right switches the interface. The choice is saved in the browser.

- English (`en`) — default
- Chinese (`zh`)

## Run

Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal (default `http://127.0.0.1:5173/`).

```bash
npm run build    # writes dist/
npm run preview  # serves the build
```

## Controls

Click the picture to start. In the follow camera, the mouse turns the view. Press Esc to release the pointer, then click again to lock it. The top-down and 2.5D cameras stay fixed, and WASD moves relative to the screen.

| Key | On foot | Driving |
| --- | --- | --- |
| W A S D | Move relative to the camera | Throttle, brake / reverse, steer |
| Shift | Run | — |
| Mouse | Turn the follow camera | Turn the follow camera |
| V | Cycle follow, top-down, and 2.5D | Cycle follow, top-down, and 2.5D |
| E | Enter the dark sedan when close | Exit when moving slowly |
| Space | — | Brake |

The minimap is at the bottom left: the light block is the safehouse, the yellow dot is the driveable car. While driving, speed is shown at the top right in km/h. Reverse speed is negative.

## Map data

Y is up, +X is east, and +Z is south. The island lives in [`data/saint-marks.json`](data/saint-marks.json). `src/city.js` reads that file and builds the meshes. People and cars follow the surface height, and they can stand only on the island, the bridge deck, or the landing. The safehouse sits at the foot of the riverside avenue on the west side, with its door facing west toward the slope.

| Field | Role |
| --- | --- |
| `roads` | Intersection centerlines. `blocks` use `col` / `row` for the block between two roads |
| `rows` | A hand-placed row of houses, such as `safe-row`. Walls and windows are still built in `src/city.js` |
| `hill` | The slope and small intersection outside the safehouse |
| `island` | Coast polygon |
| `beach` | Sand |
| `diagonals` | Diagonal roads |
| `bridge`, `landing` | Bridge and far landing |

A position can be an absolute `x` / `z`, an offset from the safehouse door (`dx` / `dz`), or a `lane` (`curbNorth`, `pedSouth`, `sidewalkWest`, and so on). Vehicle and pedestrian `heading` values are degrees.

## Layout

| File | Role |
| --- | --- |
| `src/main.js` | Entry point |
| `src/game.js` | Loop, cameras, walking and driving, HUD |
| `src/city.js` | Reads the map and builds roads, buildings, the elevated track, and colliders |
| `src/config.js` | Metrics exported from the map file, plus a stable hash |
| `src/actor.js` | Low-poly people, walk cycle, and the seated pose |
| `src/vehicle.js` | Sedan, taxi, and van |
| `src/collision.js` | Circle collision on the ground, plus the walkable island and bridge |
| `src/materials.js` | Brick and sign textures drawn on a canvas |
| `src/i18n.js` | English and Chinese interface strings |
| `src/input.js` | Keyboard and pointer lock |
| `src/minimap.js` | Minimap |
| `src/style.css` | HUD styles |
| `data/saint-marks.json` | Map: roads, blocks, landmarks, vehicles, and pedestrians |
