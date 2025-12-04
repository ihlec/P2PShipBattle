import { CONFIG, TILES, ID_TO_TILE } from '../config.js';
import Utils from '../utils.js';
import { Projectile } from './Projectile.js';

export class Entity {
    constructor(x, y, type) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.targetX = x; // For interpolation
        this.targetY = y;

        this.type = type;
        this.speed = CONFIG.PLAYER_SPEED_BASE;
        this.hp = 100;
        this.maxHp = 100;
        
        // Inventory
        this.inventory = { 
            [TILES.GREY.id]: 50, 
            [TILES.BLACK.id]: 20, 
            [TILES.GOLD.id]: 20, 
            [TILES.IRON.id]: 50, 
            [TILES.WOOD.id]: 20, 
            [TILES.GREENS.id]: 0, 
            [TILES.WOOL.id]: 0 
        };
        
        this.selectedTile = null;
        this.direction = { x: 0, y: 1 };
        this.velocity = { x: 0, y: 0 };
        this.isMoving = false;
        this.moveTime = 0;
        
        // Boat State
        this.inBoat = false;
        this.boatStats = {
            heading: 0,
            targetHeading: 0,
            speed: 0,
            rudder: 0,
            sailLevel: 0,
            cooldownLeft: 0,
            cooldownRight: 0
        };
        
