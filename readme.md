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
- shoot stones with leftclick. only build roads via structures menud
- save game and load game from browser localStorage
- HP to all structures
- Do not spwan close to water
- Do not spawn when colliding with anything. 
- Sheep drop whool when harvested. Whool regrows after 10min
- sheep will alwyas flee from player
- sheep have a chance to spwan a new sheep when fed with GRN.
- sheeps can die from damage by thrown objects
- only show HP bars of player sheep or npcs when dmg was taken. Not on full hp.
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
- ther is a nother icon next to the building hammer to craft weapons
- there are two weapons spears and swords
- the basic sword needs obsidian and wood
- the better sword iron and gold
- the basic spear needs obsidian and wood
- the better spear needs wood and iron
- the spare can be thrown just like stones
- the sword increases damage when running into enemies
- ships are big multile battleships with cannons to their sides
- ships and boats have unique movement mechanics. They have a direction and speed that only changes slowly. So manoverability needs skill and planning.
