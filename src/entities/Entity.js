import { CONFIG, TILES, ID_TO_TILE, SHIP_SPECS } from '../config.js';
import Utils from '../utils.js';
import { Projectile } from './Projectile.js';

const MAX_TURN_RATE = 0.03;

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
        
        this.inventory = { 
            [TILES.GREY.id]: 0, 
            [TILES.BLACK.id]: 0, 
            [TILES.GOLD.id]: 0, 
            [TILES.IRON.id]: 0, 
            [TILES.WOOD.id]: 0, 
            [TILES.GREENS.id]: 0, 
            [TILES.WOOL.id]: 0 
        };
        
        this.selectedTile = null;
        this.direction = { x: 0, y: 1 };
        this.velocity = { x: 0, y: 0 };
        this.isMoving = false;
        this.moveTime = 0;
        
        this.inBoat = false;
        this.subtype = null;
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

        this.speedMult = 1;
        this.dmgBonus = 0;
        this.hullLevel = 0;
        this.sailLevel = 0;
        this.cannonLevel = 0;
    }

    handleInput(inputHandler, deltaTime, world, game) {
        const inputState = {
            up: inputHandler.keys['w'] || inputHandler.keys['arrowup'],
            down: inputHandler.keys['s'] || inputHandler.keys['arrowdown'],
            left: inputHandler.keys['a'] || inputHandler.keys['arrowleft'],
            right: inputHandler.keys['d'] || inputHandler.keys['arrowright']
        };

        if (this.inBoat) {
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
                const gridX = Math.floor(this.x / CONFIG.TILE_SIZE);
                const gridY = Math.floor(this.y / CONFIG.TILE_SIZE);
                const tileId = world.getTile(gridX, gridY);
                
                let currentSpeed = this.speed;
                if (tileId === TILES.ROAD.id) {
                    currentSpeed = CONFIG.PLAYER_SPEED_ROAD;
                }
                currentSpeed *= (this.speedMult || 1);

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
        const subtype = this.subtype || 'sloop';
        const specs = SHIP_SPECS[subtype] || SHIP_SPECS['sloop'];

        if (stats.cooldownLeft > 0) stats.cooldownLeft--;
        if (stats.cooldownRight > 0) stats.cooldownRight--;
        
        if (this.stunTimer > 0) {
            this.stunTimer--;
            input.up = false; 
            input.down = false;
        }

        if (input.left) stats.rudder -= specs.turnSpeed;
        if (input.right) stats.rudder += specs.turnSpeed;
        stats.rudder = Math.max(-CONFIG.BOAT.MAX_RUDDER, Math.min(CONFIG.BOAT.MAX_RUDDER, stats.rudder));
        if (!input.left && !input.right) stats.rudder *= 0.95;

        if (Math.abs(stats.rudder) > 0.001) {
            let turnAmount = stats.rudder * (CONFIG.BOAT.TURN_FACTOR * 0.01);
            turnAmount = Math.max(-MAX_TURN_RATE, Math.min(MAX_TURN_RATE, turnAmount));
            stats.heading += turnAmount;
        }

        const windDot = Math.cos(world.wind.angle - stats.heading);
        let windEfficiency = 0;
        if (windDot < -0.8) windEfficiency = (windDot + 1.0);
        else windEfficiency = (0.5 + 0.5 * windDot) + (0.5 * (1 - Math.abs(windDot)));
        windEfficiency = Math.max(0, windEfficiency);

        if (input.up) stats.sailLevel = Math.min(1, stats.sailLevel + 0.02);
        else if (input.down) stats.sailLevel = Math.max(-0.25, stats.sailLevel - 0.05);

        const powerFactor = 0.40;
        let effectiveThrust = 0;
        if (stats.sailLevel > 0) effectiveThrust = stats.sailLevel * specs.acceleration * powerFactor * windEfficiency;
        else effectiveThrust = stats.sailLevel * specs.acceleration * 0.2;

        this.velocity.x += Math.cos(stats.heading) * effectiveThrust;
        this.velocity.y += Math.sin(stats.heading) * effectiveThrust;
        
        this.velocity.x *= 0.995;
        this.velocity.y *= 0.995;

        const currentSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.y**2);
        const sailMult = 1 + (this.sailLevel || 0) * 0.15;
        const maxVel = (specs.maxSpeed * sailMult) / 15.0; 
        if (currentSpeed > maxVel) {
            this.velocity.x = (this.velocity.x / currentSpeed) * maxVel;
            this.velocity.y = (this.velocity.y / currentSpeed) * maxVel;
        }

        if (currentSpeed > 0.001) {
            const moveAngle = Math.atan2(this.velocity.y, this.velocity.x);
            const angleDiff = moveAngle - stats.heading;
            const forwardSpeed = Math.cos(angleDiff) * currentSpeed;
            const newLateral = Math.sin(angleDiff) * currentSpeed * 0.90;
            
            this.velocity.x = Math.cos(stats.heading) * forwardSpeed + Math.cos(stats.heading + Math.PI / 2) * newLateral;
            this.velocity.y = Math.sin(stats.heading) * forwardSpeed + Math.sin(stats.heading + Math.PI / 2) * newLateral;
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
                return true;
            }
        };

        const canMoveTo = (newX, newY) => {
            return isPointValid(newX - COLLISION_RADIUS, newY - COLLISION_RADIUS) &&
                   isPointValid(newX + COLLISION_RADIUS, newY - COLLISION_RADIUS) &&
                   isPointValid(newX - COLLISION_RADIUS, newY + COLLISION_RADIUS) &&
                   isPointValid(newX + COLLISION_RADIUS, newY + COLLISION_RADIUS);
        };

        const currentlyTrapped = !canMoveTo(this.x, this.y);
        let moved = false;

        if (currentlyTrapped || canMoveTo(this.x + deltaX, this.y + deltaY)) {
            this.x += deltaX;
            this.y += deltaY;
            moved = true;
        } else if (Math.abs(deltaX) > 0.01 && canMoveTo(this.x + deltaX, this.y)) {
            this.x += deltaX;
            this.velocity.y = 0;
            moved = true;
        } else if (Math.abs(deltaY) > 0.01 && canMoveTo(this.x, this.y + deltaY)) {
            this.y += deltaY;
            this.velocity.x = 0;
            moved = true;
        }
        else {
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

        const isNaturalTerrain = tileId === TILES.MOUNTAIN.id || tileId === TILES.TREE.id || tileId === TILES.STONE_BLOCK.id;
        if (tileDef && tileDef.hp && !isNaturalTerrain) {
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
        const isPlayerSide = this.type === 'player' || this.owner === 'player' || this.inBoat;

        for (const t of targets) {
            if (t === this) continue;
            if (this.inBoat && t === game.player) continue;
            if (isPlayerSide && t.type === 'peer') continue;
            if (isPlayerSide && t.type === 'boat' && t.owner === 'player') continue;

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
                game.triggerShake(10); 

                return; 
            }
        }
    }

    getSeparationForce(game, radius = 24) {
        let sepX = 0, sepY = 0;
        if (!game || !game.npcs) return { x: sepX, y: sepY };
        for (const other of game.npcs) {
            if (other === this || other.hp <= 0 || other.type !== 'npc') continue;
            const dist = Math.sqrt((this.x - other.x)**2 + (this.y - other.y)**2);
            if (dist < radius && dist > 0.1) {
                const push = (radius - dist) / radius;
                sepX += (this.x - other.x) / dist * push * 2.5;
                sepY += (this.y - other.y) / dist * push * 2.5;
            }
        }
        return { x: sepX, y: sepY };
    }

    shootBroadside(game, side) {
        if ((!this.inBoat && this.type !== 'boat') || !this.boatStats) return;

        const stats = this.boatStats;
        const config = CONFIG.BOAT;
        const cooldownKey = side === 'left' ? 'cooldownLeft' : 'cooldownRight';

        if (stats[cooldownKey] > 0) return;

        const subtype = this.subtype || 'sloop';
        const specs = SHIP_SPECS[subtype] || SHIP_SPECS['sloop'];
        const ammoId = (specs.ammoType === 'IRN') ? TILES.IRON.id : TILES.GREY.id;
        const ammoName = (specs.ammoType === 'IRN') ? "IRON" : "STONE";

        if (this.type === 'player' && !game.godMode) {
            if ((this.inventory[ammoId] || 0) < 1) {
                game.spawnText(this.x, this.y - 20, `NO ${ammoName}`, "#f00");
                stats[cooldownKey] = 60;
                return;
            }
            this.inventory[ammoId]--;
            game.ui.update();
        }

        stats[cooldownKey] = specs.broadsideCooldown;

        const offsetAngle = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
        const baseAngle = stats.heading + offsetAngle;
        const shotCount = (subtype === 'galleon') ? 3 : 2;

        const cannonMult = 1 + (this.cannonLevel || 0) * 0.2;
        const cannonDmg = Math.floor(CONFIG.BOAT.CANNON_DAMAGE * cannonMult);

        for (let i = 0; i < shotCount; i++) {
            const spreadFactor = i - (shotCount - 1) / 2;
            const spread = spreadFactor * 0.15;
            const fireAngle = baseAngle + spread;

            const spawnOffset = 15;
            const sx = this.x + Math.cos(fireAngle) * spawnOffset;
            const sy = this.y + Math.sin(fireAngle) * spawnOffset;

            const dist = 500;
            const tx = this.x + Math.cos(fireAngle) * dist;
            const ty = this.y + Math.sin(fireAngle) * dist;

            const isPlayer = (this.type === 'player' || this.owner === 'player');

            const ownerId = (this.type === 'player' && game.network)
                ? game.network.selfId
                : this.id;
            const p = new Projectile(
                sx, sy, 
                tx, ty, 
                cannonDmg, 
                CONFIG.BOAT.CANNON_SPEED, 
                '#111', 
                isPlayer, 
                'cannonball',
                ownerId
            );
            
            p.life = config.CANNON_RANGE;
            if (this.type === 'player') {
                p.fromLocal = true;
                p.grace = 10;
            }
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

        game.spawnParticles(this.x, this.y, '#888', 8);
        game.triggerShake(4); 
    }
}