        this.activeRange = TILES.GREY.id;
        this.activeMelee = 'hand';
        this.ramCooldown = 0;
        this.stunTimer = 0;
    }

    handleInput(inputHandler, deltaTime, world, game) {
        // Player specific input handling
        const inputState = {
            up: inputHandler.keys['w'] || inputHandler.keys['arrowup'],
            down: inputHandler.keys['s'] || inputHandler.keys['arrowdown'],
            left: inputHandler.keys['a'] || inputHandler.keys['arrowleft'],
            right: inputHandler.keys['d'] || inputHandler.keys['arrowright']
        };

        if (this.inBoat) {
            // Broadside cannons
            if (inputHandler.keys['q']) this.shootBroadside(game, 'left');
            if (inputHandler.keys['e']) this.shootBroadside(game, 'right');
            
            this.updateBoatMovement(inputState, deltaTime, world, game);
            this.moveTime += deltaTime;
        } else {
            let moveX = 0;
            let moveY = 0;
            if (inputState.up) moveY = -1;
            if (inputState.down) moveY = 1;
            if (inputState.left) moveX = -1;
            if (inputState.right) moveX = 1;

            if (moveX || moveY) {
                // Determine speed based on terrain
                const gridX = Math.floor(this.x / CONFIG.TILE_SIZE);
                const gridY = Math.floor(this.y / CONFIG.TILE_SIZE);
                const tileId = world.getTile(gridX, gridY);
                
                let currentSpeed = this.speed;
                if (tileId === TILES.ROAD.id) {
                    currentSpeed = CONFIG.PLAYER_SPEED_ROAD;
                }

                this.isMoving = true;
                this.moveTime += deltaTime;
                const length = Math.sqrt(moveX * moveX + moveY * moveY);
                this.move((moveX / length) * currentSpeed, (moveY / length) * currentSpeed, world, game);
            } else {
                this.isMoving = false;
            }
        }
    }

    updateBoatMovement(input, deltaTime, world, game) {
        const stats = this.boatStats;
        const config = CONFIG.BOAT;

        // Cooldowns
        if (stats.cooldownLeft > 0) stats.cooldownLeft--;
        if (stats.cooldownRight > 0) stats.cooldownRight--;
        
        // Stun Logic
        if (this.stunTimer > 0) {
            this.stunTimer--;
            input.up = false; 
            input.down = false;
        }

        // Rudder
        if (input.left) stats.rudder -= config.RUDDER_SPEED;
        if (input.right) stats.rudder += config.RUDDER_SPEED;
        
        // Clamp Rudder
        stats.rudder = Math.max(-config.MAX_RUDDER, Math.min(config.MAX_RUDDER, stats.rudder));

        // Auto-center Rudder
        if (!input.left && !input.right) stats.rudder *= 0.95;

        // Apply Heading Change
        if (Math.abs(stats.rudder) > 0.001) {
            stats.heading += stats.rudder * (config.TURN_FACTOR * 0.25);
        }

        // Wind Physics
        const windDot = Math.cos(world.wind.angle - stats.heading);
        let windEfficiency = 0;
        if (windDot < -0.8) windEfficiency = (windDot + 1.0);
        else windEfficiency = (0.5 + 0.5 * windDot) + (0.5 * (1 - Math.abs(windDot)));
        windEfficiency = Math.max(0, windEfficiency);

        // Sail Control
        if (input.up) stats.sailLevel = Math.min(1, stats.sailLevel + 0.02);
        else if (input.down) stats.sailLevel = Math.max(-0.25, stats.sailLevel - 0.05);

        // Calculate Acceleration
        const powerFactor = 0.40;
        let effectiveThrust = 0;
        if (stats.sailLevel > 0) effectiveThrust = stats.sailLevel * config.ACCELERATION * powerFactor * windEfficiency;
        else effectiveThrust = stats.sailLevel * config.ACCELERATION * 0.2;

        const accX = Math.cos(stats.heading) * effectiveThrust;
        const accY = Math.sin(stats.heading) * effectiveThrust;

        this.velocity.x += accX;
        this.velocity.y += accY;
        
        // Water Drag
        this.velocity.x *= 0.995;
        this.velocity.y *= 0.995;

        // Apply Drift/Keel Physics (Boats don't slide sideways easily)
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (speed > 0.001) {
            const moveAngle = Math.atan2(this.velocity.y, this.velocity.x);
            const angleDiff = moveAngle - stats.heading;
            const forwardSpeed = Math.cos(angleDiff) * speed;
            const lateralSpeed = Math.sin(angleDiff) * speed;
            
            const newForward = forwardSpeed;
            const newLateral = lateralSpeed * 0.90; // High lateral drag
            
            this.velocity.x = Math.cos(stats.heading) * newForward + Math.cos(stats.heading + Math.PI / 2) * newLateral;
            this.velocity.y = Math.sin(stats.heading) * newForward + Math.sin(stats.heading + Math.PI / 2) * newLateral;
        }

        const PIXEL_SCALE = 15;
        this.move(this.velocity.x * PIXEL_SCALE, this.velocity.y * PIXEL_SCALE, world, game);

        stats.speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2) * PIXEL_SCALE;
        this.isMoving = stats.speed > 0.1;

        if (game && stats.speed > 1.0) { 
            this.checkEntityRam(game);
        }
    }

    move(deltaX, deltaY, world, game) {
        // "Try-And-Slide" Movement Logic
        if (this.ramCooldown > 0) this.ramCooldown--;
        const COLLISION_RADIUS = 10;

        const isPointValid = (x, y) => {
            const gridX = Math.floor(x / CONFIG.TILE_SIZE);
            const gridY = Math.floor(y / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gridX, gridY);

            if (this.inBoat || this.type === 'boat') {
                return (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id);
            } else {
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return false;
                const def = ID_TO_TILE[tileId];
                if (def.solid) return false;
                
                // Allow movement through non-solid items even if they have HP (like open gates)
                if (def.hp && def.solid) return false; 
                
                return true;
            }
        };

        const canMoveTo = (newX, newY) => {
            return isPointValid(newX - COLLISION_RADIUS, newY - COLLISION_RADIUS) &&
                   isPointValid(newX + COLLISION_RADIUS, newY - COLLISION_RADIUS) &&
                   isPointValid(newX - COLLISION_RADIUS, newY + COLLISION_RADIUS) &&
                   isPointValid(newX + COLLISION_RADIUS, newY + COLLISION_RADIUS);
        };

        let moved = false;
        
        // 1. Diagonal Move
        if (canMoveTo(this.x + deltaX, this.y + deltaY)) {
            this.x += deltaX;
            this.y += deltaY;
            moved = true;
        }
        // 2. Slide X
        else if (Math.abs(deltaX) > 0.01 && canMoveTo(this.x + deltaX, this.y)) {
            this.x += deltaX;
            this.velocity.y = 0;
            moved = true;
        }
        // 3. Slide Y
        else if (Math.abs(deltaY) > 0.01 && canMoveTo(this.x, this.y + deltaY)) {
            this.y += deltaY;
            this.velocity.x = 0;
            moved = true;
        }
        else {
             // Blocked
             if (game && (this.type === 'boat' || this.type === 'npc' || this.inBoat)) {
                 this.handleImpact(game, this.x + deltaX * 2.5, this.y + deltaY * 2.5);
             }
        }

        if (moved) {
            this.direction = { x: deltaX, y: deltaY };
            this.isMoving = true;
        }
    }

    handleImpact(game, targetX, targetY) {
        if (this.ramCooldown > 0) return;
        
        if (this.type !== 'npc' && this.type !== 'boat' && !this.inBoat) return;

        const gridX = Math.floor(targetX / CONFIG.TILE_SIZE);
        const gridY = Math.floor(targetY / CONFIG.TILE_SIZE);
        const tileId = game.world.getTile(gridX, gridY);
        const tileDef = ID_TO_TILE[tileId];

        if (tileDef && tileDef.hp) {
             game.applyDamageToTile(gridX, gridY, CONFIG.NPC_RAM.DAMAGE_STRUCTURE);
             this.ramCooldown = CONFIG.NPC_RAM.COOLDOWN;
             this.velocity.x *= -0.5; // Bounce
             this.velocity.y *= -0.5;
             this.stunTimer = 20; 
             game.spawnParticles(this.x, this.y, '#fff', 5);
        }
    }

    checkEntityRam(game) {
        if (this.ramCooldown > 0) return;

        const targets = [...game.npcs, ...game.animals, ...game.boats, ...Object.values(game.peers)];
        const RAM_RADIUS = 25;

        for (const t of targets) {
            if (t === this) continue;
            if (this.inBoat && t === game.player) continue;

            const dist = Utils.distance(this, t);
            
            if (dist < RAM_RADIUS) {
                let damage = 20; 
                if (t.type === 'boat' || t.inBoat) damage = CONFIG.NPC_RAM.DAMAGE_BOAT; 
                else damage = 40; 

                game.applyDamageToEntity(t, damage);

                this.ramCooldown = CONFIG.NPC_RAM.COOLDOWN; 
                this.velocity.x *= -0.5;
                this.velocity.y *= -0.5;
                this.stunTimer = 20; 
                
                game.spawnParticles(t.x, t.y, '#f00', 8);
                game.spawnText(t.x, t.y, "RAM!", "#ff0000");
                game.triggerShake(10); // [NEW] Shake

                return; 
            }
        }
    }

    shootBroadside(game, side) {
        if ((!this.inBoat && this.type !== 'boat') || !this.boatStats) return;

        const stats = this.boatStats;
        const config = CONFIG.BOAT;
        const cooldownKey = side === 'left' ? 'cooldownLeft' : 'cooldownRight';

        if (stats[cooldownKey] > 0) return;

        // Reset Cooldown
        stats[cooldownKey] = config.BROADSIDE_COOLDOWN;

        // Calculate firing angle (Left = -90deg, Right = +90deg)
        const offsetAngle = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
        const baseAngle = stats.heading + offsetAngle;

        // Fire a volley of 3 cannonballs
        for (let i = -1; i <= 1; i++) {
            const spread = i * 0.15; // Spread in radians
            const fireAngle = baseAngle + spread;

            // Start position (offset to the side of the ship)
            const spawnOffset = 15;
            const sx = this.x + Math.cos(fireAngle) * spawnOffset;
            const sy = this.y + Math.sin(fireAngle) * spawnOffset;

            // Target position (far out to define velocity vector)
            const dist = 500;
            const tx = this.x + Math.cos(fireAngle) * dist;
            const ty = this.y + Math.sin(fireAngle) * dist;

            const isPlayer = (this.type === 'player' || this.owner === 'player');

            const p = new Projectile(
                sx, sy, 
                tx, ty, 
                config.CANNON_DAMAGE, 
                config.CANNON_SPEED, 
                '#111', 
                isPlayer, 
                'cannonball'
            );
            
            p.life = config.CANNON_RANGE; 
            game.projectiles.push(p);

            if (game.network) {
                 game.network.actions.sendShoot({
                    x: sx, y: sy,
                    tx: tx, ty: ty,
                    dmg: config.CANNON_DAMAGE, spd: config.CANNON_SPEED,
                    col: '#111', type: 'cannonball',
                    life: config.CANNON_RANGE
                });
            }
        }
        
        // Recoil Effect
        game.spawnParticles(this.x, this.y, '#888', 8);
        game.triggerShake(4); // [NEW] Shake
    }
}