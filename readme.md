MEDIVALPIXELS/
├── index.html
├── styles.css
└── src/
    ├── config.js       (Constants: TILES, CONFIG, BLUEPRINTS)
    ├── utils.js        (Math, Noise, Biome logic)
    ├── input.js        (Input handling)
    ├── entities.js     (Player, NPCs, Particles)
    ├── world.js        (Map data, tile management)
    ├── game.js         (Main Game Loop & Rendering)
    └── main.js         (Entry point)

## TODO
- save game and load game from browser localStorage
- HP to all structures
- Do not spwan close to water
- Shells on the beach for white blocks
- Sheep fields for whool
- sheep will alwyas flee from player
- Two sheep colling have a chance to spwan a new sheep when fed with GRN.
- Wood walls are now fences that open and close on left click. 
- Boat structure can be build using wood and whool
- player can enter boat and leaf boat when boat is next to sand
- boat can only move on water
- boat moves faster on deep water
- npc need to arrive by boat. 
- npc can only spwan in a boat. 
- only one NPC boat per human player can exist.
- npc boats drive torwards the player until land is reached.
- Then starts spwaning npc minions to attack. 
- if a player has already killed many npc. The boat drops more and stronger npcs