import Utils from './utils.js';
import { ID_TO_TILE, CONFIG } from './config.js';

export default class World {
    constructor(seed) {
        this.seed = seed || Math.floor(Math.random() * 10000);
        this.modifiedTiles = {}; 
        this.tileData = {}; 
        
        this.wind = { 
            angle: Math.random() * Math.PI * 2, 
            targetAngle: Math.random() * Math.PI * 2,
            timer: 0 
        };

        // [NEW] Time (0.0 to 1.0)
        // 0.0 = Noon, 0.25 = Sunset, 0.5 = Midnight, 0.75 = Sunrise
        this.time = 0;
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

    update(dt) {
        // Wind
        this.wind.timer += dt;
        if (this.wind.timer > 10000) { 
            this.wind.timer = 0;
            this.wind.targetAngle = this.wind.angle + (Math.random() - 0.5) * 2; 
        }
        const diff = this.wind.targetAngle - this.wind.angle;
        this.wind.angle += diff * 0.001; 

        // [NEW] Time Cycle
        this.time += (1 / CONFIG.DAY_CYCLE.DURATION);
        if (this.time >= 1.0) this.time = 0;
    }

    // [NEW] Calculate Global Darkness level
    getAmbientLight() {
        // 0.0 to 0.25: Day (Light 1.0)
        // 0.25 to 0.35: Sunset (1.0 -> Night)
        // 0.35 to 0.65: Night
        // 0.65 to 0.75: Sunrise (Night -> 1.0)
        
        let darkness = 0;
        const t = this.time;
        
        if (t > 0.25 && t < 0.35) { // Sunset
            darkness = (t - 0.25) * 10; 
        } else if (t >= 0.35 && t <= 0.65) { // Deep Night
            darkness = 1.0;
        } else if (t > 0.65 && t < 0.75) { // Sunrise
            darkness = 1.0 - ((t - 0.65) * 10);
        } else if (t >= 0.75 || t <= 0.25) { // Day
            darkness = 0;
        }

        return Math.max(0, Math.min(1, darkness)) * CONFIG.DAY_CYCLE.NIGHT_OPACITY;
    }

    exportData() {
        return {
            seed: this.seed,
            modifiedTiles: this.modifiedTiles,
            tileData: this.tileData,
            time: this.time
        };
    }

    importData(data) {
        if (!data) return;
        this.seed = data.seed;
        this.modifiedTiles = data.modifiedTiles || {};
        this.tileData = data.tileData || {};
        this.time = data.time || 0;
    }
}