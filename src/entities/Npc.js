import { Entity } from './Entity.js';
import Utils from '../utils.js';
import { CONFIG, TILES, ID_TO_TILE } from '../config.js';

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

    updateAI(deltaTime, player, world, game) {
        if (!this.hasWool) {
            this.woolTimer--;
            if (this.woolTimer <= 0) this.hasWool = true;
        }
        
        if (!game || !game.peers) return;
        
        const allPlayers = [game.player, ...Object.values(game.peers)];
        let closestPlayer = null;
        let minDistance = 150;

        for (const p of allPlayers) {
            const dist = Utils.distance(this, p);
            if (dist < minDistance) {
                minDistance = dist;
                closestPlayer = p;
            }
        }

        if (closestPlayer) {
            const angle = Math.atan2(this.y - closestPlayer.y, this.x - closestPlayer.x);
            this.move(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, world, game);
        } else {
            this.moveTimer--;
            if (this.moveTimer <= 0) {
                this.moveTimer = 60 + Math.random() * 60;
                this.moveAngle = Math.random() * 6.28;
            }
            this.move(Math.cos(this.moveAngle) * 0.5, Math.sin(this.moveAngle) * 0.5, world, game);
        }
    }
}

export class Raider extends Entity {
    constructor(x, y) {
        super(x, y, 'npc');
        this.hp = 60;
        this.maxHp = 60;
        this.speed = 2.2;
        this.activeMelee = TILES.SWORD_IRON.id;
        this.attackCooldown = 0;
        this.searchTimer = 0;
        this.target = null; // { type: 'player'|'structure', obj: object|{x,y} }
    }

    updateAI(deltaTime, player, world, game) {
        if (this.attackCooldown > 0) this.attackCooldown--;

        // 1. Target Acquisition
        // [MODIFIED] Reduced timer from 60 to 10 to ensure they "always" switch to the closest target quickly
        this.searchTimer--;
        if (this.searchTimer <= 0 || (this.target && this.target.obj.hp <= 0)) {
            this.target = this.findTarget(game, world);
            this.searchTimer = 10; 
        }

        if (this.target) {
            const tObj = this.target.obj;
            // Handle case where target might be a simple object {x,y} for tiles
            const tx = tObj.x !== undefined ? tObj.x : (this.target.x * CONFIG.TILE_SIZE + 16);
            const ty = tObj.y !== undefined ? tObj.y : (this.target.y * CONFIG.TILE_SIZE + 16);
            
            const dist = Math.sqrt((tx - this.x)**2 + (ty - this.y)**2);

            // 2. Attack
            // [FIXED] Reduced attack range from 40 to 28 (Touching distance)
            if (dist < 28) {
                if (this.attackCooldown <= 0) {
                    this.performAttack(game, this.target);
                    this.attackCooldown = 60;
                }
            } 
            // 3. Move
            else {
                const angle = Math.atan2(ty - this.y, tx - this.x);
                this.move(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed, world, game);
            }
        } else {
            // Idle Wander
            if (Math.random() < 0.02) {
                this.moveAngle = Math.random() * 6.28;
            }
            if (this.moveAngle) {
                this.move(Math.cos(this.moveAngle) * 0.5, Math.sin(this.moveAngle) * 0.5, world, game);
            }
        }
    }

    findTarget(game, world) {
        let closest = null;
        let minDst = 600; // Aggro range

        // A. Check Players
        const players = [game.player, ...Object.values(game.peers)];
        players.forEach(p => {
            if (p.hp > 0 && !p.godMode) {
                const d = Utils.distance(this, p);
                if (d < minDst) {
                    minDst = d;
                    closest = { type: 'player', obj: p };
                }
            }
        });

        // B. Check Structures (If no player is extremely close)
        // Scan a small radius around NPC for breakable walls/towers
        if (minDst > 100) { 
            const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
            const range = 5;
            
            for (let y = gy - range; y <= gy + range; y++) {
                for (let x = gx - range; x <= gx + range; x++) {
                    const id = world.getTile(x, y);
                    const def = ID_TO_TILE[id];
                    if (def && (def.hp || id === TILES.TORCH.id) && id !== TILES.TREE.id && id !== TILES.STONE_BLOCK.id) {
                        const d = Math.sqrt((x * 32 + 16 - this.x)**2 + (y * 32 + 16 - this.y)**2);
                        if (d < minDst) {
                            minDst = d;
                            // For tiles, obj needs x/y or special handling. 
                            closest = { type: 'structure', obj: { x: x * 32 + 16, y: y * 32 + 16, hp: 1 }, x: x, y: y }; 
                        }
                    }
                }
            }
        }

        return closest;
    }

    performAttack(game, target) {
        // [MODIFIED] Added offset to particles so they appear "between" combatants
        game.spawnParticles(this.x + (Math.random()-0.5)*10, this.y + (Math.random()-0.5)*10, '#fff', 3);
        
        if (target.type === 'player') {
            const p = target.obj;
            if (p === game.player && !game.godMode) {
                game.player.hp -= 10;
                game.spawnText(p.x, p.y - 20, "-10", "#f00");
            } else if (p.type === 'peer') {
                game.network.sendHit(p.id, 10);
            }
        } else if (target.type === 'structure') {
            // Apply damage to tile
            game.applyDamageToTile(target.x, target.y, 15);
        }
    }
}