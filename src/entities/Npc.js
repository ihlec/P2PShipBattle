import { Entity } from './Entity.js';
import { Projectile } from './Projectile.js';
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
        this.npcType = 'raider';
        this.hp = 60;
        this.maxHp = 60;
        this.speed = 2.2;
        this.activeMelee = TILES.SWORD_IRON.id;
        this.attackCooldown = 0;
        this.searchTimer = 0;
        this.target = null;
    }

    updateAI(deltaTime, player, world, game) {
        if (this.attackCooldown > 0) this.attackCooldown--;

        this.searchTimer--;
        if (this.searchTimer <= 0 || (this.target && this.target.obj.hp <= 0)) {
            this.target = this.findTarget(game, world);
            this.searchTimer = 10; 
        }

        const sep = this.getSeparationForce(game);

        if (this.target) {
            const tObj = this.target.obj;
            const tx = tObj.x !== undefined ? tObj.x : (this.target.x * CONFIG.TILE_SIZE + 16);
            const ty = tObj.y !== undefined ? tObj.y : (this.target.y * CONFIG.TILE_SIZE + 16);
            const dist = Math.sqrt((tx - this.x)**2 + (ty - this.y)**2);

            if (dist < 28) {
                if (this.attackCooldown <= 0) {
                    this.performAttack(game, this.target);
                    this.attackCooldown = 60;
                }
            } else {
                const angle = Math.atan2(ty - this.y + sep.y, tx - this.x + sep.x);
                this.move(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed, world, game);
            }
        } else {
            if (Math.random() < 0.02) this.moveAngle = Math.random() * 6.28;
            if (this.moveAngle !== undefined) {
                const angle = Math.atan2(Math.sin(this.moveAngle) + sep.y, Math.cos(this.moveAngle) + sep.x);
                this.move(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, world, game);
            }
        }
    }

    findTarget(game, world) {
        let closest = null;
        let minDst = 600;

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

        if (game.workers) {
            game.workers.forEach(w => {
                if (w.hp > 0) {
                    const d = Utils.distance(this, w);
                    if (d < minDst) { minDst = d; closest = { type: 'worker', obj: w }; }
                }
            });
        }

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
                            closest = { type: 'structure', obj: { x: x * 32 + 16, y: y * 32 + 16, hp: 1 }, x: x, y: y }; 
                        }
                    }
                }
            }
        }

        return closest;
    }

    performAttack(game, target) {
        game.spawnParticles(this.x + (Math.random()-0.5)*10, this.y + (Math.random()-0.5)*10, '#fff', 3);
        
        if (target.type === 'player') {
            const p = target.obj;
            if (p === game.player && !game.godMode) {
                game.player.hp -= 10;
                game.spawnText(p.x, p.y - 20, "-10", "#f00");
            } else if (p.type === 'peer') {
                game.network.sendHit(p.id, 10);
            }
        } else if (target.type === 'worker') {
            target.obj.hp -= 10;
            game.spawnText(target.obj.x, target.obj.y - 10, "-10", "#f00");
        } else if (target.type === 'structure') {
            game.applyDamageToTile(target.x, target.y, 15);
        }
    }
}

export class Archer extends Entity {
    constructor(x, y) {
        super(x, y, 'npc');
        this.npcType = 'archer';
        this.hp = 40;
        this.maxHp = 40;
        this.speed = 2.0;
        this.activeMelee = TILES.SPEAR_WOOD.id;
        this.attackCooldown = 0;
        this.searchTimer = 0;
        this.target = null;
    }

    updateAI(deltaTime, player, world, game) {
        if (this.attackCooldown > 0) this.attackCooldown--;

        this.searchTimer--;
        if (this.searchTimer <= 0 || (this.target && this.target.obj.hp <= 0)) {
            this.target = this.findTarget(game);
            this.searchTimer = 15;
        }

        const sep = this.getSeparationForce(game);

        if (this.target) {
            const p = this.target.obj;
            const dist = Utils.distance(this, p);
            const PREFERRED = 250;
            const MIN_DIST = 150;

            if (dist < MIN_DIST) {
                const angle = Math.atan2(this.y - p.y, this.x - p.x);
                this.move(Math.cos(angle) * this.speed + sep.x, Math.sin(angle) * this.speed + sep.y, world, game);
            } else if (dist > PREFERRED) {
                const angle = Math.atan2(p.y - this.y + sep.y, p.x - this.x + sep.x);
                this.move(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed, world, game);
            }

            if (dist < 350 && this.attackCooldown <= 0) {
                this.shootAt(game, p.x, p.y);
                this.attackCooldown = 90;
            }
        } else {
            if (Math.random() < 0.02) this.moveAngle = Math.random() * 6.28;
            if (this.moveAngle !== undefined) {
                this.move(Math.cos(this.moveAngle) * 0.5 + sep.x, Math.sin(this.moveAngle) * 0.5 + sep.y, world, game);
            }
        }
    }

