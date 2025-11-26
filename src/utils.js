import { TILES } from './config.js';

export default class Utils {
    static hash(x, y, seed) {
        let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return h ^ (h >>> 16);
    }
    
    static noise(x, y, seed) {
        const s = Utils.hash(Math.floor(x), Math.floor(y), seed);
        return (s >>> 0) / 4294967296; 
    }
    
    static hsl(h, s, l, x, y, seed, hVar, lVar) {
        const r1 = Utils.noise(x, y, seed); 
        const r2 = Utils.noise(x, y, seed + 100); 
        const newH = h + (r1 * hVar * 2) - hVar;
        const newL = l + (r2 * lVar * 2) - lVar;
        return `hsl(${newH}, ${s}%, ${newL}%)`;
    }

    static lerp(a, b, t) { return a + t * (b - a); }
    static smoothstep(t) { return t * t * (3 - 2 * t); }

    static valueNoise2D(x, y, seed) {
        const iX = Math.floor(x);
        const iY = Math.floor(y);
        const fX = x - iX;
        const fY = y - iY;
        
        const sX = Utils.smoothstep(fX);
        const sY = Utils.smoothstep(fY);
        
        const n00 = Utils.noise(iX, iY, seed);
        const n10 = Utils.noise(iX + 1, iY, seed);
        const n01 = Utils.noise(iX, iY + 1, seed);
        const n11 = Utils.noise(iX + 1, iY + 1, seed);
        
        const ix0 = Utils.lerp(n00, n10, sX);
        const ix1 = Utils.lerp(n01, n11, sX);
        
        return Utils.lerp(ix0, ix1, sY);
    }
    
    static getElevation(x, y, seed) {
        let amp = 1;
        let freq = 0.01; 
        let total = 0;
        let maxAmp = 0;
        
        for(let i = 0; i < 4; i++) {
            total += Utils.valueNoise2D(x * freq, y * freq, seed) * amp;
            maxAmp += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return (total / maxAmp) * 2 - 1; 
    }

    static getBiome(x, y, seed) {
        const n = Utils.getElevation(x, y, seed);
        
        if (n < -0.2) return TILES.DEEP_WATER.id;
        if (n < 0.25) return TILES.WATER.id; 
        if (n < 0.3) return TILES.SAND.id; 
        if (n > 0.6) return TILES.MOUNTAIN.id;
        
        if (n > 0.45) {
            const tNoise = Utils.noise(x, y, seed + 999);
            if (tNoise < 0.6) {
                const rockChance = Utils.noise(x, y, seed + 444);
                if (rockChance < 0.02) return TILES.STONE_BLOCK.id;
                return TILES.TREE.id;
            }
            return TILES.GRASS.id; 
        }
        
        const scattered = Utils.noise(x, y, seed + 888);
        if (scattered < 0.05) {
             const rockChance = Utils.noise(x, y, seed + 555);
             if (rockChance < 0.1) return TILES.STONE_BLOCK.id;
             return TILES.TREE.id;
        }

        const rockNoise = Utils.noise(x, y, seed + 333);
        if (rockNoise < 0.005) return TILES.STONE_BLOCK.id;

        return TILES.GRASS.id;
    }
    
    static distance(e1, e2) { return Math.sqrt((e1.x - e2.x)**2 + (e1.y - e2.y)**2); }
}