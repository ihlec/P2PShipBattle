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

export class WindParticle {
    constructor(screenWidth, screenHeight) {
        this.x = Math.random() * screenWidth;
        this.y = Math.random() * screenHeight;
        this.speed = CONFIG.WIND.SPEED_BASE + Math.random() * CONFIG.WIND.SPEED_VARIATION;
        this.length = 5 + Math.random() * 15; 
        this.thickness = Math.random() > 0.5 ? 1 : 2;
    }

    update(screenWidth, screenHeight, angle) {
        const dx = Math.cos(angle) * this.speed;
        const dy = Math.sin(angle) * this.speed;
        
        this.x += dx;
        this.y += dy;

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
    update() { 
        this.x += this.dx; 
        this.y += this.dy; 
        this.life--; 
        if (this.life <= 0) {
            this.active = false; 
            return 'expired'; 
        }
        return 'active';
    }
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
        } else if (this.type === 'cannonball') {
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(this.x - camX, this.y - camY, 5, 0, Math.PI * 2);
            ctx.fill();
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
            heading: 0,       
            speed: 0,         
            rudder: 0,        
            sailLevel: 0,
            cooldownLeft: 0,
            cooldownRight: 0
        };

        // AI State for NPCs
        this.aiState = { 
            mode: 'chase', 
            tx: 0, 
            ty: 0, 
            timer: 0 
        };
    }
    
    shootBroadside(game, side) { 
        const stats = this.boatStats;
        if (side === 'left' && stats.cooldownLeft > 0) return;
        if (side === 'right' && stats.cooldownRight > 0) return;

        let fireAngle = stats.heading + (side === 'right' ? Math.PI/2 : -Math.PI/2);
        
        // Fire Salvo of 3
        const offsets = [-10, 0, 10]; 
        offsets.forEach(off => {
            const spawnX = this.x + Math.cos(stats.heading) * off;
            const spawnY = this.y + Math.sin(stats.heading) * off;

            const tx = spawnX + Math.cos(fireAngle) * 100;
            const ty = spawnY + Math.sin(fireAngle) * 100;

            const isPlayer = this.type === 'player' || (this.type === 'boat' && this.owner === 'player');

            const proj = new Projectile(
                spawnX, spawnY, tx, ty, 
                CONFIG.BOAT.CANNON_DAMAGE, 
                CONFIG.BOAT.CANNON_SPEED, 
                '#000', isPlayer, 'cannonball'
            );
            proj.life = CONFIG.BOAT.CANNON_RANGE;
            
            proj.angle += (Math.random() - 0.5) * 0.1;
            proj.dx = Math.cos(proj.angle) * CONFIG.BOAT.CANNON_SPEED;
            proj.dy = Math.sin(proj.angle) * CONFIG.BOAT.CANNON_SPEED;

            game.projectiles.push(proj);
            game.spawnParticles(spawnX + Math.cos(fireAngle)*10, spawnY + Math.sin(fireAngle)*10, '#ddd', 5);
        });

        const cd = (this.owner === 'enemy') ? CONFIG.BOAT.ENEMY_COOLDOWN : CONFIG.BOAT.BROADSIDE_COOLDOWN;
        if (side === 'left') stats.cooldownLeft = cd;
        if (side === 'right') stats.cooldownRight = cd;
    }

    updateBoatMovement(input, dt, world) {
        const stats = this.boatStats;
        const cfg = CONFIG.BOAT;
        const wind = world.wind;

        if (stats.cooldownLeft > 0) stats.cooldownLeft--;
        if (stats.cooldownRight > 0) stats.cooldownRight--;

        if (input.up) stats.sailLevel = 1; 
        else if (input.down) stats.sailLevel = -0.5; 
        else stats.sailLevel = 0; 

        if (input.left) stats.rudder -= cfg.RUDDER_SPEED;
        if (input.right) stats.rudder += cfg.RUDDER_SPEED;

        if (stats.rudder > cfg.MAX_RUDDER) stats.rudder = cfg.MAX_RUDDER;
        if (stats.rudder < -cfg.MAX_RUDDER) stats.rudder = -cfg.MAX_RUDDER;
        
        if (!input.left && !input.right) {
            stats.rudder *= 0.9;
        }

        let windEfficiency = 1.0;
        if (stats.sailLevel > 0) {
            const angleDiff = stats.heading - wind.angle;
            const cos = Math.cos(angleDiff); 
            const normalized = (cos + 1) / 2; 
            windEfficiency = 0.2 + (normalized * 1.0);
        }

        let targetSpeed = stats.sailLevel * cfg.MAX_SPEED * windEfficiency;
        
        if (stats.speed < targetSpeed) stats.speed += cfg.ACCELERATION;
        else if (stats.speed > targetSpeed) stats.speed -= cfg.DECELERATION;

        if (stats.sailLevel === 0) stats.speed *= 0.98;

        const velocityRatio = Math.abs(stats.speed) / cfg.MAX_SPEED;
        const turnAmount = stats.rudder * (0.2 + (velocityRatio * cfg.TURN_FACTOR));
        
        if (Math.abs(stats.speed) > 0.1) {
             stats.heading += turnAmount;
        }

        const dx = Math.cos(stats.heading) * stats.speed;
        const dy = Math.sin(stats.heading) * stats.speed;

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
        
        // 30 seconds (1800 frames) to 5 minutes (18000 frames)
        this.travelTimer = (this.owner === 'enemy') ? 1800 + Math.random() * 16200 : 0;
    }

    updateAI(dt, player, world, game) {
        if (this.owner !== 'enemy') return;

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        const tile = world.getTile(gx, gy);
        const isWater = (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id);

        if (!this.isLanded && isWater) {
            
            // Check travel timer
            if (this.travelTimer > 0) {
                this.travelTimer--;
            }

            const dist = Utils.distance(this, player);
            const input = { up: false, down: false, left: false, right: false };
            
            // --- STEERING LOGIC ---
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let heading = this.boatStats.heading % (Math.PI * 2);
            if (heading > Math.PI) heading -= Math.PI * 2;
            if (heading < -Math.PI) heading += Math.PI * 2;

            let desiredAngle = angleToPlayer;

            if (this.travelTimer > 0) {
                // PATROL MODE: Circle player or keep distance
                desiredAngle = angleToPlayer + Math.PI / 2;
                if (dist > 600) desiredAngle = angleToPlayer + Math.PI / 4;
            } else {
                // INVASION/ATTACK MODE
                if (dist < CONFIG.BOAT.ENEMY_ENGAGE_RANGE) {
                    desiredAngle = angleToPlayer + Math.PI / 2; // Flank to fire
                } else {
                    desiredAngle = angleToPlayer; // Chase
                }
            }

            let diff = desiredAngle - heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) > 0.1) {
                if (diff > 0) input.right = true;
                else input.left = true;
            }

            if (Math.abs(diff) < 1.0) input.up = true;
            else input.up = true; 

            this.updateBoatMovement(input, dt, world);

            // --- FIRING LOGIC ---
            const angleToTarget = Math.atan2(player.y - this.y, player.x - this.x);
            let angleRelative = angleToTarget - heading;
            while (angleRelative > Math.PI) angleRelative -= Math.PI * 2;
            while (angleRelative < -Math.PI) angleRelative += Math.PI * 2;

            const broadsideThreshold = 0.4; 
            
            if (Math.abs(angleRelative - (-Math.PI/2)) < broadsideThreshold) {
                this.shootBroadside(game, 'left');
            }
            if (Math.abs(angleRelative - (Math.PI/2)) < broadsideThreshold) {
                this.shootBroadside(game, 'right');
            }

        } else if (this.isLanded) {
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
                }
            }
        } else {
            // Transition from Water to Land (Beaching)
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const prevX = this.x;
            const prevY = this.y;
            
            this.move(Math.cos(angle) * 1.0, Math.sin(angle) * 1.0, world); 

            if (Math.abs(this.x - prevX) < 0.1 && Math.abs(this.y - prevY) < 0.1) {
                this.isLanded = true;
                this.boatStats.speed = 0; 
                game.spawnText(this.x, this.y, "LANDED!", "#f00");
            }
        }
    }
}