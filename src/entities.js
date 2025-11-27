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

// [NEW] Wind Particle for Screen Space
export class WindParticle {
    constructor(screenWidth, screenHeight) {
        this.x = Math.random() * screenWidth;
        this.y = Math.random() * screenHeight;
        this.speed = CONFIG.WIND.SPEED_BASE + Math.random() * CONFIG.WIND.SPEED_VARIATION;
        this.length = 5 + Math.random() * 15; // Trail length
        this.thickness = Math.random() > 0.5 ? 1 : 2;
    }

    update(screenWidth, screenHeight, angle) {
        const dx = Math.cos(angle) * this.speed;
        const dy = Math.sin(angle) * this.speed;
        
        this.x += dx;
        this.y += dy;

        // Screen Wrapping (Toroidal)
        if (this.x < -20) this.x = screenWidth + 20;
        if (this.x > screenWidth + 20) this.x = -20;
        if (this.y < -20) this.y = screenHeight + 20;
        if (this.y > screenHeight + 20) this.y = -20;
    }

    draw(ctx, angle) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        ctx.fillStyle = CONFIG.WIND.COLOR;
        ctx.fillRect(0, 0, this.length, this.thickness);
        ctx.restore();
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

        // Boat Physics State
        this.boatStats = {
            heading: 0,       // Direction facing (radians)
            speed: 0,         // Current forward velocity
            rudder: 0,        // Current rudder angle (visual & physics)
            sailLevel: 0      // 0 = stopped, 1 = full sails (target speed)
        };

        // AI State for NPCs (Chase -> Charge -> Rest)
        this.aiState = { 
            mode: 'chase', // 'chase', 'charge', 'rest'
            tx: 0, 
            ty: 0, 
            timer: 0 
        };
    }
    
    updateBoatMovement(input, dt, world) {
        const stats = this.boatStats;
        const cfg = CONFIG.BOAT;
        const wind = world.wind;

        // 1. Handle Input (Sails and Rudder)
        if (input.up) stats.sailLevel = 1; 
        else if (input.down) stats.sailLevel = -0.5; // Braking/Reversing
        else stats.sailLevel = 0; // Drifting

        if (input.left) stats.rudder -= cfg.RUDDER_SPEED;
        if (input.right) stats.rudder += cfg.RUDDER_SPEED;

        // Clamp Rudder
        if (stats.rudder > cfg.MAX_RUDDER) stats.rudder = cfg.MAX_RUDDER;
        if (stats.rudder < -cfg.MAX_RUDDER) stats.rudder = -cfg.MAX_RUDDER;
        
        if (!input.left && !input.right) {
            stats.rudder *= 0.9;
        }

        // Wind Physics Efficiency
        let windEfficiency = 1.0;
        if (stats.sailLevel > 0) {
            const angleDiff = stats.heading - wind.angle;
            const cos = Math.cos(angleDiff); 
            const normalized = (cos + 1) / 2; 
            windEfficiency = 0.2 + (normalized * 1.0);
        }

        // 2. Physics: Acceleration
        let targetSpeed = stats.sailLevel * cfg.MAX_SPEED * windEfficiency;
        
        if (stats.speed < targetSpeed) stats.speed += cfg.ACCELERATION;
        else if (stats.speed > targetSpeed) stats.speed -= cfg.DECELERATION;

        // Apply Drag
        if (stats.sailLevel === 0) stats.speed *= 0.98;

        // 3. Physics: Turning
        const velocityRatio = Math.abs(stats.speed) / cfg.MAX_SPEED;
        const turnAmount = stats.rudder * (0.2 + (velocityRatio * cfg.TURN_FACTOR));
        
        if (Math.abs(stats.speed) > 0.1) {
             stats.heading += turnAmount;
        }

        // 4. Calculate Vector
        const dx = Math.cos(stats.heading) * stats.speed;
        const dy = Math.sin(stats.heading) * stats.speed;

        // 5. Move
        this.move(dx, dy, world);
        
        this.isMoving = Math.abs(stats.speed) > 0.1;
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
        let collided = false;

        if (verify(attemptedX, this.y)) this.x = attemptedX;
        else collided = true;

        if (verify(this.x, attemptedY)) this.y = attemptedY;
        else collided = true;

        if (collided && this.inBoat) {
            this.boatStats.speed *= 0.5;
        }

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