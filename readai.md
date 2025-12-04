To reproduce the application exactly as it exists now, use the following prompt. It details every architectural decision, gameplay mechanic, and visual style without providing the raw code.

***

**System Role:** You are an expert Creative Coder and Senior Game Developer specializing in single-file HTML5/Canvas engines without external dependencies.

**Task:** Create a complete, single-file HTML game titled "Medieval Pixel Warfare". The code must contain HTML, CSS, and modular JavaScript classes (Game, World, Entity, InputHandler, Utils, Particle, Projectile, DamageText) within a single document.

**Visual Style & Rendering:**
* **Grid System:** Use a 32px tile size. The game must look like a top-down 2D pixel art game.
* **Art Direction:**
    * **Water:** Deep Blue (`#2b2b96`), Solid.
    * **Grass:** Green (`#2d6e32`), Walkable.
    * **Sand:** Tan (`#c2b280`), Walkable.
    * **Roads (Stone):** Grey (`#777777`), Walkable, increases movement speed.
    * **Walls:** Grey (`#777777`), Solid. Render these with a semi-transparent black inner rectangle to simulate height/shadow.
    * **Obsidian:** Black (`#111111`), Walkable.
    * **Gold Variants:** Three shades (Dull, Standard, Bright) increasing in brightness. Walkable.
    * **Entities:** The Player is a Red square. NPCs are Black squares. Projectiles are small white circles.
* **Camera:** Implement a smooth camera that centers on the player.
* **Zoom:** Allow zooming in/out (0.5x to 3x) using the mouse scroll wheel. Use `imageSmoothingEnabled = false` to maintain pixel crispness.

**Core Systems & Architecture:**
* **World Generation:**
    * Use a seeded random number generator (simple hash function) to create a consistent, infinite procedurally generated world.
    * The terrain should resemble an "Ireland" style (islands) using noise maps to determine Water vs. Sand vs. Grass.
* **Spawn Logic:**
    * On game start, run a "Safe Spawn" algorithm that spirals outward from (0,0) to find the nearest non-water tile for the player.
* **Input Handling:**
    * Support WASD and Arrow Keys for movement.
    * Mouse coordinates must be translated from screen space to world space, accounting for the current Zoom level and Camera offset.

**Gameplay Mechanics:**
1.  **Movement & Physics:**
    * **Speed:** Base speed is 4. Walking on Road tiles increases speed to 8.
    * **Collision:** Implement Axis-Separated collision detection (check X, then check Y) to allow the player to "slide" along walls rather than getting stuck.
    * **Anti-Softlock:** If the player is detected inside a solid block (e.g., pushed there by a glitch), disable collision checks to allow them to walk out.
2.  **Inventory & Building:**
    * **UI:** A bottom bar showing slot colors, 3-letter codes (STN, OBS, IRN, etc.), and quantities.
    * **Placement Rules:** Players *cannot* manually place a block on an occupied tile. They must right-click to break it first.
    * **Stacking (Walls):** The only exception is placing Stone on Stone via the "Smart Placement" logic triggered by Blueprints, which converts the tile to a "Wall" ID.
    * **Blueprints:** Implement a menu button that toggles a Blueprint selection screen. Blueprints include "Standard Cannon" (pattern based), "Stone Wall" (stacked stone), and "Road Segment". Blueprints override the "no overwrite" rule.
    * **Ghosting:** When a blueprint is active, render a semi-transparent preview at the mouse cursor.
3.  **Combat (Momentum & Physics):**
    * **Directional Ramming:** Damage is only dealt if the player's velocity vector has a positive dot product relative to the enemy position (moving *towards* the enemy).
    * **Impact Mode:** If Speed > 1, deal high instant damage (Speed * 20), spawn particles, and knock the *NPC* back significantly. Do not bounce the player. Check collision for the NPC so they aren't knocked into walls/water.
    * **Grind Mode:** If Speed <= 1 (standing still), deal 0 damage.
    * **Incoming Damage:** Touching an NPC deals 5 DPS to the player continuously.
4.  **Health & Regeneration:**
    * **Player:** Recovers 1 HP every 2 seconds.
    * **NPCs:** Do not regenerate.
    * **Visuals:** Render a small health bar (Red background, Green foreground) inside the bottom of every entity's tile.
    * **Floating Text:** Implement a floating text system. Buffer damage values so numbers pop up as integers (e.g., accumulators reach >= 1.0). Player damage text is Red; NPC damage text is White.
5.  **Cannons (Automation):**
    * **Detection:** Scan the area around the player for a specific pattern: A row of 5 Gold blocks, with 2 Black blocks located below the 2nd and 3rd gold blocks.
    * **Firing:** If detected, create a "Cannon" logic object. If the player has "Iron" in inventory, the cannon fires projectiles at the nearest NPC within range, consuming ammo.

**God Mode:**
* Toggleable with the 'G' key.
* Prevents all damage to the player.
* Sets player damage output to 9999.

**Output Requirement:**
Provide the complete `index.html` file containing all CSS and JavaScript classes needed to run this game immediately in a browser.