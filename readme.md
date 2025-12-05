# P2P Ship Battle ⚔️

A multiplayer top-down sandbox survival game built with vanilla JavaScript and HTML5 Canvas. Features procedural world generation, base building, and naval combat using P2P networking.

## 🎮 How to Run

Play the latest version at: https://ipfs.io/ipfs/bafybeif5ookitzbl7hliakwzfeeg65wfxfo2slnbvtmyhcpts2yqkgwfdy/

Because this project uses ES6 Modules, you cannot simply open `index.html` directly. You must use a local server.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/pixel-warfare.git
    cd pixel-warfare
    ```
2.  **Start a local server:**
      * **VS Code:** Install the "Live Server" extension and click "Go Live".
      * **Python:** `python3 -m http.server`
      * **Node:** `npx http-server`
3.  **Open in Browser:** Navigate to `http://localhost:8000` (or the port provided).

## ✨ Features

  * **Infinite World:** Procedurally generated terrain with biomes (Water, Sand, Grass, Mountains).
  * **Multiplayer:** Host/Join games via P2P (using Trystero).
  * **Building:** Gather resources and craft Walls, Towers, and Bridges.
  * **Naval Combat:** Build boats with physics-based sailing and broadside cannons.
  * **Dynamic Environment:** Day/Night cycles and wind systems.

## ⌨️ Controls

| Key | Action |
| :--- | :--- |
| **W A S D** | Move |
| **Mouse** | Aim / Cursor |
| **L-Click** | Attack / Build |
| **R-Click** | Interact / Cancel Build |
| **B** | Toggle Build Menu |
| **Q / E** | Broadside Cannons (In Boat) |

-----
```
/
├── index.html
├── styles.css
└── src/
    ├── config.js
    ├── main.js
    ├── utils.js
    ├── core/
    │   ├── Game.js
    │   ├── InputHandler.js
    │   └── Network.js
    ├── world/
    │   ├── World.js
    │   └── ParticleSystem.js
    ├── entities/
    │   ├── Entity.js
    │   ├── Boat.js
    │   ├── Npc.js
    │   └── Projectile.js
    └── systems/
        ├── Renderer.js
        └── UIManager.js
```


## TODO
- joining player might spawn in water if host is next to water
- allow building stronger ship with much more HP
- balance building costs according to drop rates
- boats should have ammo






