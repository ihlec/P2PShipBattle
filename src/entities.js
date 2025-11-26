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
        
        if (check(this.x + dx, this.y)) this.x += dx;
        if (check(this.x, this.y + dy)) this.y += dy;

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        this.speed = (world.getTile(gx, gy) === TILES.GREY.id) ? CONFIG.PLAYER_SPEED_ROAD : CONFIG.PLAYER_SPEED_BASE;
    }
}