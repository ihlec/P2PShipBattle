import Utils from './utils.js';
import { ID_TO_TILE } from './config.js';

export default class World {
    constructor(seed) {
        this.seed = seed || Math.floor(Math.random() * 10000);
        this.modifiedTiles = {}; 
        this.tileData = {}; 
    }
    getKey(x, y) { return `${x},${y}`; }
    getTile(x, y) { return this.modifiedTiles[this.getKey(x, y)] !== undefined ? this.modifiedTiles[this.getKey(x, y)] : Utils.getBiome(x, y, this.seed); }
    setTile(x, y, id) { 
        const key = this.getKey(x, y);
        this.modifiedTiles[key] = id;
        if (this.tileData[key]) delete this.tileData[key]; 
    }
    isSolid(x, y) { return ID_TO_TILE[this.getTile(x, y)].solid; }

    hitTile(x, y, dmg) {
        const key = this.getKey(x, y);
        if (!this.tileData[key]) this.tileData[key] = { dmg: 0 };
        this.tileData[key].dmg += dmg;
        return this.tileData[key].dmg;
    }
    getTileDamage(x, y) {
        const key = this.getKey(x, y);
        return this.tileData[key] ? this.tileData[key].dmg : 0;
    }

    // --- SAVE/LOAD SYSTEM ---
    exportData() {
        return {
            seed: this.seed,
            modifiedTiles: this.modifiedTiles,
            tileData: this.tileData
        };
    }

    importData(data) {
        if (!data) return;
        this.seed = data.seed;
        this.modifiedTiles = data.modifiedTiles || {};
        this.tileData = data.tileData || {};
    }
}