    shootAt(game, tx, ty) {
        const proj = new Projectile(this.x, this.y - 10, tx, ty, 15, 8, '#5C3317', false, 'spear', this.id);
        proj.life = 40;
        game.projectiles.push(proj);
        game.spawnParticles(this.x, this.y, '#8B4513', 3);
    }

    findTarget(game) {
        let closest = null;
        let minDst = 400;
        const players = [game.player, ...Object.values(game.peers)];
        players.forEach(p => {
            if (p.hp > 0 && !p.godMode) {
                const d = Utils.distance(this, p);
                if (d < minDst) { minDst = d; closest = { type: 'player', obj: p }; }
            }
        });
        if (game.workers) {
            game.workers.forEach(w => {
                if (w.hp > 0) {
                    const d = Utils.distance(this, w);
                    if (d < minDst) { minDst = d; closest = { type: 'worker', obj: w }; }
                }
            });
        }
        return closest;
    }
}

export class Brute extends Entity {
    constructor(x, y) {
        super(x, y, 'npc');
        this.npcType = 'brute';
        this.hp = 150;
        this.maxHp = 150;
        this.speed = 1.2;
        this.activeMelee = TILES.SWORD_IRON.id;
        this.attackCooldown = 0;
        this.searchTimer = 0;
        this.target = null;
    }

    updateAI(deltaTime, player, world, game) {
        if (this.attackCooldown > 0) this.attackCooldown--;

        this.searchTimer--;
        if (this.searchTimer <= 0 || (this.target && this.target.obj && this.target.obj.hp <= 0)) {
            this.target = this.findTarget(game, world);
            this.searchTimer = 10;
        }

        const sep = this.getSeparationForce(game, 28);

        if (this.target) {
            const tObj = this.target.obj;
            const tx = tObj.x !== undefined ? tObj.x : (this.target.x * CONFIG.TILE_SIZE + 16);
            const ty = tObj.y !== undefined ? tObj.y : (this.target.y * CONFIG.TILE_SIZE + 16);
            const dist = Math.sqrt((tx - this.x)**2 + (ty - this.y)**2);

            if (dist < 30) {
                if (this.attackCooldown <= 0) {
                    this.performAttack(game, this.target);
                    this.attackCooldown = 50;
                }
            } else {
                const angle = Math.atan2(ty - this.y + sep.y, tx - this.x + sep.x);
                this.move(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed, world, game);
            }
        } else {
            if (Math.random() < 0.02) this.moveAngle = Math.random() * 6.28;
            if (this.moveAngle !== undefined) {
                this.move(Math.cos(this.moveAngle) * 0.5 + sep.x, Math.sin(this.moveAngle) * 0.5 + sep.y, world, game);
            }
        }
    }

    findTarget(game, world) {
        let closest = null;
        let minDst = 800;

        const gx = Math.floor(this.x / CONFIG.TILE_SIZE);
        const gy = Math.floor(this.y / CONFIG.TILE_SIZE);
        const range = 8;

        for (let y = gy - range; y <= gy + range; y++) {
            for (let x = gx - range; x <= gx + range; x++) {
                const id = world.getTile(x, y);
                const def = ID_TO_TILE[id];
                if (def && (def.hp || id === TILES.TORCH.id) && id !== TILES.TREE.id && id !== TILES.STONE_BLOCK.id) {
                    const d = Math.sqrt((x * 32 + 16 - this.x)**2 + (y * 32 + 16 - this.y)**2);
                    if (d < minDst) {
                        minDst = d;
                        closest = { type: 'structure', obj: { x: x * 32 + 16, y: y * 32 + 16, hp: 1 }, x: x, y: y };
                    }
                }
            }
        }

        if (!closest) {
            const players = [game.player, ...Object.values(game.peers)];
            players.forEach(p => {
                if (p.hp > 0 && !p.godMode) {
                    const d = Utils.distance(this, p);
                    if (d < minDst) { minDst = d; closest = { type: 'player', obj: p }; }
                }
            });
        }

        if (game.workers) {
            game.workers.forEach(w => {
                if (w.hp > 0) {
                    const d = Utils.distance(this, w);
                    if (d < minDst) { minDst = d; closest = { type: 'worker', obj: w }; }
                }
            });
        }

        return closest;
    }

    performAttack(game, target) {
        game.spawnParticles(this.x + (Math.random()-0.5)*10, this.y + (Math.random()-0.5)*10, '#fff', 5);

        if (target.type === 'player') {
            const p = target.obj;
            if (p === game.player && !game.godMode) {
                game.player.hp -= 20;
                game.spawnText(p.x, p.y - 20, "-20", "#f00");
            } else if (p.type === 'peer') {
                game.network.sendHit(p.id, 20);
            }
        } else if (target.type === 'worker') {
            target.obj.hp -= 20;
            game.spawnText(target.obj.x, target.obj.y - 10, "-20", "#f00");
        } else if (target.type === 'structure') {
            game.applyDamageToTile(target.x, target.y, 30);
        }
    }
}