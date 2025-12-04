# Game Design Document & Technical Specification: Pixel Warfare

## 1. Executive Summary
**Pixel Warfare** is a multiplayer, browser-based, top-down sandbox survival game. It features a procedurally generated infinite world, resource gathering, base building, crafting, and P2P (Peer-to-Peer) combat. The visual style is programmatic pixel art (rendered via Canvas API without external assets).

**Key Technology Stack:**
* **Language:** Vanilla JavaScript (ES6 Modules)
* **Rendering:** HTML5 Canvas API (2D Context)
* **Networking:** WebRTC via `trystero` library (Mesh topology)
* **Architecture:** Component-based Entity system with a Host-Authoritative/Client-Prediction hybrid model.

---

## 2. File Architecture
The application is structured into modular components.

* **Root:** `index.html` (DOM UI), `styles.css` (Overlay styling).
* **`src/main.js`:** Entry point. Handles menu logic (Host/Join/Load) and initializes the `Game` instance.
* **`src/config.js`:** Centralized constants (Tile IDs, Colors, Stats, Game Rules).
* **`src/utils.js`:** Math helpers (Noise generation, Hashing, Lerping, Distance calculations).
* **`src/core/`**:
    * `Game.js`: Main loop, system orchestration, state management.
    * `Network.js`: Manages P2P connections, data serialization, and state synchronization.
    * `InputHandler.js`: Maps keyboard/mouse events to game state variables.
* **`src/world/`**:
    * `World.js`: Procedural terrain generation, chunk management, time cycle.
    * `ParticleSystem.js`: Visual effects (explosions, wind, floating text).
* **`src/entities/`**:
    * `Entity.js`: Base class for moving objects (Player logic included).
    * `Boat.js`: Specialized water physics and vehicle logic.
    * `Npc.js`: AI behavior for passive (Sheep) and aggressive (Raider) mobs.
    * `Projectile.js`: Physics for spears, stones, and cannonballs.
* **`src/systems/`**:
    * `Renderer.js`: Handles all Canvas drawing operations, camera, and culling.
    * `UIManager.js`: DOM manipulation for Inventory, Crafting, and HUD.

---

## 3. World Generation & Environment
The world is infinite and deterministic based on a numeric seed.

### 3.1. Terrain Algorithm
* **Noise Function:** 2D Value Noise with pseudo-random hashing.
* **Biome Mapping:** Terrain is generated based on elevation heightmaps:
    * **Deep Water:** < -0.2
    * **Water:** < 0.25
    * **Sand:** < 0.30
    * **Grass:** < 0.60 (Contains Trees and scattered Rocks based on secondary noise layers)
    * **Mountain:** > 0.60
* **Modifications:** The game must store a hash map of `modifiedTiles` to persist user changes (placed walls, destroyed trees) over the procedural base.

### 3.2. Environmental Systems
* **Day/Night Cycle:**
    * Cycle length: ~24,000 ticks.
    * Phases: Day (0.0), Sunset (0.25), Night (0.5), Sunrise (0.75).
    * Visuals: A darkness overlay opacity ranges from 0.0 to 0.95.
* **Wind System:**
    * Global wind angle rotates slowly over time.
    * Affects Particle System (wind lines) and Boat sailing physics.

---

## 4. Entity Systems

### 4.1. Player
* **Movement:** WASD. Standard speed (2.0), slower on water, faster on roads. Collision detection uses a "slide" mechanic (check X axis, then Y axis independently) against Solid tiles.
* **Inventory:** Tracks material counts (Wood, Stone, Iron, Gold, Wool, etc.).
* **Combat:**
    * **Melee:** Hand, Wood Sword, Iron Sword. Short-range hitscan.
    * **Ranged:** Stones, Wood Spear, Iron Spear. Spawns Projectile entities.
* **Respawn:** 3-second timer on death. Drops no items (currently).

### 4.2. Boat (Vehicle)
* **Boarding:** Players interact to enter/exit. Player acts as the controller.
* **Physics:**
    * **Thrust:** Based on Sail Level + Wind Alignment.
    * **Steering:** Rudder angle adds angular velocity.
    * **Drift:** High lateral drag, low forward drag to simulate a keel.
* **Combat:**
    * **Broadside Cannons:** keys `Q` (Left) and `E` (Right). Fires 3 cannonballs in a spread pattern. Cooldown: 2 seconds.

