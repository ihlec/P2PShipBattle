import { CONFIG as OLD_CONFIG, TILES as OLD_TILES, BLUEPRINTS as OLD_BP, WEAPONS as OLD_WP } from './config.js';

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
    
    // Age of Sail Physics
    BOAT: {
        ACCELERATION: 0.05,
        DECELERATION: 0.02,
        MAX_SPEED: 4.5,
        RUDDER_SPEED: 0.03, 
        MAX_RUDDER: 0.04,   
        TURN_FACTOR: 0.8,
        
        BROADSIDE_COOLDOWN: 120, // Player Cooldown
        CANNON_SPEED: 12,
        CANNON_DAMAGE: 50,
        CANNON_RANGE: 30,

        // [NEW] Enemy Stats
        ENEMY_COOLDOWN: 180,     // Slower than player
        ENEMY_DETECT_RANGE: 500,
        ENEMY_ENGAGE_RANGE: 250  // Distance they try to maintain
    },

    // Visual Wind Settings
    WIND: {
        PARTICLE_COUNT: 150,
        COLOR: 'rgba(255, 255, 255, 0.08)', 
        SPEED_BASE: 1,      
        SPEED_VARIATION: 1.5 
    }
};

export const TILES = {
    WATER: { id: 0, color: '#2b2b96', solid: true, name: 'Ocean', short: 'H2O' },
    DEEP_WATER: { id: 18, color: '#1a1a6e', solid: true, name: 'Deep Ocean', short: 'D.H2O' },
    GRASS: { id: 1, color: '#2d6e32', solid: false, name: 'Grass', short: 'Grs' },
    SAND:  { id: 2, color: '#c2b280', solid: false, name: 'Sand', short: 'Snd' },
    GREY:  { id: 3, color: '#777777', solid: false, name: 'Stone/Road', short: 'Stn' },
    BLACK: { id: 4, color: '#111111', solid: false, name: 'Obsidian', short: 'Obs' }, 
    IRON:  { id: 5, color: '#444444', solid: false, name: 'Iron', short: 'Irn' }, 
    GOLD:  { id: 7, color: '#ffd700', solid: false, name: 'Gold', short: 'Gld' },
    
    WALL:  { id: 9, color: '#555555', solid: true, name: 'Wall', short: 'Wal', hp: 100 },
    WOOD:  { id: 10, color: '#8B4513', solid: false, name: 'Wood', short: 'Wod' },
    STONE_BLOCK: { id: 11, color: '#777777', solid: true, name: 'Boulder', short: 'Bld', hp: 80 }, 
    TOWER_BASE_STONE: { id: 12, color: '#555555', solid: true, name: 'Stone Tower', short: 'T.St', hp: 150 },
    TOWER_BASE_IRON:  { id: 14, color: '#333333', solid: true, name: 'Iron Tower', short: 'T.Ir', hp: 300 },
    TOWER_BASE_GOLD:  { id: 15, color: '#886600', solid: true, name: 'Gold Tower', short: 'T.Gd', hp: 500 },
    ROOF: { id: 13, color: '#5C3317', solid: false, name: 'Roof', short: 'Rof' },
    
    WOOD_WALL: { id: 16, color: '#6F4E37', solid: true, name: 'Fence (Closed)', short: 'Fnc.C', hp: 50 },
    WOOD_WALL_OPEN: { id: 23, color: '#5C3317', solid: false, name: 'Fence (Open)', short: 'Fnc.O', hp: 50 }, 

    WOOD_RAIL: { id: 17, color: '#A0522D', solid: true, name: 'Wood Rail', short: 'W.Ral', hp: 30 },
    TREE: { id: 19, color: '#2d6e32', solid: true, name: 'Tree', short: 'Tre' },
    MOUNTAIN: { id: 20, color: '#999', solid: true, name: 'Mountain', short: 'Mnt', hp: 200 },
    GREENS: { id: 21, color: '#2d6e32', solid: false, name: 'Greens', short: 'Grn' },
    
    WOOL: { id: 22, color: '#eeeeee', solid: false, name: 'Wool', short: 'Wol' },
    BOAT: { id: 24, color: '#8B4513', solid: false, name: 'Boat', short: 'Bot' },

    // WEAPONS AS ITEMS
    SPEAR_WOOD: { id: 30, color: '#5C3317', solid: false, name: 'Wd.Spear', short: 'W.Spr' },
    SPEAR_IRON: { id: 31, color: '#aaa', solid: false, name: 'Ir.Spear', short: 'I.Spr' },
    SWORD_WOOD: { id: 32, color: '#5C3317', solid: false, name: 'Wd.Sword', short: 'W.Swd' },
    SWORD_IRON: { id: 33, color: '#ccc', solid: false, name: 'Ir.Sword', short: 'I.Swd' }
};

export const ID_TO_TILE = Object.values(TILES).reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export const BLUEPRINTS = [
    { name: "Stone Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_STONE.id}], cost: { [TILES.GREY.id]: 4, [TILES.WOOD.id]: 1 } },
    { name: "Iron Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_IRON.id}], cost: { [TILES.GREY.id]: 1, [TILES.IRON.id]: 3, [TILES.WOOD.id]: 1 } },
    { name: "Gold Tower", structure: [{x:0, y:0, id: TILES.TOWER_BASE_GOLD.id}], cost: { [TILES.GREY.id]: 1, [TILES.GOLD.id]: 3, [TILES.WOOD.id]: 1 } },
    { name: "Stone Wall", structure: [{x:0, y:0, id: TILES.WALL.id}], cost: { [TILES.GREY.id]: 2 } },
    { name: "Fence/Gate", structure: [{x:0, y:0, id: TILES.WOOD_WALL.id}], cost: { [TILES.WOOD.id]: 2 } },
    { name: "Bridge Block", structure: [{x:0, y:0, id: TILES.GREY.id}], cost: { [TILES.GREY.id]: 1, [TILES.WOOD.id]: 1 }, special: 'bridge' },
    { name: "Road Segment", structure: [{x:0, y:0, id: TILES.GREY.id}], cost: { [TILES.GREY.id]: 1 } },
    { name: "Boat", structure: [{x:0, y:0, id: TILES.BOAT.id}], cost: { [TILES.WOOD.id]: 5, [TILES.WOOL.id]: 2 }, special: 'boat' } 
];

export const WEAPONS = {
    SPEAR_WOOD: { id: TILES.SPEAR_WOOD.id, name: "Obsidian Spear", type: 'range', damage: 35, speed: 10, range: 60, color: '#8B4513', cost: { [TILES.BLACK.id]: 1, [TILES.WOOD.id]: 2 } },
    SPEAR_IRON: { id: TILES.SPEAR_IRON.id, name: "Iron Spear", type: 'range', damage: 60, speed: 14, range: 60, color: '#aaa', cost: { [TILES.WOOD.id]: 1, [TILES.IRON.id]: 2 } },
    SWORD_WOOD: { id: TILES.SWORD_WOOD.id, name: "Obsidian Sword", type: 'melee', damage: 50, cost: { [TILES.BLACK.id]: 1, [TILES.WOOD.id]: 2 } },
    SWORD_IRON: { id: TILES.SWORD_IRON.id, name: "Iron Sword", type: 'melee', damage: 90, cost: { [TILES.IRON.id]: 2, [TILES.GOLD.id]: 1 } }
};