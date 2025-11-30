Based on the comprehensive analysis of the provided source code, here is the detailed Game Design Document (GDD) for **Pixel Warfare**.

### 1. Game Overview
* **Title:** Pixel Warfare (also referred to as Pixel Warfare Multiplayer)
* **Genre:** Top-down 2D Survival / Sandbox / RTS Hybrid
* **Perspective:** 2D Top-down with dynamic camera zoom
* **Core Loop:** Gather resources, build defenses, craft weapons, survive invasions, and battle enemy ships or NPC players in a persistent procedural world.

---

### 2. Gameplay Mechanics

#### 2.1 Controls & Input
* **Movement:** WASD or Arrow Keys for character movement.
* **Interaction:**
    * **Left Click:** Build structure, Attack (Melee/Range), Harvest resource.
    * **Right Click:** Interact (Enter/Exit Boat), Repair structures, Shear sheep.
    * **Mouse Wheel:** Zoom camera in/out.
* **Hotkeys:**
    * **Q / E:** Fire Boat Broadside (Left/Right).
    * **B:** Toggle Blueprint Menu.
    * **Esc:** Close Menus.
    * **G:** Toggle God Mode (Debug/Cheat).
    * **H:** Force Spawn Enemy Ship (Host only).

#### 2.2 Player Stats & Inventory
* **Health:** 100 Max HP. Regenerates slowly if safe and HP > 0.
* **Inventory:** Slots for Stone (Grey), Obsidian (Black), Iron, Gold, Wood, Greens, and Wool.
* **Equipment:** Active Slot for Melee (Hand/Sword) and Ranged (Stone/Spear).

#### 2.3 Combat System
* **Melee:** Uses "Hand" (1 dmg), Wood Sword (50 dmg), or Iron Sword (90 dmg). Hit detection is distance-based.
* **Ranged:**
    * **Throwing:** Players can throw Stones (25 dmg), Wood Spears (35 dmg), or Iron Spears (60 dmg).
    * **Projectiles:** Have travel speed, range, and owner properties (Player vs. Enemy).
* **Naval Combat:**
    * **Broadsides:** Boats fire cannonballs perpendicular to heading (Left/Right). Cooldown applies per side.
    * **Damage:** Cannonballs deal 50 damage and destroy terrain/structures.

#### 2.4 Resource Gathering
* **Harvesting:**
    * **Trees:** Drop Wood and chance for Greens.
    * **Mountains/Boulders:** Drop Stone, chance for Iron, rare chance for Gold.
    * **Sheep:** Can be sheared for Wool (regrows over time).
    * **Loot:** Killing enemies drops resources or crates containing wood/iron.

---

### 3. World & Environment

#### 3.1 Procedural Generation
* **Seed System:** Worlds are generated based on a numeric seed, synced across network.
* **Biomes:** Determined by elevation noise and moisture noise:
    * **Deep Ocean / Ocean:** Water tiles (solid to walking players, passable by boats).
    * **Sand:** Beach areas.
    * **Grass:** Standard terrain, contains Trees and Greens.
    * **Mountain:** High elevation, contains Stone/Ores.

#### 3.2 Dynamic Systems
* **Day/Night Cycle:**
    * **Duration:** 24,000 ticks (approx 20 mins).
    * **Phases:** Day, Sunset (0.25-0.35), Night (0.35-0.65), Sunrise (0.65-0.75).
    * **Lighting:** Darkness opacity increases at night. Light sources (Torches, Towers, Player) cut through darkness using a shadow canvas.
* **Wind System:**
    * Global wind direction changes over time.
    * Visualized by wind particles.
    * Affects Boat sailing speed and tacking efficiency.

---

### 4. Construction & Crafting

#### 4.1 Building System
* **Blueprints:** Players select structures from a menu. Structures check for "Solid" collisions before placement.
* **Repair:** Damaged structures can be repaired using Wood (for wood structures) or Stone (for stone structures).

**Buildable Structures:**
| Structure | Cost | Special Properties |
| :--- | :--- | :--- |
| **Stone Tower** | 4 Stone, 1 Wood | 150 HP, emits light, auto-fires cannons (20 dmg). |
| **Iron Tower** | 1 Stone, 3 Iron, 1 Wood | 300 HP, emits light, auto-fires cannons (40 dmg). |
| **Gold Tower** | 1 Stone, 3 Gold, 1 Wood | 500 HP, emits light, auto-fires cannons (80 dmg). |
| **Stone Wall** | 2 Stone | 100 HP, solid barrier. |
| **Fence/Gate** | 2 Wood | 50 HP, can be toggled open/closed. |
| **Bridge** | 1 Stone, 1 Wood | Allows movement over water. |
| **Road** | 1 Stone | Increases player movement speed. |
| **Boat** | 5 Wood, 2 Wool | Spawns a controllable vehicle in water. |
| **Torch** | 1 Wood, 1 Obsidian | 10 HP, provides light. |

#### 4.2 Weapon Crafting
* **Obsidian Spear:** 1 Obsidian, 2 Wood.
* **Iron Spear:** 1 Wood, 2 Iron.
* **Obsidian Sword:** 1 Obsidian, 2 Wood.
* **Iron Sword:** 2 Iron, 1 Gold.

---

### 5. Entities & AI

#### 5.1 The Boat
* **Movement:** Physics-based. Requires "tacking" against the wind for optimal speed. Includes sail raising/lowering.
* **Capacity:** Can carry a driver (Player or Enemy).
* **Mechanics:** Has hull HP, rudder control, and momentum drag.

#### 5.2 NPCs (Enemies)
* **Type:** "Invaders" or Minions spawned from Enemy Boats.
* **AI Behavior:** State machine with modes: `Chase` -> `Charge` -> `Rest`.
* **Attacks:** Melee contact damage.
* **Invasions:** Host triggers enemy boat spawns periodically. Enemy boats navigate to player and spawn minions on land.

#### 5.3 Animals (Sheep)
* **Behavior:** Wander randomly, seek "Greens" to eat.
* **Mechanics:** Can be fed Greens to reproduce (spawn babies). Can be sheared for Wool. Drops meat/wool on death.

---

### 6. Multiplayer & Network
* **Architecture:** Peer-to-Peer (P2P) mesh networking using `Trystero`.
* **Roles:**
    * **Host:** Generates world seed, manages AI/NPCs, authorizes building placement, manages time/wind.
    * **Client:** Syncs world data from host, sends input/position updates, renders locally.
* **Synchronization:**
    * World Data (Seed, modified tiles).
    * Player Positions (Interpolated).
    * Combat Events (Damage/Projectiles).

---

### 7. Technical Specifications
* **Engine:** Custom Vanilla JS engine with HTML5 Canvas.
* **Tile Size:** 32x32 pixels.
* **Resolution:** Fullscreen, responsive to window resize.
* **Persistence:** LocalStorage support (`pixelWarfareSave`) for saving/loading world state (Host only).

### 8. User Interface (HUD)
* **Top Left:** Room Code, Health, Coordinates, Biome, Elevation, Seed.
* **Bottom Left:** Action Bar (Hammer/Sword toggle).
* **Bottom Center:** Inventory Bar (Resource counts).
* **Bottom Right:** Equipped Weapon slot.
* **Overlays:** Main Menu (Name input, Host/Join), Floating "Blueprint" and "Weapon" grids.

### Next Step
Would you like me to analyze the code for potential bugs or optimizations, or perhaps generate a user manual based on this spec?