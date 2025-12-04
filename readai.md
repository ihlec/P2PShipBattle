Here is a comprehensive prompt designed to instruct an LLM to recreate your game exactly, feature-for-feature, without using direct code snippets.

***

**Prompt for LLM:**

**Role:** You are an expert Game Developer and Software Architect specializing in vanilla JavaScript, HTML5 Canvas, and Peer-to-Peer networking.

**Objective:** Recreate a multiplayer top-down sandbox survival game called "Pixel Warfare" from scratch. The game must use ES6 modules, `trystero` for P2P networking, and no external assets (all graphics must be drawn programmatically via Canvas API).

**Project Structure:**
The project must be organized into the following file structure:
* `index.html` (Entry point and UI DOM)
* `styles.css` (UI styling)
* `src/config.js` (Game constants and definitions)
* `src/utils.js` (Math and procedural generation helpers)
* `src/main.js` (Bootstrapping)
* `src/core/` (Game.js, InputHandler.js, Network.js)
* `src/world/` (World.js, ParticleSystem.js)
* `src/entities/` (Entity.js, Boat.js, Npc.js, Projectile.js)
* `src/systems/` (Renderer.js, UIManager.js)

**Detailed Functional Requirements:**

**1. Configuration & Constants (`config.js`)**
* Define tile types (Grass, Water, Deep Water, Sand, Stone, Obsidian, Iron, Gold, Walls, Fences, Towers, Trees, Mountains). Each tile must have properties for ID, color, solidity, and HP/Light values where applicable.
* Define blueprints for crafting (Towers, Walls, Boats, Bridges).
* Define weapon stats (Spears, Swords) and boat physics constants (acceleration, turn speed, wind influence).
* Define game cycle constants: Day/Night duration, NPC spawn rates, and wave intervals.

**2. Procedural Generation & Math (`utils.js`)**
* Implement a deterministic pseudo-random number generator (hashing) to ensure all peers generate the exact same world from a seed.
* Implement 2D Value Noise and Fractal Brownian Motion (octaves) for terrain elevation.
* Implement `getBiome` logic: Map elevation levels to tiles (Deep Water -> Water -> Sand -> Grass -> Mountain).
* Include scattered resource generation (Trees, Rocks) based on noise thresholds.
* Implement helper functions for linear interpolation (lerp), angle interpolation, and distance calculation.

**3. World Management (`World.js`)**
* The world is an infinite procedural grid based on the seed.
* Store modifications (placed/destroyed blocks) in a hash map to override procedural generation.
* Implement a Day/Night cycle that transitions a global lighting value from 0 (Day) to 1 (Night) and back.
* Implement a global Wind system with a changing angle that affects particles and boat movement.
* Include logic to export/import world data (seed, modifications, time) for saving/loading.

**4. Networking (`Network.js`)**
* Use `trystero` to create a P2P room. Implement a list of multiple fallback tracker URLs (wss) to ensure reliability.
* **Host Authority:** The Host controls NPC AI, world time, and validates building/damage.
* **Action Types:** Implement handlers for: `init` (handshake), `world` (sync state), `player` (movement sync), `tileUpd/tileReq` (building/breaking), `damage`, `shoot`, and `entities` (syncing NPCs/Boats).
* **Sync Logic:**
    * Players sync position/input state every ~50ms.
    * Host syncs all NPC/Boat positions and HP to peers every ~50ms.
    * **Safe Spawn:** When a peer joins, the client must attempt to find a valid spawn point (not water, not solid) near the host's coordinates before spawning.

**5. Entities & Physics**
* **Base Entity:** Handles position, interpolation (for lag smoothing), HP, and inventory.
* **Player:** Movement (WASD), collision detection against solid tiles (with "slide" mechanics), melee combat, and ranged combat.
* **Boat Physics (`Boat.js`):**
    * Must implement momentum-based movement.
    * **Sailing:** Speed depends on sail level and alignment with the global wind angle.
    * **Drift:** Boats should slide sideways slightly but have resistance (keel physics).
    * **Broadside Combat:** Players can fire cannons left/right ('Q' and 'E'). This fires a volley of 3 cannonballs with spread.
    * **Separation:** Enemy boats must apply a separation force to avoid overlapping each other.
* **NPCs (`Npc.js`):**
    * **Sheep:** Wander aimlessly, can be sheared for wool, regrow wool over time.
    * **Raiders:** Aggressive AI. They must pathfind toward the nearest player or player-structure. If close, they attack.
    * **Peace Timer Logic:** The Host tracks a "Peace Timer" (randomly 5-15 mins). If no player takes damage, an Invasion Boat spawns. If damage is taken, the timer resets.

**6. Combat System**
* **Projectiles:** Support different types (Stone, Spear, Cannonball) with different speeds, ranges, and damages. Projectiles must have an owner ID to prevent self-damage.
* **Structures:** Walls and Towers have HP. Towers (Stone/Iron/Gold) must auto-target enemies and fire cannonballs if they have ammo.
* **Ramming:** Boats and NPCs should deal damage if they collide with entities or structures at high speeds.

**7. Rendering (`Renderer.js`, `ParticleSystem.js`)**
* **View:** Top-down 2D with a camera that follows the player. Support zooming (mouse wheel) and screen shake.
* **Drawing:**
    * Use `requestAnimationFrame`.
    * Implement "Bucket Sorting" or Z-indexing to ensure entities draw in the correct vertical order (y-sorting).
    * Draw visible tiles only (Culling).
    * **Art Style:** Draw distinct shapes for characters (circles/rectangles with helmet/hands), boats (complex shapes with masts/sails), and trees (foliage layers) using `ctx.fillRect`, `ctx.arc`, etc.
* **Particles:** System for explosions, water splashes, floating damage numbers, and wind streaks (lines that follow the wind angle).
* **Lighting:** Render a darkness overlay for night. Render "lights" (radial gradients) around players, torches, and towers using a shadow canvas with `destination-out` blending.

**8. UI & Input (`UIManager.js`, `InputHandler.js`)**
* **Main Menu:** HTML overlay for Name Input, Host Game, Join Game (Room ID), and Load Game.
* **HUD:** Display coordinates, room ID, inventory hotbar, and active blueprint.
* **Inventory:** Clickable slots. Logic to select materials or weapons.
* **Blueprint System:** Press 'B' or click Hammer to open a menu of structures. Clicking a blueprint allows placing it in the world if resources allow.
* **Interaction:** Right-click to interact (shear sheep, enter/exit boats, destroy tiles). Left-click to attack or build.

**9. Game Loop (`Game.js`)**
* Initialize all systems.
* **Spawn Logic:** Host spawns near (0,0) on valid land (spiral search).
* **Update Loop:** Handle network updates, physics, AI (Host only), and cooldowns.
* **Save/Load:** Save player stats, inventory, world seed, and modified tiles to `localStorage`.

**Instructions for Output:**
Using the architecture and requirements above, generate the complete code for all files. Ensure the math for boat physics and procedural generation is accurate. Do not use placeholders; provide the full logic for the game to function.