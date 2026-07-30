import { Entity } from './Entity.js';
import { CONFIG, TILES, SHIP_SPECS } from '../config.js';
import Utils from '../utils.js';
import { Raider, Archer, Brute } from './Npc.js'; 
import { Projectile } from './Projectile.js';

export class Boat extends Entity {
    constructor(x, y, owner = 'player', subtype = 'sloop') {
        super(x, y, 'boat');
        
        this.subtype = subtype;
        this.specs = SHIP_SPECS[subtype] || SHIP_SPECS['sloop'];
        
        this.hp = this.specs.hp;
        this.maxHp = this.specs.hp;
        this.owner = owner;
        this.inBoat = true;
        this.hasSpawnedWave = false;
        
        // Boat specific physics container
        this.boatStats = {
            heading: 0,
            targetHeading: 0,
            speed: 0,
            rudder: 0,
            sailLevel: 0,
            cooldownLeft: 0,
            cooldownRight: 0
        };

        this.hullLevel = 0;
        this.sailLevel = 0;
        this.cannonLevel = 0;
    }

    applyUpgrades() {
        const baseSpecs = SHIP_SPECS[this.subtype] || SHIP_SPECS['sloop'];
        const newMaxHp = baseSpecs.hp + (this.hullLevel || 0) * 50;
        if (newMaxHp > this.maxHp) {
            this.hp += (newMaxHp - this.maxHp);
            this.maxHp = newMaxHp;
        }
    }

    static createInvasionForce(game) {
        const player = game.player;
        const world = game.world;
        
        const minDist = 3000; 
        const maxDist = 4000;

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = minDist + Math.random() * (maxDist - minDist);
            const x = player.x + Math.cos(angle) * dist;
            const y = player.y + Math.sin(angle) * dist;

            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);

