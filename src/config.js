export const CONFIG = {
    TILE_SIZE: 32,
    PLAYER_SPEED_BASE: 2,
    PLAYER_SPEED_ROAD: 3,
    PLAYER_SPEED_WATER: 2,      
    PLAYER_SPEED_DEEP_WATER: 4, 
    NPC_SPAWN_RATE: 0.002, 
    BUILD_RANGE: 400,
    MAX_NPCS: 30,
    WOOL_REGROW_TIME: 36000,
    
    // NPC RAMMING CONFIG
    NPC_RAM: {
        DAMAGE_STRUCTURE: 30, // Damage dealt to a Wall/Tower on impact
        DAMAGE_BOAT: 50,      // Damage dealt to a Player Boat on impact
        COOLDOWN: 120         // Frames between ramming impacts (2 seconds)
    },
    
    // Wave Sync Timer (ms)
    WAVE_INTERVAL: 45000, 
    
    // BOAT Configuration
    BOAT: {
        ACCELERATION: 0.003,
        RUDDER_SPEED: 0.03,
        MAX_RUDDER: 1,
        TURN_FACTOR: 0.5,
        BROADSIDE_COOLDOWN: 120,
        CANNON_SPEED: 12,
        CANNON_DAMAGE: 40,
        CANNON_RANGE: 60
    },

    DAY_CYCLE: {
        DURATION: 24000, 
        NIGHT_OPACITY: 0.95, 
        SUNRISE: 0.25,
        SUNSET: 0.75
    },

    REPAIR: {
        AMOUNT: 20, 
        COST: 1     
    },

    WIND: {
        PARTICLE_COUNT: 150,
        COLOR: 'rgba(255, 255, 255, 0.08)', 
        SPEED_BASE: 1,      
        SPEED_VARIATION: 1.5 
    }
};

export const TILES = {
    WATER: { id: 0, color: '#2b2b96', solid: true, name: 'Ocean', short: 'H2O', isWater: true },
    DEEP_WATER: { id: 18, color: '#1a1a6e', solid: true, name: 'Deep Ocean', short: 'D.H2O', isWater: true },
    GRASS: { id: 1, color: '#2d6e32', solid: false, name: 'Grass', short: 'Grs' },
    SAND:  { id: 2, color: '#c2b280', solid: false, name: 'Sand', short: 'Snd' },
    GREY:  { id: 3, color: '#777777', solid: false, name: 'Stone', short: 'Stn' }, 
    BLACK: { id: 4, color: '#111111', solid: false, name: 'Obsidian', short: 'Obs' }, 
    IRON:  { id: 5, color: '#444444', solid: false, name: 'Iron', short: 'Irn' }, 
    GOLD:  { id: 7, color: '#ffd700', solid: false, name: 'Gold', short: 'Gld' },
    
    WALL:  { id: 9, color: '#555555', solid: true, name: 'Wall', short: 'Wal', hp: 100 },
    WOOD:  { id: 10, color: '#8B4513', solid: false, name: 'Wood', short: 'Wod' },
    STONE_BLOCK: { id: 11, color: '#777777', solid: true, name: 'Boulder', short: 'Bld', hp: 80 }, 
    
    TOWER_BASE_STONE: { id: 12, color: '#555555', solid: true, name: 'Stone Tower', short: 'T.St', hp: 150, isTower: true, light: 150, cannonDamage: 20 },
    TOWER_BASE_IRON:  { id: 14, color: '#333333', solid: true, name: 'Iron Tower', short: 'T.Ir', hp: 300, isTower: true, light: 150, cannonDamage: 40 },
    TOWER_BASE_GOLD:  { id: 15, color: '#886600', solid: true, name: 'Gold Tower', short: 'T.Gd', hp: 500, isTower: true, light: 150, cannonDamage: 80 },
    
    ROOF: { id: 13, color: '#5C3317', solid: false, name: 'Roof', short: 'Rof' },
    
    WOOD_WALL: { id: 16, color: '#6F4E37', solid: true, name: 'Fence (Closed)', short: 'Fnc.C', hp: 50 },
    WOOD_WALL_OPEN: { id: 23, color: '#5C3317', solid: false, name: 'Fence (Open)', short: 'Fnc.O', hp: 50 }, 

    WOOD_RAIL: { id: 17, color: '#A0522D', solid: true, name: 'Wood Rail', short: 'W.Ral', hp: 30 },

    TREE: { id: 19, color: '#2d6e32', solid: true, name: 'Tree', short: 'Tre', hp: 40 }, 
    MOUNTAIN: { id: 20, color: '#999', solid: true, name: 'Mountain', short: 'Mnt', hp: 200 },
    GREENS: { id: 21, color: '#2d6e32', solid: false, name: 'Greens', short: 'Grn' },
    
    WOOL: { id: 22, color: '#eeeeee', solid: false, name: 'Wool', short: 'Wol' },
    BOAT: { id: 24, color: '#8B4513', solid: false, name: 'Sloop', short: 'Slp' },
    GALLEON: { id: 28, color: '#5D4037', solid: false, name: 'Galleon', short: 'Gal' }, 
    CRATE: { id: 26, color: '#CD853F', solid: false, name: 'Crate', short: 'Box' },
    
    TORCH: { id: 25, color: '#ffaa00', solid: false, name: 'Torch', short: 'Lit', hp: 10, light: 200 },
    
    ROAD: { id: 27, color: '#777777', solid: false, name: 'Paved Road', short: 'Rd.' },

    SPEAR_WOOD: { id: 30, color: '#5C3317', solid: false, name: 'Wd.Spear', short: 'W.Spr' },
    SPEAR_IRON: { id: 31, color: '#aaa', solid: false, name: 'Ir.Spear', short: 'I.Spr' },
    SWORD_WOOD: { id: 32, color: '#5C3317', solid: false, name: 'Wd.Sword', short: 'W.Swd' },
    SWORD_IRON: { id: 33, color: '#ccc', solid: false, name: 'Ir.Sword', short: 'I.Swd' },

    // Ship Aesthetics
    SHIP_DECK: { id: 40, color: '#8B5A2B', solid: false, name: 'Deck' },
    SHIP_RAIL: { id: 41, color: '#5C3317', solid: true, name: 'Rail' },
    SHIP_MAST: { id: 42, color: '#3E2723', solid: true, name: 'Mast' },
    SHIP_CANNON: { id: 43, color: '#111', solid: true, name: 'Cannon' },
    SHIP_BOW: { id: 44, color: '#8B5A2B', solid: true, name: 'Bow' },
    SHIP_STERN: { id: 45, color: '#5C3317', solid: true, name: 'Stern' }
};

