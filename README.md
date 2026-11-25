# retroGTA

[中文](README.zh.md)

A GTA-like game prototype built with Three.js. Geometry is generated in code. The playable area is the east island.

## Screenshots

Follow camera and the fixed 2.5D camera, on the street outside the safehouse.

<p>
  <img src="docs/follow.png" alt="Follow camera outside the safehouse" width="49%">
  <img src="docs/iso.png" alt="2.5D camera outside the safehouse" width="49%">
</p>

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
- Main menu: Start, Settings, and About
- Pause with Esc: switch language, restart, or exit to the main menu

## Languages

Settings on the main menu, and Language on the pause menu, switch the interface. The choice is saved in the browser.

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

Choose Start on the main menu. In the follow camera, the mouse turns the view. Press Esc to pause. Esc again resumes, then click the picture to lock the pointer. The top-down and 2.5D cameras stay fixed, and WASD moves relative to the screen.

| Key | On foot | Driving |
| --- | --- | --- |
| W A S D | Move relative to the camera | Throttle, brake / reverse, steer |
| Shift | Run | — |
| Mouse | Turn the follow camera | Turn the follow camera |
| V | Cycle follow, top-down, and 2.5D | Cycle follow, top-down, and 2.5D |
| E | Enter the dark sedan when close | Exit when moving slowly |
| Space | — | Brake |
| Esc | Pause. Language, restart, or exit | Pause. Language, restart, or exit |

The minimap is at the bottom left: the light block is the safehouse, the yellow dot is the driveable car. While driving, speed is shown at the top right in km/h. Reverse speed is negative.

## Map data

Y is up, +X is east, and +Z is south. The island lives in [`data/saint-marks.json`](data/saint-marks.json). `src/city.js` reads that file and builds the meshes. People and cars follow the surface height, and they can stand only on the island, the bridge deck, or the landing. The safehouse sits at the foot of the riverside avenue on the west side, with its door facing west toward the slope.

| Element | Support |
| --- | --- |
| `roads` | Supported. Orthogonal road grid. Sidewalks, crosswalks, and street lamps are generated along it |
| `blocks` | Supported. `residential` places row houses on the north and south edges. `industrial` places two south-facing warehouses. `alley` adds two dumpsters in the gap |
| `rows` | Supported. A named house row: width, floors, wall color, shop, awning, fire escape, roof tank |
| `safehouse` | Supported. One safehouse; the file includes it |
| `hill` | Supported. The slope and the raised intersection outside the safehouse |
| `island`, `beach`, `landing` | Supported. Coast, sand, and the far side of the bridge |
| `diagonals` | Supported. Diagonal roads |
| `bridge` | Supported. One bridge, deck at road height, with side towers |
| `water` | Supported. One water plane |
| `elevated`, `train` | Supported. An elevated track and a train that shuttles along it |
| `gate` | Supported. One gate and a short approach road |
| `trees` | Supported. Placed trees |
| `safehouseProps` | Supported for `marker`, `hydrant`, and `trash` |
| `vehicles` | Supported for `sedan`, `taxi`, and `van`. `driveable` marks the car the player can enter |
| `pedestrians` | Supported. People who walk a path, with shirt, pants, and an optional cap |
| `bounds` | The reader accepts extra collision walls. The current map leaves this field out |

A position can be an absolute `x` / `z`, an offset from the safehouse door (`dx` / `dz`), or a `lane` (`curbNorth`, `pedSouth`, `sidewalkWest`, and so on). Vehicle and pedestrian `heading` values are degrees.

## Layout

| File | Role |
| --- | --- |
| `src/main.js` | Entry point |
| `src/menu.js` | Main menu: Start, Settings, About |
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