            if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) {
                const threat = game.threatLevel || 0;
                const galleonChance = Math.min(0.7, 0.2 + threat * 0.05);
                const type = Math.random() < galleonChance ? 'galleon' : 'sloop';
                return new Boat(x, y, 'enemy', type);
            }
        }
        return null;
    }

    updateAI(deltaTime, player, world, game) {
        if (this.owner !== 'enemy') return;

        const gridX = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gridY = Math.floor(this.y / CONFIG.TILE_SIZE);
        const tile = world.getTile(gridX, gridY);
        const isWater = (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id);

        let target = this.findClosestTarget(game, 2000);
        let isPatrolling = false;

        if (!target) {
            target = this.findClosestTarget(game, 50000);
            isPatrolling = true;
        }

        if (isWater && target) {
            const dist = Utils.distance(this, target);
            const input = { up: false, down: false, left: false, right: false };
            
            let sepX = 0;
            let sepY = 0;
                const separationRadius = 200;

            game.boats.forEach(other => {
                if (other !== this && other.owner === 'enemy' && other.hp > 0) {
                    const d = Utils.distance(this, other);
                    if (d < separationRadius) {
                        const pushX = this.x - other.x;
                        const pushY = this.y - other.y;
                        const strength = (separationRadius - d) / separationRadius; 
                        sepX += (pushX / d) * strength * 3.0; 
                        sepY += (pushY / d) * strength * 3.0;
                    }
                }
            });

            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distToT = Math.sqrt(dx*dx + dy*dy) || 1;
            const targetDirX = dx / distToT;
            const targetDirY = dy / distToT;

            const finalDirX = targetDirX + sepX;
            const finalDirY = targetDirY + sepY;

            const angleToTarget = Math.atan2(finalDirY, finalDirX);
            const rawAngleToTarget = Math.atan2(dy, dx); 
            
            let heading = this.boatStats.heading % (Math.PI * 2);
            if (heading > Math.PI) heading -= Math.PI * 2;
            if (heading < -Math.PI) heading += Math.PI * 2;

            let desiredAngle = angleToTarget;
            const BROADSIDE_RANGE = 400;
            const MIN_RANGE = 150;

            if (!isPatrolling && dist < BROADSIDE_RANGE && dist > MIN_RANGE) {
                let relative = angleToTarget - heading;
                while (relative > Math.PI) relative -= Math.PI * 2;
                while (relative < -Math.PI) relative += Math.PI * 2;
                
                // Add hysteresis to prevent rapid flipping when facing target directly
                if (Math.abs(relative) > 0.2) {
                    if (relative > 0) desiredAngle = angleToTarget - Math.PI / 2;
                    else desiredAngle = angleToTarget + Math.PI / 2;
                } else {
                    // If roughly facing, maintain current broadside preference or just go straight
                    // defaulting to "keep turning" direction effectively
                    desiredAngle = heading; 
                }
            }

            const windDir = world.wind.angle;
            let windDiff = Math.cos(windDir - desiredAngle);
            if (windDiff < -0.5) {
                if (!this.aiState) this.aiState = { tackTimer: 0, tackState: 1 }; 
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

            this.updateBoatMovement(input, deltaTime, world, game);

            let angleRelative = rawAngleToTarget - heading;
            while (angleRelative > Math.PI) angleRelative -= Math.PI * 2;
            while (angleRelative < -Math.PI) angleRelative += Math.PI * 2;
            const broadsideThreshold = 0.4; 
            
            if (dist < 600) { 
                if (Math.abs(angleRelative - (-Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'left');
                if (Math.abs(angleRelative - (Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'right');
            }
        }

        this.updateWaveLogic(game, world);
    }

    findClosestTarget(game, scanRange = 2000) {
        let closest = null;
        let minDst = scanRange; 

        const potentialTargets = [game.player, ...Object.values(game.peers)];

        potentialTargets.forEach(p => {
            if (p.hp > 0 && !p.godMode) {
                const d = Utils.distance(this, p);
                if (d < minDst) {
                    minDst = d;
                    closest = p;
                }
            }
        });
        return closest;
    }

    updateWaveLogic(game, world) {
        const now = Date.now();
        const cycleLength = CONFIG.WAVE_INTERVAL || 30000;
        const spawnWindow = 2000;

        const positionInCycle = now % cycleLength;

        if (positionInCycle < spawnWindow) {
            if (!this.hasSpawnedWave) {
                let spawnedCount = 0;
                const count = this.subtype === 'galleon' ? 5 : 3;
                for (let i = 0; i < count; i++) {
                    if (this.trySpawnMinion(game, world)) spawnedCount++;
                }
                if (spawnedCount > 0) game.spawnText(this.x, this.y, "RAIDERS LANDING!", "#ff0000");
                this.hasSpawnedWave = true;
            }
        } else {
            this.hasSpawnedWave = false;
        }
    }

    trySpawnMinion(game, world) {
        if (game.npcs.length >= CONFIG.MAX_NPCS) return false;
        const range = 250;
        let attempts = 0;

        while (attempts < 20) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * (range - 70);

            const tx = this.x + Math.cos(angle) * dist;
            const ty = this.y + Math.sin(angle) * dist;
            const gridX = Math.floor(tx / CONFIG.TILE_SIZE);
            const gridY = Math.floor(ty / CONFIG.TILE_SIZE);

            if (!world.isSolid(gridX, gridY)) {
                const t = world.getTile(gridX, gridY);
                const isWater = (t === TILES.WATER.id || t === TILES.DEEP_WATER.id);

                if (!isWater) {
                    const threat = game.threatLevel || 0;
                    const roll = Math.random();
                    let npc;
                    if (threat >= 5 && roll < 0.2) npc = new Brute(tx, ty);
                    else if (threat >= 2 && roll < 0.4) npc = new Archer(tx, ty);
                    else npc = new Raider(tx, ty);
                    game.npcs.push(npc);
                    game.spawnParticles(tx, ty, '#000000', 12);
                    return true;
                }
            }
            attempts++;
        }
        return false;
    }

    shootBroadside(game, side) {
        if (!this.boatStats) return;

        const stats = this.boatStats;
        const config = CONFIG.BOAT;
        const cooldownKey = side === 'left' ? 'cooldownLeft' : 'cooldownRight';

        if (stats[cooldownKey] > 0) return;

        const ammoId = (this.specs.ammoType === 'IRN') ? TILES.IRON.id : TILES.GREY.id;
        const ammoName = (this.specs.ammoType === 'IRN') ? "IRON" : "STONE";

        if (this.type === 'player' && this.owner === 'player' && !game.godMode) {
            if ((this.inventory[ammoId] || 0) < 1) {
                game.spawnText(this.x, this.y - 20, `NO ${ammoName}`, "#f00");
                return;
            }
            this.inventory[ammoId]--;
            game.ui.update();
        }

        stats[cooldownKey] = this.specs.broadsideCooldown;

        const layout = this.specs.layout;
        const ts = 16;
        const rows = layout.length;
        const cols = layout[0].length;
        const width = cols * ts;
        const height = rows * ts;
        const startX = -width / 2;
        const startY = -height / 2;

        const cannonMult = 1 + (this.cannonLevel || 0) * 0.2;
        const cannonDmg = Math.floor(CONFIG.BOAT.CANNON_DAMAGE * cannonMult);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (layout[r][c] === 43) {
                    const isLeftHalf = c < cols / 2;
                    
                    if ((side === 'left' && isLeftHalf) || (side === 'right' && !isLeftHalf)) {
                        const lx = startX + c * ts + ts/2;
                        const ly = startY + r * ts + ts/2;
                        
                        const cos = Math.cos(stats.heading + Math.PI/2);
                        const sin = Math.sin(stats.heading + Math.PI/2);
                        
                        const rotX = lx * cos - ly * sin;
                        const rotY = lx * sin + ly * cos;
                        
                        const worldX = this.x + rotX;
                        const worldY = this.y + rotY;

                        const offsetAngle = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
                        const fireAngle = stats.heading + offsetAngle + (Math.random() - 0.5) * 0.1;

                        const dist = 500;
                        const tx = worldX + Math.cos(fireAngle) * dist;
                        const ty = worldY + Math.sin(fireAngle) * dist;
                        
                        const isPlayer = (this.type === 'player' || this.owner === 'player');

                        const p = new Projectile(
                            worldX, worldY, 
                            tx, ty, 
                            cannonDmg, 
                            CONFIG.BOAT.CANNON_SPEED, 
                            '#111', 
                            isPlayer, 
                            'cannonball',
                            this.id 
                        );
                        
                        p.life = CONFIG.BOAT.CANNON_RANGE; 
                        game.projectiles.push(p);

                        if (game.network) {
                             game.network.actions.sendShoot({
                                x: worldX, y: worldY,
                                tx: tx, ty: ty,
                                dmg: config.CANNON_DAMAGE,
                                spd: config.CANNON_SPEED,
                                col: '#111', type: 'cannonball',
                                life: config.CANNON_RANGE
                            });
                        }
                    }
                }
            }
        }
        
        game.spawnParticles(this.x, this.y, '#888', 12);
        game.triggerShake(4); 
    }
}