export const SHIP_SPECS = {
    'sloop': {
        name: "Sloop",
        hp: 100,
        acceleration: 0.003,
        maxSpeed: 3.5,
        turnSpeed: 0.03,
        broadsideCooldown: 120,
        ammoType: 'STN',
        layout: [
            [0, 44, 0], 
            [41, 40, 41], 
            [43, 42, 43], 
            [41, 40, 41], 
            [43, 40, 43], 
            [45, 45, 45]  
        ]
    },
    'galleon': {
        name: "Galleon",
        hp: 400,
        acceleration: 0.002, 
        maxSpeed: 4.0,       
        turnSpeed: 0.015,    
        broadsideCooldown: 100, 
        ammoType: 'IRN',
        layout: [
            [0, 0, 44, 0, 0],
            [41, 41, 40, 41, 41],
            [43, 40, 42, 40, 43], 
            [41, 40, 40, 40, 41],
            [43, 40, 40, 40, 43],
            [41, 40, 42, 40, 41], 
            [43, 40, 40, 40, 43],
            [41, 40, 40, 40, 41],
            [45, 45, 45, 45, 45]
        ]
    }
};

export const ID_TO_TILE = Object.values(TILES).reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export const BLUEPRINTS = [
    { name: "Stone Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_STONE.id}], cost: { [TILES.GREY.id]: 4, [TILES.WOOD.id]: 1 } },
    { name: "Iron Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_IRON.id}], cost: { [TILES.GREY.id]: 1, [TILES.IRON.id]: 3, [TILES.WOOD.id]: 1 } },
    { name: "Gold Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_GOLD.id}], cost: { [TILES.GREY.id]: 1, [TILES.GOLD.id]: 3, [TILES.WOOD.id]: 1 } },
    { name: "Stone Wall", structure: [{x:0, y:0, id: TILES.WALL.id}], cost: { [TILES.GREY.id]: 2 } },
    { name: "Fence/Gate", structure: [{x:0, y:0, id: TILES.WOOD_WALL.id}], cost: { [TILES.WOOD.id]: 2 } },
    { name: "Bridge Block", structure: [{x:0, y:0, id: TILES.GREY.id}], cost: { [TILES.GREY.id]: 1, [TILES.WOOD.id]: 1 }, special: 'bridge' },
    { name: "Road Segment", structure: [{x:0, y:0, id: TILES.ROAD.id}], cost: { [TILES.GREY.id]: 1 } },
    { name: "Sloop", structure: [{x:0, y:0, id: TILES.BOAT.id}], cost: { [TILES.WOOD.id]: 5, [TILES.WOOL.id]: 2 }, special: 'boat' },
    { name: "Galleon", structure: [{x:0, y:0, id: TILES.GALLEON.id}], cost: { [TILES.WOOD.id]: 20, [TILES.WOOL.id]: 10, [TILES.IRON.id]: 10, [TILES.GOLD.id]: 5 }, special: 'galleon' }, 
    { name: "Torch", structure: [{x:0, y:0, id: TILES.TORCH.id}], cost: { [TILES.WOOD.id]: 1, [TILES.BLACK.id]: 1 } }
];

// [MODIFIED] Reduced Sword Damage
export const WEAPONS = {
    SPEAR_WOOD: { id: TILES.SPEAR_WOOD.id, name: "Obsidian Spear", type: 'range', damage: 35, speed: 10, range: 60, color: '#8B4513', cost: { [TILES.BLACK.id]: 1, [TILES.WOOD.id]: 2 } },
    SPEAR_IRON: { id: TILES.SPEAR_IRON.id, name: "Iron Spear", type: 'range', damage: 60, speed: 14, range: 60, color: '#aaa', cost: { [TILES.WOOD.id]: 1, [TILES.IRON.id]: 2 } },
    SWORD_WOOD: { id: TILES.SWORD_WOOD.id, name: "Obsidian Sword", type: 'melee', damage: 25, cost: { [TILES.BLACK.id]: 1, [TILES.WOOD.id]: 2 } },
    SWORD_IRON: { id: TILES.SWORD_IRON.id, name: "Iron Sword", type: 'melee', damage: 55, cost: { [TILES.IRON.id]: 2, [TILES.GOLD.id]: 1 } }
};