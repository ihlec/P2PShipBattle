import { CONFIG, TILES } from './config.js';
import Utils from './utils.js';
import { WakeParticle } from './particles.js'; // Import needed for Boat

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
        this.id = Math.random().toString(36).substr(2, 9);
        this.x = x; this.y = y; this.type = type;
        this.speed = CONFIG.PLAYER_SPEED_BASE;
        this.hp = 100;
        this.maxHp = 100; 
        this.damageBuffer = 0;
        this.inventory = { [TILES.GREY.id]: 50, [TILES.BLACK.id]: 20, [TILES.GOLD.id]: 20, [TILES.IRON.id]: 50, [TILES.WOOD.id]: 20, [TILES.GREENS.id]: 0, [TILES.WOOL.id]: 0 };
        this.selectedTile = null; 
        this.direction = { x: 0, y: 1 };
        this.velocity = { x: 0, y: 0 };
        this.isMoving = false;
        this.moveTime = 0;
        this.inBoat = false; 
        this.equippedWeapon = null; 
        this.activeRange = TILES.GREY.id; 
        this.activeMelee = 'hand';   
        this.boatStats = { heading: 0, speed: 0, rudder: 0, sailLevel: 0, cooldownLeft: 0, cooldownRight: 0 };
        this.aiState = { mode: 'chase', tackState: 1, tackTimer: 0 };
    }
    
    shootBroadside(game, side) { 
        const stats = this.boatStats;
        if (side === 'left' && stats.cooldownLeft > 0) return;
        if (side === 'right' && stats.cooldownRight > 0) return;
        let fireAngle = stats.heading + (side === 'right' ? Math.PI/2 : -Math.PI/2);
        const offsets = [10, -22]; 
        offsets.forEach(off => {
            const spawnX = this.x + Math.cos(stats.heading) * off;
            const spawnY = this.y + Math.sin(stats.heading) * off;
            const tx = spawnX + Math.cos(fireAngle) * 100;
            const ty = spawnY + Math.sin(fireAngle) * 100;
            const isPlayer = this.type === 'player' || (this.type === 'boat' && this.owner === 'player');
            const proj = new Projectile(spawnX, spawnY, tx, ty, CONFIG.BOAT.CANNON_DAMAGE, CONFIG.BOAT.CANNON_SPEED, '#000', isPlayer, 'cannonball');
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

    updateBoatMovement(input, dt, world, game) {
        const stats = this.boatStats;
        const cfg = CONFIG.BOAT;
        if (stats.cooldownLeft > 0) stats.cooldownLeft--;
        if (stats.cooldownRight > 0) stats.cooldownRight--;
        if (input.left) stats.rudder -= cfg.RUDDER_SPEED;
        if (input.right) stats.rudder += cfg.RUDDER_SPEED;
        if (stats.rudder > cfg.MAX_RUDDER) stats.rudder = cfg.MAX_RUDDER;
        if (stats.rudder < -cfg.MAX_RUDDER) stats.rudder = -cfg.MAX_RUDDER;
        if (!input.left && !input.right) stats.rudder *= 0.95;
        if (Math.abs(stats.rudder) > 0.001) stats.heading += stats.rudder * (cfg.TURN_FACTOR * 0.25);
        const windDot = Math.cos(world.wind.angle - stats.heading);
        let windEfficiency = 0;
        if (windDot < -0.8) windEfficiency = (windDot + 1.0); 
        else windEfficiency = (0.5 + 0.5 * windDot) + (0.5 * (1 - Math.abs(windDot)));
        windEfficiency = Math.max(0, windEfficiency);
        if (input.up) stats.sailLevel = Math.min(1, stats.sailLevel + 0.02);
        else if (input.down) stats.sailLevel = Math.max(-0.25, stats.sailLevel - 0.05); 
        let powerFactor = 0.40; 
        let effectiveThrust = 0;
        if (stats.sailLevel > 0) effectiveThrust = stats.sailLevel * cfg.ACCELERATION * powerFactor * windEfficiency;
        else effectiveThrust = stats.sailLevel * cfg.ACCELERATION * 0.2; 
        const accX = Math.cos(stats.heading) * effectiveThrust;
        const accY = Math.sin(stats.heading) * effectiveThrust;
        this.velocity.x += accX;
        this.velocity.y += accY;
        this.velocity.x *= 0.995; 
        this.velocity.y *= 0.995;
        const speed = Math.sqrt(this.velocity.x**2 + this.velocity.y**2);
        if (speed > 0.001) {
            const moveAngle = Math.atan2(this.velocity.y, this.velocity.x);
            const angleDiff = moveAngle - stats.heading;
            const forwardSpeed = Math.cos(angleDiff) * speed;
            const lateralSpeed = Math.sin(angleDiff) * speed;
            const newForward = forwardSpeed; 
            const newLateral = lateralSpeed * 0.90; 
            this.velocity.x = Math.cos(stats.heading) * newForward + Math.cos(stats.heading + Math.PI/2) * newLateral;
            this.velocity.y = Math.sin(stats.heading) * newForward + Math.sin(stats.heading + Math.PI/2) * newLateral;
        }
        const pixelScale = 15; 
        this.move(this.velocity.x * pixelScale, this.velocity.y * pixelScale, world);
        stats.speed = Math.sqrt(this.velocity.x**2 + this.velocity.y**2) * pixelScale;
        this.isMoving = stats.speed > 0.1;
        if (game && stats.speed > 0.5 && Math.random() < 0.3) {
            const sternX = this.x - Math.cos(stats.heading) * 40;
            const sternY = this.y - Math.sin(stats.heading) * 40;
            const w1 = new WakeParticle(sternX, sternY, stats.heading + Math.PI + 0.2);
            const w2 = new WakeParticle(sternX, sternY, stats.heading + Math.PI - 0.2);
            if (!game.particles) game.particles = [];
            game.particles.push(w1, w2);
        }
    }

    move(dx, dy, world) {
        const half = (CONFIG.TILE_SIZE / 2) - 4; 
        const check = (tx, ty) => {
            const gx = Math.floor(tx / CONFIG.TILE_SIZE);
            const gy = Math.floor(ty / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);
            if (this.inBoat || this.type === 'boat') {
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
        else { collided = true; this.velocity.x *= -0.5; }
        if (verify(this.x, attemptedY)) this.y = attemptedY;
        else { collided = true; this.velocity.y *= -0.5; }
        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        if (world.isSolid(gx, gy) && !this.inBoat && this.type !== 'boat') {
             const pushX = dx !== 0 ? Math.sign(dx) : (Math.random()-0.5);
             const pushY = dy !== 0 ? Math.sign(dy) : (Math.random()-0.5);
             this.x += pushX * 2;
             this.y += pushY * 2;
        }
        if (dx !== 0 || dy !== 0) {
            this.direction = { x: dx, y: dy };
            this.isMoving = true;
        } else if (this.type === 'player') {
            this.direction = { x: 0, y: 0 };
            this.isMoving = false;
        }
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

    updateAI(dt, player, world, game) {
        if (!this.hasWool) {
            this.woolTimer--;
            if (this.woolTimer <= 0) this.hasWool = true;
        }
        if (!game || !game.peers) return;
        const allPlayers = [game.player, ...Object.values(game.peers)];
        let closestPlayer = null;
        let minDist = 150; 
        for (const p of allPlayers) {
            const d = Utils.distance(this, p);
            if (d < minDist) {
                minDist = d;
                closestPlayer = p;
            }
        }
        if (closestPlayer) {
            const angle = Math.atan2(this.y - closestPlayer.y, this.x - closestPlayer.x);
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
        this.travelTimer = (this.owner === 'enemy') ? 1800 + Math.random() * 16200 : 0;
    }

    updateAI(dt, player, world, game) {
        if (this.owner !== 'enemy') return;
        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        const tile = world.getTile(gx, gy);
        const isWater = (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id);
        if (!this.isLanded && isWater) {
            const dist = Utils.distance(this, player);
            const input = { up: false, down: false, left: false, right: false };
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let heading = this.boatStats.heading % (Math.PI * 2);
            if (heading > Math.PI) heading -= Math.PI * 2;
            if (heading < -Math.PI) heading += Math.PI * 2;
            let desiredAngle = angleToPlayer;
            const BROADSIDE_RANGE = 300;
            const MIN_RANGE = 150;
            if (dist < BROADSIDE_RANGE && dist > MIN_RANGE) {
                let relative = angleToPlayer - heading;
                while (relative > Math.PI) relative -= Math.PI * 2;
                while (relative < -Math.PI) relative += Math.PI * 2;
                if (relative > 0) desiredAngle = angleToPlayer - Math.PI/2; 
                else desiredAngle = angleToPlayer + Math.PI/2; 
            }
            const windDir = world.wind.angle;
            let windDiff = Math.cos(windDir - desiredAngle);
            if (windDiff < -0.5) {
                this.aiState.tackTimer++;
                if (this.aiState.tackTimer > 400) { 
                    this.aiState.tackState *= -1;
                    this.aiState.tackTimer = 0;
                }
                desiredAngle = windDir + (Math.PI * 0.75 * this.aiState.tackState);
            }
            let diff = desiredAngle - heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > 0.1) {
                if (diff > 0) input.right = true;
                else input.left = true;
            }
            if (Math.abs(diff) < 1.0) input.up = true; 
            else if (Math.abs(diff) > 2.0) input.down = true; 
            else input.up = false; 
            this.updateBoatMovement(input, dt, world, game);
            let angleRelative = angleToPlayer - heading;
            while (angleRelative > Math.PI) angleRelative -= Math.PI * 2;
            while (angleRelative < -Math.PI) angleRelative += Math.PI * 2;
            const broadsideThreshold = 0.3; 
            if (Math.abs(angleRelative - (-Math.PI/2)) < broadsideThreshold) this.shootBroadside(game, 'left');
            if (Math.abs(angleRelative - (Math.PI/2)) < broadsideThreshold) this.shootBroadside(game, 'right');
        } else if (this.isLanded) {
            const minionAlive = this.activeMinion && this.activeMinion.hp > 0 && game.npcs.includes(this.activeMinion);
            if (!minionAlive) {
                this.respawnTimer++;
                if (this.respawnTimer > this.nextRespawnTime) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    let spawnX = this.x;
                    let spawnY = this.y;
                    let validSpotFound = false;
                    for(let d = 32; d <= 96; d += 16) {
                        const angles = [0, -0.6, 0.6, -1.2, 1.2]; 
                        for(let a of angles) {
                            const checkAngle = angle + a;
                            const tx = this.x + Math.cos(checkAngle) * d;
                            const ty = this.y + Math.sin(checkAngle) * d;
                            const gx = Math.floor(tx / CONFIG.TILE_SIZE);
                            const gy = Math.floor(ty / CONFIG.TILE_SIZE);
                            if (!world.isSolid(gx, gy)) {
                                const t = world.getTile(gx, gy);
                                if (t !== TILES.WATER.id && t !== TILES.DEEP_WATER.id) {
                                    spawnX = tx;
                                    spawnY = ty;
                                    validSpotFound = true;
                                    break;
                                }
                            }
                        }
                        if (validSpotFound) break;
                    }
                    if (validSpotFound) {
                        const minion = new Entity(spawnX, spawnY, 'npc');
                        game.npcs.push(minion);
                        this.activeMinion = minion;
                        game.spawnParticles(this.x, this.y, '#ff0000', 8);
                        game.spawnText(this.x, this.y, "INVASION!", "#f00"); 
                        this.respawnTimer = 0;
                        const minFrames = 7200;
                        const maxFrames = 72000;
                        this.nextRespawnTime = minFrames + Math.random() * (maxFrames - minFrames);
                    } else {
                         this.respawnTimer -= 100;
                    }
                }
            }
        } else {
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