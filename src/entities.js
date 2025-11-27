import { CONFIG, TILES } from './config.js';
import Utils from './utils.js';

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

export class Projectile {
    constructor(x, y, tx, ty, damage, speed, color, isPlayerOwner) {
        this.x = x; this.y = y;
        this.damage = damage;
        this.color = color;
        this.active = true;
        this.owner = isPlayerOwner ? 'player' : 'enemy';
        this.life = 100; 
        const angle = Math.atan2(ty - y, tx - x);
        this.dx = Math.cos(angle) * speed;
        this.dy = Math.sin(angle) * speed;
    }
    update() { this.x += this.dx; this.y += this.dy; this.life--; if (this.life <= 0) this.active = false; }
    draw(ctx, camX, camY) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class Entity {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.speed = CONFIG.PLAYER_SPEED_BASE;
        this.hp = 100;
        this.damageBuffer = 0;
        this.inventory = { [TILES.GREY.id]: 50, [TILES.BLACK.id]: 20, [TILES.GOLD.id]: 20, [TILES.IRON.id]: 50, [TILES.WOOD.id]: 20, [TILES.GREENS.id]: 0, [TILES.WOOL.id]: 0 };
        this.selectedTile = TILES.GREY.id;
        this.direction = { x: 0, y: 1 };
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
        
        const attemptedX = this.x + dx;
        const attemptedY = this.y + dy;

        if (check(attemptedX, this.y)) this.x = attemptedX;
        if (check(this.x, attemptedY)) this.y = attemptedY;

        if (dx !== 0 || dy !== 0 || (dx === 0 && dy === 0 && this.type === 'player')) {
            this.direction = (dx === 0 && dy === 0) ? { x: 0, y: 0 } : { x: dx, y: dy };
        }

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        this.speed = (world.getTile(gx, gy) === TILES.GREY.id) ? CONFIG.PLAYER_SPEED_ROAD : CONFIG.PLAYER_SPEED_BASE;
    }
}

export class Sheep extends Entity {
    constructor(x, y) {
        super(x, y, 'sheep');
        this.hp = 30;
        this.moveTimer = 0;
        this.moveAngle = 0;
        this.fed = false; // "Love mode"
        this.hasWool = true;
    }

    updateAI(dt, player, world) {
        const dist = Utils.distance(this, player);
        
        // 1. Flee Logic
        if (dist < 150) {
            const angle = Math.atan2(this.y - player.y, this.x - player.x);
            this.move(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, world);
        } 
        // 2. Wander Logic
        else {
            this.moveTimer--;
            if (this.moveTimer <= 0) {
                this.moveTimer = 60 + Math.random() * 60;
                this.moveAngle = Math.random() * 6.28;
            }
            // Move slowly (0.5 speed)
            this.move(Math.cos(this.moveAngle) * 0.5, Math.sin(this.moveAngle) * 0.5, world);
        }
    }
}