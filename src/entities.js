import { CONFIG, TILES } from './config.js';

export class Particle {
    constructor(x, y, color, dx, dy, life) {
        this.x = x; this.y = y; this.color = color;
        this.dx = dx; this.dy = dy; 
        this.life = life; this.maxLife = life;
    }
    update() { this.x += this.dx; this.y += this.dy; this.life--; }
    draw(ctx, camX, camY) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - camX, this.y - camY, 4, 4);
        ctx.globalAlpha = 1.0;
    }
}

export class Entity {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.speed = CONFIG.PLAYER_SPEED_BASE;
        this.hp = 100;
        this.damageBuffer = 0;
        this.inventory = { [TILES.GREY.id]: 50, [TILES.BLACK.id]: 20, [TILES.GOLD.id]: 20, [TILES.IRON.id]: 50, [TILES.WOOD.id]: 20, [TILES.GREENS.id]: 0 };
        this.selectedTile = TILES.GREY.id;
        this.direction = { x: 0, y: 1 }; // Initialize direction
    }
    
    move(dx, dy, world) {
        const half = (CONFIG.TILE_SIZE / 2) - 4; 
        const check = (tx, ty) => {
            if (world.isSolid(Math.floor((tx - half)/CONFIG.TILE_SIZE), Math.floor((ty - half)/CONFIG.TILE_SIZE))) return false;
            if (world.isSolid(Math.floor((tx + half)/CONFIG.TILE_SIZE), Math.floor((ty - half)/CONFIG.TILE_SIZE))) return false;
            if (world.isSolid(Math.floor((tx - half)/CONFIG.TILE_SIZE), Math.floor((ty + half)/CONFIG.TILE_SIZE))) return false;
            if (world.isSolid(Math.floor((tx + half)/CONFIG.TILE_SIZE), Math.floor((ty + half)/CONFIG.TILE_SIZE))) return false;
            return true;
        };
        
        // Store requested positions before potential collision check modifications
        const attemptedX = this.x + dx;
        const attemptedY = this.y + dy;

        if (check(attemptedX, this.y)) this.x = attemptedX;
        if (check(this.x, attemptedY)) this.y = attemptedY;

        // Update direction only if there was a requested movement (dx != 0 or dy != 0)
        // or if the movement was explicitly zero (to handle the stationary fix in game.js)
        if (dx !== 0 || dy !== 0 || (dx === 0 && dy === 0 && this.type === 'player')) {
            // Normalize direction if moving, or explicitly set to 0,0 if stationary
            this.direction = (dx === 0 && dy === 0) ? { x: 0, y: 0 } : { x: dx, y: dy };
        }

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        this.speed = (world.getTile(gx, gy) === TILES.GREY.id) ? CONFIG.PLAYER_SPEED_ROAD : CONFIG.PLAYER_SPEED_BASE;
    }
}