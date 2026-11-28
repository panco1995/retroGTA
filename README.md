# retroGTA

[中文](README.zh.md)

A GTA-like game prototype built with Three.js. The map lives in a JSON file and the geometry is generated in code. The playable area is the east island.

## Screenshots

Follow camera and the fixed 2.5D camera, on the street outside the safehouse.

<p>
  <img src="docs/follow.png" alt="Follow camera outside the safehouse" width="49%">
  <img src="docs/iso.png" alt="2.5D camera outside the safehouse" width="49%">
</p>

## Features

- Walk, run, jump, throw a punch, enter a vehicle from either side, drive, and brake
- Four cameras: follow, first-person, top-down, and 2.5D
- Pedestrians: hand-placed walkers from the map, plus a streamed crowd of 12 kinds that walks the sidewalk network, waits for traffic, dodges cars, chats, and idles. People do not walk through each other
- Ambient traffic: cars drive right-hand lanes around city blocks, follow each other, and can be carjacked. A car is heavier than a person and does not yield. Traffic cars with clear glass carry a driver you can see inside
- Vehicle cabins: passenger cars have a lined cabin with seats, a dashboard and a steering wheel, and clear glass, so the interior reads from outside. Box-bodied vans, buses and trucks keep their tinted panes. Taking a car hides the NPC driver and puts the player in the seat
- Building and vehicle-body collision. A stopped car is solid. A body that hits something slides along it instead of sticking to it, and one that ends up wedged inside climbs back out. Cars transfer momentum to people too: a light touch nudges them aside, a faster hit knocks them down, bleeds and slides them along the road, and only a hard hit at speed kills. People and cars follow the ground height and stay on walkable ground
- A person who is knocked down really falls: the body goes to a physics engine, the joints are held together by constraints, it hits the walls and tumbles, settles where it lands, and gets back up from that pose
- Momentum in car crashes: any two cars that touch exchange momentum by closing speed and mass ratio. Parked cars slide until friction or a wall stops them, traffic is knocked off its lane and recovers, and the player's car loses speed in proportion to what it hit
- GTA-style radar minimap, plus a full-island map (M, or from the pause menu)
- Contextual key prompts for entering, stealing, and exiting cars; the full control hint fades out after the opening seconds
- Main menu (Start, Collection, Settings, About) with a shared settings page: language, camera view, and rebindable keys saved in the browser
- Pause menu (Esc): resume, restart, settings, map, cheats, collection, and exit
- Collection gallery: all 14 vehicles, the 12 pedestrian kinds, five street props, and eight building types on a 3D turntable, with an interior view from the driver's seat and a driver NPC toggle
- Cheats spawn a chosen vehicle beside the player; restart removes them
- English and Chinese interface

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
make             # same build, writes dist/
make single      # one file, dist/retrogta.html
```

## Controls

Choose Start on the main menu. In the follow and first-person cameras, move the mouse to look around. First person works on foot and from the driver's seat, where the view follows the car as it turns. Esc pauses; press it again to resume, then click the picture to lock the pointer. The top-down and 2.5D cameras are fixed, and movement keys move relative to the screen.

Rebind keys in Settings → Controls → Keyboard, in either menu: click a binding, then press a key or mouse button. Esc cancels. A key already used by another action swaps with it. Reset keys restores the defaults. Bindings are saved in the browser, and Esc always pauses. The camera can also be picked directly in Settings → View; it stays in sync with the V key.

| Key | On foot | Driving |
| --- | --- | --- |
| W A S D | Move relative to the camera | Throttle, brake / reverse, steer |
| Shift | Run | — |
| Mouse | Turn the follow camera | Turn the follow camera |
| V | Cycle follow, first-person, top-down, and 2.5D | Cycle follow, first-person, top-down, and 2.5D |
| M | Toggle the full-island map | Toggle the full-island map |
| E | Walk to the nearer side and get in | Exit when moving slowly |
| Space | Jump | Brake |
| Left click | Punch | — |
| Esc | Pause: resume, restart, settings, map, cheats, or exit | Pause: resume, restart, settings, map, cheats, or exit |

The round radar at the bottom left shows the area around the player and rotates so the player faces up; driving fast widens the view. The arrow is the player, the cyan dot is the safehouse, and white dots are parked vehicles. Moving traffic and pedestrians are not shown. The pause map shows the whole island with north up. While driving, the top-right readout shows speed in km/h; reverse speed is negative.

## Collection

The main menu and the pause menu both have a Collection page. It is a full-screen gallery with four tabs:

- **Vehicles** — all 14 vehicle types, in the same paint as the cheat menu
- **People** — one look for each of the 12 pedestrian kinds, built from the same outfit tables as the crowd
- **Ground that leans** — a hill the car climbs with its nose up and its body following the slope across it, and sand that takes grip and top speed away. The ground is one surface object, so adding a new kind — a beach, a yard, a ramp — is a polygon and a name in the map
- **Street props** — street lamp, fire hydrant, trash bags, street tree, and dumpster. A car throws the bags and the hydrant, shoves the skip, and knocks the lamp post over; the post falls about its foot, lands across the road, and sparks from its live cable until the scene is reset. A tree is older than the street: it is taller than a car and does not come down
- **Buildings** — a row house, a shopfront, a convenience store, a water-tower house, an industrial warehouse, a hospital, a police station, and the safehouse, all from the city's shared building builder

Pick from the list, or use the left and right arrow keys, to step through the items in the current tab. The model sits on a turntable: drag to rotate it and scroll to zoom.

Vehicles with a modelled cabin also show an **Interior view** button beside the item controls. It puts the camera in the same driver's seat the first-person driving view uses, hides the windshield, and turns dragging into a free look around the cabin. The E key, or whichever key is bound to entering and exiting a car, toggles it as well. Switching between vehicles keeps the interior view; switching to people or props returns to the exterior.

Cars that carry a driver also show a **Driver NPC** toggle next to it. It seats or removes the driver in the outside view; the toggle disappears while the interior camera is in use, and the chosen state carries over between vehicles.

## Interface language

Switch the interface in Settings → Language, in either the main or pause menu (the settings page is shared). The choice is saved in the browser.

- English (`en`) — default
- Chinese (`zh`)

## Map data

Y is up, +X is east, and +Z is south. The island lives in [`data/saint-marks.json`](data/saint-marks.json); `src/city.js` reads it and builds the meshes. People and cars follow the surface height and can stand only on the island, the bridge deck, or the landing. The safehouse sits at the foot of the riverside avenue on the west side, with its door facing west toward the slope.

| Element | Notes |
| --- | --- |
| `roads` | Orthogonal road grid. Sidewalks, crosswalks, street lamps, and the ambient traffic lane loops are generated along it |
| `blocks` | `residential` places row houses on the north and south edges. `industrial` places two south-facing warehouses. `alley` adds two dumpsters in the gap |
| `rows` | A named house row: width, floors, wall color, shop, awning, fire escape, roof tank |
| `safehouse` | One safehouse; the file includes it |
| `stores` | Hand-placed convenience stores: position, front face, wall color and sign. The city builds them with the same house builder as the row houses |
| `landmarks` | Hand-placed hospitals and police stations: `type` picks the building style, plus position, front face, size, floors, wall color and sign |
| `hill` | The slope and the raised intersection outside the safehouse |
| `island`, `beach`, `landing` | Coast, sand, and the far side of the bridge |
| `diagonals` | Diagonal roads |
| `bridge` | One bridge, deck at road height, with side towers |
| `water` | One water plane |
| `elevated`, `train` | An elevated track and a train that shuttles along it |
| `gate` | One gate and a short approach road |
| `trees` | Placed trees |
| `safehouseProps` | `hydrant` and `trash` |
| `vehicles` | 14 types; see [Vehicles](#vehicles). Unknown types fall back to `sedan`. Every parked vehicle can be entered; `driveable` marks the car the player starts next to. Ambient traffic can be carjacked too |
| `pedestrians` | Fixed people who walk a path, with shirt, pants, and an optional cap. Separate from the runtime crowd; see [Pedestrians](#pedestrians) |
| `bounds` | The reader accepts extra collision walls. The current map leaves this field out |

A position can be an absolute `x` / `z`, an offset from the safehouse door (`dx` / `dz`), or a `lane` (`curbNorth`, `pedSouth`, `sidewalkWest`, and so on). Vehicle and pedestrian `heading` values are degrees.

## Vehicles

Set the type with `vehicles[].type`. All builders live in `src/vehicle.js`; unknown types fall back to `sedan`.

| `type` | Vehicle | Notes |
| --- | --- | --- |
| `sedan` | Sedan | Four-door three-box car, the default; the car the player starts next to |
| `taxi` | Taxi | Sedan body with a roof sign |
| `hatchback` | Hatchback | Short body with a liftback tailgate |
| `suv` | SUV | Tall body, roof rails, larger wheels |
| `pickup` | Pickup | Separate cab and open cargo bed |
| `sports` | Sports car | Low body, fastback glass, rear wing |
| `van` | Van | Tall enclosed cargo body |
| `bus` | City bus | 10.6 m body, long side windows |
| `truck` | Box truck | Cab-over cab, large cargo box, dual rear wheels |
| `excavator` | Excavator | Tracks, boom, arm, and bucket |
| `ambulance` | Ambulance | White box body, red stripe, red cross, light bar |
| `firetruck` | Fire truck | Red body, equipment box, roof ladder, light bar, six wheels |
| `police` | Police car | Blue-and-white livery with a red/blue roof light bar |
| `mixer` | Cement mixer | Tilted drum, reinforcing rings, rear discharge chute, six wheels |

Passenger cars have clear glass, so their seats and the driver show from outside. The box-bodied vans, buses and trucks keep tinted panes: their body is a solid shell, so there is no cabin behind the glass to show.

To add a type, write a builder in `src/vehicle.js`, register it in `BUILDERS`, and set the matching `type` on an entry in `data/saint-marks.json`.

## Pedestrians

The crowd draws from the kinds in `src/npc.js`. Hand-placed pedestrians in the map keep their own shirt, pants, and cap colors and walk their own paths.

| Kind | Pedestrian | Notes |
| --- | --- | --- |
| `businessman` | Businessman | Suit, tie, briefcase, short hair, sometimes a cap. Medium pace |
| `businesswoman` | Businesswoman | Blazer, skirt, handbag, long hair. Tights or bare legs, sometimes glasses |
| `student` | Student | Hoodie or casual top, jeans or shorts, backpack, cap or beanie, headphones |
| `schoolkid` | Schoolchild | Shorter and larger-headed, bright backpack and shorts. Faster than adults |
| `tourist` | Tourist | Bright shirt, shorts, sun hat, backpack or tote. Walks slowly |
| `jogger` | Jogger | Sleeveless top, shorts, sneakers, headphones. The fastest walker |
| `constructionWorker` | Construction worker | Heavy build, hi-vis vest, hard hat, work boots |
| `elderly` | Elderly person | Hunched, gray or white hair, cane, beanie or cap, glasses. The slowest |
| `courier` | Courier | Uniform shirt and cap, large backpack. Brisk pace |
| `shopper` | Shopper | Casual clothes, tote bag or handbag. Varied builds and hair |
| `policeOfficer` | Police officer | Navy uniform, police cap, belt. Rare |
| `punk` | Punk | Dyed hair, beanie, dark clothes, headphones |

Weights in `KINDS` decide how often a kind appears; each spawn also rolls height, build, skin, hair, and clothing colors. To add a kind, append an entry to `KINDS` with a `weight` and a `make()` that returns the actor options (see the existing entries for the fields).

The crowd reacts to traffic: people wait at the curb while a car comes through the crossing, hurry across if one approaches mid-crossing, and jump aside when a car heads straight for them on the sidewalk. A hit they do not dodge scales with the impact: a light bump shoves them aside, a faster hit knocks them down and slides them along with the car while they bleed, and a hard hit at speed kills them. A stopped car does not run anyone over. The player, the hand-placed pedestrians, and the crowd block each other. A punch sends nearby people running. Two walkers who meet sometimes stop to chat, and idle people look around, check a phone, or window-shop at the nearest shopfront. Hand-placed map pedestrians also run from a car driving straight at them, and bleed the same way if it hits them. If the player is run over, they reappear at the safehouse.

## Traffic

`src/city.js` derives a clockwise lane loop around each city block whose four sides are unbroken roads. Cars drive the right-hand lane of each loop, so neighboring blocks give two-way traffic. They slow for corners and follow moving cars and the player's car, but they do not stop for people: driving through someone knocks them down or kills them. Traffic cars with clear glass are driven by an NPC you can see through the windows; the driver gives up the seat when you take the car. Cars spawn and despawn only outside the camera, like the pedestrian crowd. Ambient cars can be carjacked: target one with E and it stops while you walk to the nearer side. Once taken, it becomes a normal car and can be parked or driven like any other.

## Project layout

| File | Role |
| --- | --- |
| `src/main.js` | Entry point |
| `src/menu.js` | Menu navigation for the main and pause menus, including the shared settings page and the collection overlay |
| `src/collection.js` | Collection gallery: asset catalog, turntable camera, and the vehicle interior view |
| `src/game.js` | Loop, cameras, walking and driving, HUD |
| `src/city.js` | Builds roads, the elevated track, colliders, and the lane/sidewalk networks, and places the buildings from `building.js` |
| `src/building.js` | One shared building builder: brick row houses, shopfronts, convenience stores, water towers, warehouses, hospitals, police stations and the safehouse, also used by the collection gallery |
| `src/config.js` | Metrics exported from the map file, plus a stable hash |
| `src/actor.js` | Person model: each joint merged into one mesh with its colour baked into vertex attributes, so the whole cast shares one material; walk, seated and knocked-down poses with knee and elbow joints |
| `src/ragdoll.js` | The ragdoll: a knocked down person hands every joint to a physics engine, the joints are held together by constraints, and the pose it lands in is kept for the get up |
| `src/physics.js` | The shared part of the physics engine: the world setup, and the walls built around a body while it falls |
| `src/prop-physics.js` | Street furniture a car throws out of the way: the rubbish bags, the hydrant and the skip are handed to a physics engine and settle where they land. The collider travels with the prop and is the box around its body, so a skip that lands on its side blocks the road it actually covers. A prop on the move stays in the collision index, and a car that catches up with one shoves it instead of driving through it; the car itself goes into the engine as well, so a prop cannot tumble back through the bonnet. A lamp post is bolted at the foot, so it does not fly: it goes over about its base and stays down |
| `src/shocks.js` | The sparks off a lamp post that has been knocked down: a burst when it lands, and a fitful flicker and more sparks for as long as it lies there |
| `src/npc.js` | Pedestrian kinds, sidewalk graph, and the streamed crowd |
| `src/traffic.js` | Block lane loops, ambient traffic, and car following |
| `src/vehicle.js` | Vehicle meshes, driving state, and the 14 builders: the body is merged per material, the tyre and hub share one wheel mesh, and cabins get seats, a dashboard and a steering wheel; passenger cars use clear glass and traffic cars carry a seated driver |
| `src/landform.js` | The shape of the ground, as a list of pieces. A `ramp` eases the grade in and out of each end, so a climb meets the flat street without a fold: the height and the gradient both match, and a car does not pitch all at once at the seam. Each piece answers how high it is and draws itself from the same four corners, so the ground that is drawn and the ground that is stood on cannot drift apart. A hill used to be two things that had to agree - a chain of ifs for the height and hand-rotated boxes for the mesh - and they did not: the east arm's road floated up to four metres above the ground under it |
| `src/terrain.js` | The ground, as one object: a height, a lean, and what it is made of. Everything asks it, so a car and a walking person are always standing on the same answer. The lean comes from the height by sampling either side, at a step that narrows near a kerb so the flat beside it stays flat. Each material has its own grip and drag, so sand is slower and steers less than asphalt |
| `src/collision.js` | Circle collision between people, oriented vehicle bodies, and the walkable island and bridge |
| `src/spatial.js` | Spatial index for the colliders: the static ones are bucketed into a grid and queried by cell, the ones that move (cars) are kept on a short list that is always tested |
| `src/props.js` | Street furniture: lamp posts, hydrants, rubbish bags, trees and skips. The city and the collection gallery share one model for each, and the collider is written next to the geometry. A prop that a car can throw also says what it weighs and how it is thrown, in the same function |
| `src/blood.js` | Blood left on the ground after a knockdown or a fatal hit |
| `src/materials.js` | Brick and sign textures drawn on a canvas |
| `src/i18n.js` | English and Chinese interface strings |
| `src/bindings.js` | Key bindings, saved in the browser |
| `src/input.js` | Keyboard and pointer lock |
| `src/minimap.js` | Radar minimap and the full-island pause map |
| `src/style.css` | HUD and menu styles |
| `index.html` | Page shell and HUD markup |
| `data/saint-marks.json` | Map: roads, blocks, landmarks, vehicles, and pedestrians |