### 4.3. NPCs
* **Host Authority:** Only the Host calculates AI; Clients receive position/state updates.
* **Sheep:** Wander randomly. Can be sheared (Right-click) for Wool. Wool regrows.
* **Raiders:**
    * Spawn in waves or from Enemy Boats.
    * AI: Pathfind to nearest Player or Player Structure.
    * Attack: Melee combat. Can destroy blocks.
    * Loot: Drops varied resources (Stone, Iron, Gold) on death.

---

## 5. Gameplay Mechanics

### 5.1. Building & Crafting
* **Blueprint System:**
    * Items: Walls, Towers, Fences, Bridges, Roads, Boats.
    * Cost: deducted from inventory upon placement.
* **Placement Rules:**
    * Cannot place on occupied tiles.
    * Boats must be placed on water.
    * Towers/Walls cannot be placed on water (unless Bridge).
* **Structures:**
    * **Towers:** Auto-turrets. Require `Iron` ammo (refillable). Fire at nearest enemy.
    * **Walls:** Passive HP blocks.

### 5.2. Invasion System ("Peace Timer")
* **Logic:** The Host tracks time since the last "Player Damage Event."
* **Trigger:** A random threshold (between 5 to 15 minutes).
* **Event:** If the timer exceeds the threshold, an Enemy Boat is spawned off-screen.
* **Reset:** Any damage taken by a player resets the timer to 0.

### 5.3. Interaction
* **Left Click:** Build (if blueprint active) OR Attack/Throw Projectile.
* **Right Click:** Cancel Build, Interact (Enter Boat, Shear Sheep, Open Gate).

---

## 6. Network Specification

### 6.1. Connection
* **Library:** `trystero` (BitTorrent style signaling).
* **Trackers:** Must implement redundant parallel connection attempts to multiple public trackers (e.g., `openwebtorrent`, `btorrent`, `sigterm`) to ensure reliability.

### 6.2. Protocol (Action Types)
* `init`: Handshake, exchange usernames.
* `world`: Host sends Seed, Modified Tiles Map, and Time to new joiners.
* `player`: Client sends X, Y, Input State, Health, Boat Status (Freq: ~50ms).
* `ents`: Host sends arrays of NPC, Boat, and Loot positions/states (Freq: ~50ms).
* `tileReq` / `tileUpd`: Client requests build/destroy; Host validates and broadcasts result.
* `damage`: Syncs damage events.

### 6.3. Joining Logic (Safe Spawn)
* When a client receives the World data, they must calculate a spawn point.
* **Algorithm:** Spiral search or Random radius search around the Host's location.
* **Validation:** Spawn point must **not** be Water and **not** be Solid collision.

---

## 7. Rendering & Audio

### 7.1. Camera
* Center on Player.
* Smooth Lerp (Linear Interpolation) for movement.
* **Screenshake:** Triggered by explosions, damage, or cannon fire.

### 7.2. Z-Indexing (Y-Sort)
* Entities must be drawn in order of their Y-coordinate to create a pseudo-3D perspective (objects lower on screen draw *over* objects higher on screen).

### 7.3. Lighting
* **Ambient:** Global darkness rectangle drawn over the screen.
* **Sources:** Players, Torches, and Towers emit light.
* **Implementation:** Use a secondary off-screen canvas. Draw "lights" using Radial Gradients (white to transparent). Draw the Shadow Canvas onto the Main Canvas using `destination-out` composite operation.

### 7.4. Programmatic Assets
* **No Images:** All graphics are drawn using `ctx.fillRect`, `ctx.arc`, `ctx.moveTo/lineTo`.
* **Style:** Pixelated (using `image-rendering: pixelated` in CSS).
* **Boats:** Complex shape drawing (Deck, Hull, Mast, Sail).
* **Particles:** Simple squares that fade alpha over time.

---

## 8. UI/UX
* **HUD:**
    * Top Left: Room Code, Coordinates.
    * Bottom Center: Inventory Bar (Clickable slots).
    * Bottom Right: Weapon Slots.
    * Center: Floating "Messages" (e.g., "Peace Broken!").
* **Menus:**
    * Main Menu: Overlay div with Name Input, Host/Join buttons.
    * Blueprint Menu: Grid of craftable items with costs, toggled via 'B' key or Hammer icon.

## 9. Persistence
* **Storage:** `localStorage`.
* **Saved Data:** World Seed, Modified Tiles (Map), Player Position/Inventory/Health, Boat locations, and Invasion Timer state.