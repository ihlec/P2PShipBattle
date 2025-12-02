import { CONFIG, TILES, ID_TO_TILE } from './config.js';
import Utils from './utils.js';
import { WakeParticle } from './particles.js';

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
        // Shadow for Range Projectiles
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY + 12, 4, 0, Math.PI * 2);
        ctx.fill();

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
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;

        this.type = type;
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

        this.boatStats = {
            heading: 0,
            targetHeading: 0,
            speed: 0,
            rudder: 0,
            sailLevel: 0,
            cooldownLeft: 0,
            cooldownRight: 0
        };

        this.aiState = { mode: 'chase', tackState: 1, tackTimer: 0 };
        this.ramCooldown = 0;
    }

    // [NEW] Handle Impact Logic
    handleImpact(game, tx, ty) {
        if (this.ramCooldown > 0) {
            this.ramCooldown--;
            return;
        }

        // Only NPCs and Enemy Ships (Entity type 'npc' or Boat with 'enemy' owner) deal contact damage
        if (this.type !== 'npc' && !(this.type === 'boat' && this.owner === 'enemy')) return;

        const gx = Math.floor(tx / CONFIG.TILE_SIZE);
        const gy = Math.floor(ty / CONFIG.TILE_SIZE);
        const tile = game.world.getTile(gx, gy);
        const def = ID_TO_TILE[tile];

        let hit = false;
        const impactDamageStructure = CONFIG.NPC_RAM.DAMAGE_STRUCTURE;
        const impactDamageBoat = CONFIG.NPC_RAM.DAMAGE_BOAT;


        // 1. Check Structure Collision (Walls/Towers)
        if (def && (def.solid || def.hp) && !def.isWater) {
            // Apply damage to tile
            game.world.hitTile(gx, gy, impactDamageStructure);

            // Visuals
            game.spawnParticles(tx, ty, '#fff', 3);
            game.spawnText(tx, ty, `-${impactDamageStructure}`, '#f00');

            // Check if destroyed
            if (def.hp) {
                const currentDmg = game.world.getTileDamage(gx, gy);
                if (currentDmg >= def.hp) {
                    const biome = Utils.getBiome(gx, gy, game.world.seed);
                    let restoreId = TILES.GRASS.id;
                    if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                    if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;
                    
                    game.network.requestRemove(gx, gy, restoreId);
                    game.recalcCannons();
                }
            }
            hit = true;
        }

        // 2. Check Boat Collision (Enemy Ship ramming Player Ship)
        const impactPoint = { x: tx, y: ty };
        
        const victimBoat = game.boats.find(b =>
            b.owner === 'player' &&
            Utils.distance({ x: b.x, y: b.y }, impactPoint) < 64
        );

        if (victimBoat && (this.type === 'boat' || (this.type === 'npc' && this.owner === 'enemy'))) {
            // Ensure NPC land units can damage boats on impact
            const damageToApply = this.type === 'boat' ? impactDamageBoat : 30; // Land NPC deals less damage to boat

            victimBoat.hp -= damageToApply;
            game.spawnParticles(victimBoat.x, victimBoat.y, '#8B4513', 6);
            game.spawnText(victimBoat.x, victimBoat.y, `CRASH! -${damageToApply}`, '#ff0000');
            hit = true;
        }

        if (hit) {
            this.ramCooldown = CONFIG.NPC_RAM.COOLDOWN;
            this.velocity.x *= -0.5;
            this.velocity.y *= -0.5;
            
            if (this.type === 'npc') {
                 this.velocity.x = 0;
                 this.velocity.y = 0;
            }
        }
    }

    shootBroadside(game, side) {
        const stats = this.boatStats;
        if (side === 'left' && stats.cooldownLeft > 0) return;
        if (side === 'right' && stats.cooldownRight > 0) return;
        
        let fireAngle = stats.heading + (side === 'right' ? Math.PI / 2 : -Math.PI / 2);
        
        // [FIXED] Use offset perpendicular to the boat's heading to place the projectile safely outside the hull.
        const SIDE_OFFSET = 40; // Increased to 40 pixels for safety (Boat radius is ~32)
        
        // Calculate the vector for the side offset (perpendicular to heading)
        const sideDx = Math.cos(fireAngle) * SIDE_OFFSET;
        const sideDy = Math.sin(fireAngle) * SIDE_OFFSET;
        
        // Use two cannon spawn points (front and back of the mast)
        const offsets = [-20, 20]; // Offsets along the ship's length (heading)

        offsets.forEach(lengthOffset => {
            // Calculate final spawn point: Boat Center + Side Offset + Length Offset
            const spawnX = this.x + sideDx + Math.cos(stats.heading) * lengthOffset;
            const spawnY = this.y + sideDy + Math.sin(stats.heading) * lengthOffset;
            
            // Calculate target point
            const tx = spawnX + Math.cos(fireAngle) * 100;
            const ty = spawnY + Math.sin(fireAngle) * 100;

            const isPlayer = this.type === 'player' || (this.type === 'boat' && this.owner === 'player');
            const proj = new Projectile(spawnX, spawnY, tx, ty, CONFIG.BOAT.CANNON_DAMAGE, CONFIG.BOAT.CANNON_SPEED, '#000', isPlayer, 'cannonball');
            proj.life = CONFIG.BOAT.CANNON_RANGE;
            proj.angle += (Math.random() - 0.5) * 0.1;
            proj.dx = Math.cos(proj.angle) * CONFIG.BOAT.CANNON_SPEED;
            proj.dy = Math.sin(proj.angle) * CONFIG.BOAT.CANNON_SPEED;
            game.projectiles.push(proj);
            game.spawnParticles(spawnX + Math.cos(fireAngle) * 10, spawnY + Math.sin(fireAngle) * 10, '#ddd', 5);
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
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (speed > 0.001) {
            const moveAngle = Math.atan2(this.velocity.y, this.velocity.x);
            const angleDiff = moveAngle - stats.heading;
            const forwardSpeed = Math.cos(angleDiff) * speed;
            const lateralSpeed = Math.sin(angleDiff) * speed;
            const newForward = forwardSpeed;
            const newLateral = lateralSpeed * 0.90;
            this.velocity.x = Math.cos(stats.heading) * newForward + Math.cos(stats.heading + Math.PI / 2) * newLateral;
            this.velocity.y = Math.sin(stats.heading) * newForward + Math.sin(stats.heading + Math.PI / 2) * newLateral;
        }
        const pixelScale = 15;
        // [MODIFIED] Pass 'game' (which is already passed to updateBoatMovement) to move()
        this.move(this.velocity.x * pixelScale, this.velocity.y * pixelScale, world, game);

        stats.speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2) * pixelScale;
        this.isMoving = stats.speed > 0.1;

        // [MODIFIED] Removed WakeParticle generation here to prevent "exhaust" clouds
    }

    // [NEW] "Try-And-Slide" Movement Logic
    move(dx, dy, world, game) {
        if (this.ramCooldown > 0) this.ramCooldown--;
        const half = 10;

        // Helper: Is this single point valid?
        const isPointValid = (x, y) => {
            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);

            if (this.inBoat || this.type === 'boat') {
                return (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id);
            } else {
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return false;
                
                // [FIXED] Simplified solid check: If it has HP (is a built structure) or is a terrain solid, it blocks.
                const def = ID_TO_TILE[tileId];
                if (def.solid) return false;
                if (def.hp) return false; // If it has HP (like a wall or boulder), treat as solid for pathing
                
                return true;
            }
        };
        
        // Helper: Checks if the collision point is a damageable structure
        const hitsDamageable = (x, y) => {
            if (!game || this.type !== 'npc') return false;
            
            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const def = ID_TO_TILE[world.getTile(gx, gy)];
            
            // Wall, Tower, or fence (anything with HP that's solid and not water)
            return (def && def.hp && def.solid && !def.isWater);
        };


        // Helper: Does the entire hitbox fit at (nx, ny)?
        const canMoveTo = (nx, ny) => {
            return isPointValid(nx - half, ny - half) &&
                isPointValid(nx + half, ny - half) &&
                isPointValid(nx - half, ny + half) &&
                isPointValid(nx + half, ny + half);
        };

        let moved = false;
        
        // --- NPC Water/Death Check (Fixes stuck in water after destruction) ---
        if (this.type === 'npc' && !this.inBoat) {
            const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
            const currentTile = world.getTile(gx, gy);

            if (ID_TO_TILE[currentTile].isWater) {
                this.hp = 0;
                if (game) {
                    game.spawnParticles(this.x, this.y, '#3498db', 10);
                    game.spawnText(this.x, this.y - 10, "DROWNED", '#3498db');
                }
                return;
            }
        }
        // --- End NPC Water Check ---
        
        // 1. Try moving diagonally (Desired Move)
        if (canMoveTo(this.x + dx, this.y + dy)) {
            this.x += dx;
            this.y += dy;
            moved = true;
        }
        // 2. If blocked, try sliding along X (Block Y)
        else if (Math.abs(dx) > 0.01 && canMoveTo(this.x + dx, this.y)) {
            this.x += dx;
            this.velocity.y = 0;
            moved = true;
        }
        // 3. If blocked, try sliding along Y (Block X)
        else if (Math.abs(dy) > 0.01 && canMoveTo(this.x, this.y + dy)) {
            this.y += dy;
            this.velocity.x = 0;
            moved = true;
        }
        else {
            // Movement Completely Blocked -> Trigger Impact
            if (game) { 
                const lookAheadX = this.x + (dx * 2.5);
                const lookAheadY = this.y + (dy * 2.5);
                
                // [CRITICAL FIX] If the NPC is fully blocked, check the collision point for a wall/boat and hit it.
                if (this.type === 'boat' || hitsDamageable(lookAheadX, lookAheadY)) {
                    this.handleImpact(game, lookAheadX, lookAheadY);
                }
            }
            
            // Completely stuck - try resting to reset AI pathing
            if (this.type === 'npc' && this.aiState) {
                this.aiState.mode = 'rest';
                this.aiState.timer = 15;
            }
        }

        // [SAFETY] Emergency Push-Out if spawned inside a wall
        if (!canMoveTo(this.x, this.y)) {
            const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
            const tx = gx * CONFIG.TILE_SIZE + 16;
            const ty = gy * CONFIG.TILE_SIZE + 16;
            const dirX = this.x - tx;
            const dirY = this.y - ty;
            const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            this.x += (dirX / len) * 2;
            this.y += (dirY / len) * 2;
        }

        if (moved) {
            this.direction = { x: dx, y: dy };
            this.isMoving = true;
        } else if (this.type === 'player') {
            this.direction = { x: 0, y: 0 };
            this.isMoving = false;
        }

        // Update Visual Speed (for boat particles etc)
        const currentTile = world.getTile(Math.floor(this.x / CONFIG.TILE_SIZE), Math.floor(this.y / CONFIG.TILE_SIZE));
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

        // Invasion Logic
        this.hasSpawnedWave = false;
    }

    updateAI(dt, player, world, game) {
        if (this.owner !== 'enemy') return;

        // --- 1. MOVEMENT & COMBAT ---
        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        const tile = world.getTile(gx, gy);
        const isWater = (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id);

        if (isWater) {
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
                if (relative > 0) desiredAngle = angleToPlayer - Math.PI / 2;
                else desiredAngle = angleToPlayer + Math.PI / 2;
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
            if (Math.abs(angleRelative - (-Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'left');
            if (Math.abs(angleRelative - (Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'right');
        }

        // --- 2. WAVE SPAWN LOGIC (SYNCED) ---
        this.updateWaveLogic(game, world);
    }

    updateWaveLogic(game, world) {
        // [TODO] Waves of attacking land units, no continues spawning.
        // [TODO] Sync attack waves with other boats.
        // [TODO] No attacks in between.

        // Use Global Time for Sync
        const now = Date.now();
        const cycleLength = CONFIG.WAVE_INTERVAL || 30000; // e.g. 30 seconds
        const spawnWindow = 2000; // 2 second window to spawn

        const positionInCycle = now % cycleLength;

        if (positionInCycle < spawnWindow) {
            // We are in the spawn window!
            if (!this.hasSpawnedWave) {
                // Spawn a batch!
                let spawnedCount = 0;
                for (let i = 0; i < 3; i++) { // Spawn 3 units per wave
                    if (this.trySpawnMinion(game, world)) {
                        spawnedCount++;
                    }
                }
                if (spawnedCount > 0) {
                    game.spawnText(this.x, this.y, "WAVE ATTACK!", "#ff0000");
                }
                this.hasSpawnedWave = true;
            }
        } else {
            // Outside spawn window, reset flag so next wave can trigger
            this.hasSpawnedWave = false;
        }
    }

    trySpawnMinion(game, world) {
        // [TODO] npc land units should not get stuck when spawning
        // Improved logic: find a tile that is not solid, not water, AND has empty neighbors
        const range = 250;
        let attempts = 0;

        while (attempts < 20) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * (range - 70); // Ensure minimal distance from boat center

            const tx = this.x + Math.cos(angle) * dist;
            const ty = this.y + Math.sin(angle) * dist;

            const gx = Math.floor(tx / CONFIG.TILE_SIZE);
            const gy = Math.floor(ty / CONFIG.TILE_SIZE);

            // 1. Check strict solidity
            if (!world.isSolid(gx, gy)) {
                const t = world.getTile(gx, gy);
                const isWater = (t === TILES.WATER.id || t === TILES.DEEP_WATER.id);

                if (!isWater) {
                    // 2. Check neighbors to ensure it's not a 1x1 island or hole
                    let validNeighbors = 0;
                    const neighborOffsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];

                    for (let off of neighborOffsets) {
                        const nx = gx + off[0];
                        const ny = gy + off[1];
                        if (!world.isSolid(nx, ny)) {
                            const nt = world.getTile(nx, ny);
                            if (nt !== TILES.WATER.id && nt !== TILES.DEEP_WATER.id) {
                                validNeighbors++;
                            }
                        }
                    }

                    if (validNeighbors >= 2) {
                        // Valid invasion point found!
                        const minion = new Entity(tx, ty, 'npc');
                        minion.hp = 80; // Black Knights are tough
                        minion.activeMelee = TILES.SWORD_IRON.id;

                        game.npcs.push(minion);

                        // Visual feedback
                        game.spawnParticles(tx, ty, '#000000', 12);
                        return true;
                    }
                }
            }
            attempts++;
        }
        return false;
    }
}