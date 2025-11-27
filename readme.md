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
- ships are big multitile battleships with cannons to their sides 
- ships and boats have unique movement mechanics. They have a direction that is influenced by a rudder. The rudder angle can be adjusted 15 degree per second. The rudder defines the turning circle radius. The ship alwas has a circular path. sometimes with a giant circle that almost feels streight. sometimes with a tine circle. 

- overshooting the target when an npcs runs into the player should not get the npc stuck in a obstacle
- speed should build up slowly. Not instant. 
- one should not be able to shoot at own boat when onboard the boat.
- allow building boats only on water
