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



## TODO
- grey out the player prendering when died (ghost)
- spawn boats 100 tiles away
- if boats dont have a target, let them patrol gradually torwards the player
- when host player is killed on water, boats get stuck
- npc boats should avoid ramming each other. 
- raider drop rate



