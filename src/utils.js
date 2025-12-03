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
    
    static hsl(hue, saturation, lightness, x, y, seed, hueVariance, lightVariance) {
        const r1 = Utils.noise(x, y, seed); 
        const r2 = Utils.noise(x, y, seed + 100); 
        const newHue = hue + (r1 * hueVariance * 2) - hueVariance;
        const newLight = lightness + (r2 * lightVariance * 2) - lightVariance;
        return `hsl(${newHue}, ${saturation}%, ${newLight}%)`;
    }

    static lerp(start, end, amount) { 
        return start + amount * (end - start); 
    }
    
    static lerpAngle(start, end, amount) {
        let difference = end - start;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        return start + difference * amount;
    }

    static smoothstep(t) { 
        return t * t * (3 - 2 * t); 
    }

    static valueNoise2D(x, y, seed) {
        const integerX = Math.floor(x);
        const integerY = Math.floor(y);
        const fractionalX = x - integerX;
        const fractionalY = y - integerY;
        
        const smoothX = Utils.smoothstep(fractionalX);
        const smoothY = Utils.smoothstep(fractionalY);
        
        const n00 = Utils.noise(integerX, integerY, seed);
        const n10 = Utils.noise(integerX + 1, integerY, seed);
        const n01 = Utils.noise(integerX, integerY + 1, seed);
        const n11 = Utils.noise(integerX + 1, integerY + 1, seed);
        
        const interpX0 = Utils.lerp(n00, n10, smoothX);
        const interpX1 = Utils.lerp(n01, n11, smoothX);
        
        return Utils.lerp(interpX0, interpX1, smoothY);
    }
    
    static getElevation(x, y, seed) {
        let amplitude = 1;
        let frequency = 0.01; 
        let total = 0;
        let maxAmplitude = 0;
        
        for(let i = 0; i < 4; i++) {
            total += Utils.valueNoise2D(x * frequency, y * frequency, seed) * amplitude;
            maxAmplitude += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        return (total / maxAmplitude) * 2 - 1; 
    }

    static getBiome(x, y, seed) {
        const elevation = Utils.getElevation(x, y, seed);
        
        if (elevation < -0.2) return TILES.DEEP_WATER.id;
        if (elevation < 0.25) return TILES.WATER.id; 
        if (elevation < 0.3) return TILES.SAND.id; 
        if (elevation > 0.6) return TILES.MOUNTAIN.id;
        
        if (elevation > 0.45) {
            const treeNoise = Utils.noise(x, y, seed + 999);
            if (treeNoise < 0.6) {
                const rockChance = Utils.noise(x, y, seed + 444);
                if (rockChance < 0.02) return TILES.STONE_BLOCK.id;
                return TILES.TREE.id;
            }
            return TILES.GRASS.id; 
        }
        
        const scatteredNoise = Utils.noise(x, y, seed + 888);
        if (scatteredNoise < 0.05) {
             const rockChance = Utils.noise(x, y, seed + 555);
             if (rockChance < 0.1) return TILES.STONE_BLOCK.id;
             return TILES.TREE.id;
        }

        const rockNoise = Utils.noise(x, y, seed + 333);
        if (rockNoise < 0.005) return TILES.STONE_BLOCK.id;

        return TILES.GRASS.id;
    }
    
    static distance(entity1, entity2) { 
        return Math.sqrt((entity1.x - entity2.x)**2 + (entity1.y - entity2.y)**2); 
    }
}