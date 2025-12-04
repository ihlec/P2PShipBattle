import { Entity } from './Entity.js';
import { CONFIG, TILES } from '../config.js';
import Utils from '../utils.js';
import { Raider } from './Npc.js'; 

export class Boat extends Entity {
    constructor(x, y, owner = 'player') {
        super(x, y, 'boat');
        this.hp = 100;
        this.maxHp = 100;
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
    }

    static createInvasionForce(game) {
        const player = game.player;
        const world = game.world;
        const minDist = 250;
        const maxDist = 550;

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = minDist + Math.random() * (maxDist - minDist);
            const x = player.x + Math.cos(angle) * dist;
            const y = player.y + Math.sin(angle) * dist;

            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);

            if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) {
                return new Boat(x, y, 'enemy');
            }
        }
        return null;
    }

    updateAI(deltaTime, player, world, game) {
        if (this.owner !== 'enemy') return;

        // --- Movement & Combat ---
        const gridX = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gridY = Math.floor(this.y / CONFIG.TILE_SIZE);
        const tile = world.getTile(gridX, gridY);
        const isWater = (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id);

        // [MODIFIED] Find closest target instead of hardcoding "player"
        const target = this.findClosestTarget(game);

        if (isWater && target) {
            const dist = Utils.distance(this, target);
            const input = { up: false, down: false, left: false, right: false };
            const angleToTarget = Math.atan2(target.y - this.y, target.x - this.x);
            
            let heading = this.boatStats.heading % (Math.PI * 2);
            if (heading > Math.PI) heading -= Math.PI * 2;
            if (heading < -Math.PI) heading += Math.PI * 2;

            let desiredAngle = angleToTarget;
            const BROADSIDE_RANGE = 300;
            const MIN_RANGE = 150;

            // Attempt to flank for broadside if within range
            if (dist < BROADSIDE_RANGE && dist > MIN_RANGE) {
                let relative = angleToTarget - heading;
                while (relative > Math.PI) relative -= Math.PI * 2;
                while (relative < -Math.PI) relative += Math.PI * 2;
                if (relative > 0) desiredAngle = angleToTarget - Math.PI / 2;
                else desiredAngle = angleToTarget + Math.PI / 2;
            }

            // Wind Tacking Logic
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

            // Fire Broadside
            let angleRelative = angleToTarget - heading;
            while (angleRelative > Math.PI) angleRelative -= Math.PI * 2;
            while (angleRelative < -Math.PI) angleRelative += Math.PI * 2;
            const broadsideThreshold = 0.3;
            
            if (Math.abs(angleRelative - (-Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'left');
            if (Math.abs(angleRelative - (Math.PI / 2)) < broadsideThreshold) this.shootBroadside(game, 'right');
        }

        // --- Wave Spawn Logic ---
        this.updateWaveLogic(game, world);
    }

    // [NEW] Helper to target closest player/peer
    findClosestTarget(game) {
        let closest = null;
        let minDst = 1000; // Search range

        // Combine Host and Peers
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
                for (let i = 0; i < 3; i++) {
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
                    const raider = new Raider(tx, ty);
                    game.npcs.push(raider);

                    game.spawnParticles(tx, ty, '#000000', 12);
                    return true;
                }
            }
            attempts++;
        }
        return false;
    }
}