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
    constructor(x, y, tx, ty, damage, speed, color, isPlayerOwner, type = 'stone') {
        this.x = x; this.y = y;
        this.damage = damage;
        this.color = color;
        this.active = true;
        this.owner = isPlayerOwner ? 'player' : 'enemy';
        this.life = 100; 
        this.type = type; 
        
        this.angle = Math.atan2(ty - y, tx - x);
        this.dx = Math.cos(this.angle) * speed;
        this.dy = Math.sin(this.angle) * speed;
    }
    update() { this.x += this.dx; this.y += this.dy; this.life--; if (this.life <= 0) this.active = false; }
    draw(ctx, camX, camY) {
        if (this.type === 'spear') {
            ctx.save();
            ctx.translate(this.x - camX, this.y - camY);
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color;
            ctx.fillRect(-10, -2, 20, 4); 
            ctx.fillStyle = '#fff'; 
            ctx.fillRect(10, -2, 4, 4); 
            ctx.restore();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x - camX, this.y - camY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export class Entity {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.speed = CONFIG.PLAYER_SPEED_BASE;
        this.hp = 100;
        this.maxHp = 100; 
        this.damageBuffer = 0;
        this.inventory = { [TILES.GREY.id]: 50, [TILES.BLACK.id]: 20, [TILES.GOLD.id]: 20, [TILES.IRON.id]: 50, [TILES.WOOD.id]: 20, [TILES.GREENS.id]: 0, [TILES.WOOL.id]: 0 };
        
        this.selectedTile = null; 
        
        this.direction = { x: 0, y: 1 };
        this.isMoving = false;
        this.moveTime = 0;
        this.inBoat = false; 
        this.equippedWeapon = null; 
        
        this.activeRange = TILES.GREY.id; 
        this.activeMelee = 'hand';   

        // AI State for NPCs (Chase -> Charge -> Rest)
        this.aiState = { 
            mode: 'chase', // 'chase', 'charge', 'rest'
            tx: 0, 
            ty: 0, 
            timer: 0 
        };
    }
    
    move(dx, dy, world) {
        const half = (CONFIG.TILE_SIZE / 2) - 4; 
        
        const check = (tx, ty) => {
            const gx = Math.floor(tx / CONFIG.TILE_SIZE);
            const gy = Math.floor(ty / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);
            
            if (this.inBoat) {
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return true;
                return false; 
            } else {
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return false;
                if (world.isSolid(gx, gy)) return false;
                return true;
            }
        };
        
        const verify = (nx, ny) => {
            if (!check(nx - half, ny - half)) return false;
            if (!check(nx + half, ny - half)) return false;
            if (!check(nx - half, ny + half)) return false;
            if (!check(nx + half, ny + half)) return false;
            return true;
        }

        const attemptedX = this.x + dx;
        const attemptedY = this.y + dy;

        if (verify(attemptedX, this.y)) this.x = attemptedX;
        if (verify(this.x, attemptedY)) this.y = attemptedY;

        if (dx !== 0 || dy !== 0) {
            this.direction = { x: dx, y: dy };
            this.isMoving = true;
        } else if (this.type === 'player') {
            this.direction = { x: 0, y: 0 };
            this.isMoving = false;
        }

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        const currentTile = world.getTile(gx, gy);

        if (this.inBoat) {
            if (currentTile === TILES.DEEP_WATER.id) this.speed = CONFIG.PLAYER_SPEED_DEEP_WATER;
            else this.speed = CONFIG.PLAYER_SPEED_WATER;
        } else {
            this.speed = (currentTile === TILES.GREY.id) ? CONFIG.PLAYER_SPEED_ROAD : CONFIG.PLAYER_SPEED_BASE;
        }
    }
}

export class Sheep extends Entity {
    constructor(x, y) {
        super(x, y, 'sheep');
        this.hp = 30;
        this.maxHp = 30;
        this.moveTimer = 0;
        this.moveAngle = 0;
        this.fed = false; 
        this.hasWool = true;
        this.woolTimer = 0;
    }

    updateAI(dt, player, world) {
        if (!this.hasWool) {
            this.woolTimer--;
            if (this.woolTimer <= 0) this.hasWool = true;
        }

        const dist = Utils.distance(this, player);
        
        if (dist < 150) {
            const angle = Math.atan2(this.y - player.y, this.x - player.x);
            this.move(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, world);
        } else {
            this.moveTimer--;
            if (this.moveTimer <= 0) {
                this.moveTimer = 60 + Math.random() * 60;
                this.moveAngle = Math.random() * 6.28;
            }
            this.move(Math.cos(this.moveAngle) * 0.5, Math.sin(this.moveAngle) * 0.5, world);
        }
    }
}

export class Boat extends Entity {
    constructor(x, y, owner = 'player') {
        super(x, y, 'boat');
        this.hp = 100;
        this.maxHp = 100;
        this.owner = owner;
        this.inBoat = true; 
        this.isLanded = false;
        this.activeMinion = null; 
        this.respawnTimer = 0;
        this.nextRespawnTime = 0; 
    }

    updateAI(dt, player, world, game) {
        if (this.owner !== 'enemy') return;

        if (this.isLanded) {
            const minionAlive = this.activeMinion && 
                                this.activeMinion.hp > 0 && 
                                game.npcs.includes(this.activeMinion);

            if (!minionAlive) {
                this.respawnTimer++;
                
                if (this.respawnTimer > this.nextRespawnTime) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    const spawnX = this.x + Math.cos(angle) * 32;
                    const spawnY = this.y + Math.sin(angle) * 32;
                    
                    const minion = new Entity(spawnX, spawnY, 'npc');
                    game.npcs.push(minion);
                    this.activeMinion = minion;
                    
                    game.spawnParticles(this.x, this.y, '#ff0000', 8);
                    game.spawnText(this.x, this.y, "INVASION!", "#f00"); 

                    this.respawnTimer = 0;
                    
                    const minFrames = 7200;
                    const maxFrames = 72000;
                    this.nextRespawnTime = minFrames + Math.random() * (maxFrames - minFrames);
                    
                    console.log(`Next invasion spawn in ${(this.nextRespawnTime/60/60).toFixed(2)} mins`);
                }
            }
        } else {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const prevX = this.x;
            const prevY = this.y;
            
            this.move(Math.cos(angle) * 1.0, Math.sin(angle) * 1.0, world); 

            if (Math.abs(this.x - prevX) < 0.1 && Math.abs(this.y - prevY) < 0.1) {
                this.isLanded = true;
                game.spawnText(this.x, this.y, "INVASION!", "#f00");
            }
        }
    }
}