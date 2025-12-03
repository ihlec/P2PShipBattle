import { CONFIG, TILES, ID_TO_TILE } from '../config.js';
import Utils from '../utils.js';
import InputHandler from './InputHandler.js';
import Network from './Network.js';
import World from '../world/World.js';
import Renderer from '../systems/Renderer.js';
import UIManager from '../systems/UIManager.js';
import ParticleSystem from '../world/ParticleSystem.js';
import { Entity } from '../entities/Entity.js';
import { Projectile } from '../entities/Projectile.js';
import { Sheep, Raider } from '../entities/Npc.js';
import { Boat } from '../entities/Boat.js';

export default class Game {
    constructor(roomId, isHost, playerName, loadData) {
        this.canvas = document.getElementById('gameCanvas');
        
        this.input = new InputHandler(this);
        this.world = new World();
        this.particles = new ParticleSystem();
        this.network = new Network(this, roomId, isHost, playerName);
        this.ui = new UIManager(this);
        this.renderer = new Renderer(this, this.canvas);

        this.peers = {};
        this.spawnPoint = { x: 0, y: 0 };
        this.deathCount = 0;
        this.respawnTimer = 0;
        this.isRespawning = false;
        
        this.npcs = [];
        this.animals = [];
        this.boats = [];
        this.loot = [];
        this.projectiles = [];
        this.cannons = []; 

        this.camera = { x: 0, y: 0 };
        this.zoom = 1;
        
        this.lastFrameTime = 0;
        this.regenTimer = 0;
        this.godMode = false;
        this.activeBlueprint = null;
        this.shootCooldown = 0;

        this.invasionTimer = (loadData && loadData.invasion) ? (loadData.invasion.timer || 0) : 0;
        this.nextInvasionTime = (loadData && loadData.invasion) ? (loadData.invasion.next || 0) : 0;

        this.initializeGame(isHost, loadData);
        this.setupBindings();
        
        requestAnimationFrame(timestamp => this.gameLoop(timestamp));
    }

    initializeGame(isHost, loadData) {
        let startPosition = { x: 0, y: 0 };
        let savedBoats = [];

        if (isHost) {
            if (loadData) {
                this.world.importData(loadData.world);
                startPosition = { x: loadData.player.x, y: loadData.player.y };
                if (loadData.deathCount) this.deathCount = loadData.deathCount;
                if (loadData.boats) savedBoats = loadData.boats;
                console.log("Save loaded successfully.");
            } else {
                startPosition = this.findSafeSpawnPoint();
            }
            this.spawnPoint = { ...startPosition };
        }

        this.player = new Entity(startPosition.x, startPosition.y, 'player');
        
        if (loadData && isHost) {
            this.player.hp = loadData.player.hp;
            this.player.inventory = loadData.player.inventory;
            this.player.activeMelee = loadData.player.activeMelee || 'hand';
            this.player.activeRange = loadData.player.activeRange || TILES.GREY.id;
            
            if (savedBoats.length > 0) {
                 this.boats = savedBoats.map(b => {
                        const boat = new Boat(b.x, b.y, b.owner || 'player');
                        boat.hp = b.hp;
                        return boat;
                    });
            }
        }

        if (isHost) {
            this.recalculateCannons();
        }

        this.particles.initWind(this.canvas.width, this.canvas.height);
        this.ui.update();
    }

    setupBindings() {
        document.getElementById('hammer-btn').onclick = () => this.ui.toggleBlueprints();
        document.getElementById('weapon-btn').onclick = () => this.ui.toggleWeapons();
        document.getElementById('btn-save').onclick = () => this.saveGame();

        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.particles.initWind(this.canvas.width, this.canvas.height);
        });

        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.godMode = !this.godMode;
                this.showMessage(this.godMode ? "GOD MODE ON" : "GOD MODE OFF");
                this.ui.update();
            }
        });
    }

    findSafeSpawnPoint() {
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 5000;
            const y = (Math.random() - 0.5) * 5000;
            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const id = this.world.getTile(gx, gy);
            const def = ID_TO_TILE[id];

            if (!def.solid && !def.isWater) {
                 return { x: gx * CONFIG.TILE_SIZE + 16, y: gy * CONFIG.TILE_SIZE + 16 };
            }
        }
        return { x: 16, y: 16 };
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;
        this.update(deltaTime);
        this.renderer.draw();
        requestAnimationFrame(t => this.gameLoop(t));
    }

    update(deltaTime) {
        this.handleCameraZoom();
        this.network.update(deltaTime);
        this.world.update(deltaTime);
        this.particles.update(this.canvas.width, this.canvas.height, this.world.wind.angle, this.camera, this.zoom);
        
        this.updatePeers();
        this.updatePlayer(deltaTime); 
        this.updateEntities(deltaTime);
        this.updateProjectiles();
        this.updateHostAI(deltaTime); 
        this.updateLoot(); 

        this.cleanupEntities();
        this.ui.update();
        this.input.flush();
    }

    updatePlayer(deltaTime) {
        if (this.shootCooldown > 0) this.shootCooldown--;

        if (!this.isRespawning && this.player.hp > 0 && this.player.hp < 100) {
            this.regenTimer += deltaTime;
            if (this.regenTimer > 2000) {
                this.player.hp = Math.min(100, this.player.hp + 5);
                this.spawnText(this.player.x, this.player.y - 20, "+5 HP", "#0f0");
                this.regenTimer = 0;
            }
        }

        if (this.player.hp <= 0 && !this.isRespawning) {
             this.handlePlayerDeath();
        }

        if (this.isRespawning) {
            this.handleRespawnTimer(deltaTime);
            return;
        }

        this.player.handleInput(this.input, deltaTime, this.world, this);
        this.handleInteraction(); 
        this.updateMeleeCombat();
    }

    updateLoot() {
        this.loot = this.loot.filter(l => {
            if (Utils.distance(this.player, l) < 32) {
                if (!this.network.isHost) {
                    this.network.actions.sendEntReq({ id: l.uid, act: 'pickup' });
                }

                if (l.id === TILES.CRATE.id) {
                    const wood = 10 + Math.floor(Math.random() * 10);
                    const iron = 5 + Math.floor(Math.random() * 5);
                    this.player.inventory[TILES.WOOD.id] += wood;
                    this.player.inventory[TILES.IRON.id] += iron;
                    this.spawnText(this.player.x, this.player.y - 40, `+${wood} Wood`, "#f0aa00");
                    this.spawnText(this.player.x, this.player.y - 20, `+${iron} Iron`, "#aaa");
                } else {
                    this.player.inventory[l.id] = (this.player.inventory[l.id] || 0) + l.qty;
                    this.spawnText(this.player.x, this.player.y - 30, `+${l.qty} ${ID_TO_TILE[l.id].short}`, "#ff0");
                }
                this.ui.update();
                return false; 
            }
            return true;
        });
    }

    handleInteraction() {
        if (!this.input.mouse.clickedLeft && !this.input.mouse.clickedRight) return;
        
        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);
        
        if (Utils.distance(this.player, { x: mx, y: my }) > CONFIG.BUILD_RANGE) return;

        const isOccupied = (tx, ty) => {
            const tileRect = { l: tx * 32, r: (tx+1) * 32, t: ty * 32, b: (ty+1) * 32 };
            const all = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)];
            return all.some(e => {
                return (e.x-8 < tileRect.r && e.x+8 > tileRect.l && e.y-8 < tileRect.b && e.y+8 > tileRect.t);
            });
        };

        if (this.input.mouse.clickedLeft) {
            const clickedTile = this.world.getTile(gx, gy);
            const cannon = this.cannons.find(c => { const [cx, cy] = c.key.split(',').map(Number); return gx === cx && gy === cy; });
            
            if (cannon && this.player.selectedTile === TILES.IRON.id) {
                if (this.player.inventory[TILES.IRON.id] > 0 || this.godMode) {
                    if (!this.godMode) this.player.inventory[TILES.IRON.id]--;
                    if (this.network.isHost) {
                        cannon.ammo += 5;
                        this.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
                    } else {
                        this.network.actions.sendEntReq({ id: cannon.key, act: 'refill' });
                    }
                    return;
                }
            }
            
            if (!this.activeBlueprint) {
                // Gate Logic
                if ((clickedTile === TILES.WOOD_WALL.id || clickedTile === TILES.WOOD_WALL_OPEN.id) && 
                    Utils.distance(this.player, {x: mx, y: my}) < 120) {
                    
                    const newId = (clickedTile === TILES.WOOD_WALL.id) ? TILES.WOOD_WALL_OPEN.id : TILES.WOOD_WALL.id;
                    
                    if (this.network.isHost) {
                        this.world.setTile(gx, gy, newId);
                        this.network.broadcastBuild(gx, gy, newId);
                    } else {
                        this.network.requestBuild(gx, gy, newId);
                    }
                    // Prevent shooting when opening a gate
                    return;
                }

                const sel = this.player.selectedTile;
                if (!sel) {
                    this.throwProjectile(mx, my);
                    return;
                }
                const tileDef = ID_TO_TILE[sel];
                if (tileDef.solid && isOccupied(gx, gy)) { this.spawnText(mx, my, "BLOCKED", "#f00"); return; }
                if (this.tryBuild(gx, gy, sel)) {
                    if (!this.godMode) this.player.inventory[sel]--;
                    this.recalculateCannons();
                }
                return;
            }
            
            if (this.activeBlueprint) {
                const costMap = this.activeBlueprint.cost || {};
                let affordable = true;
                for (let [id, qty] of Object.entries(costMap)) {
                     if ((this.player.inventory[id] || 0) < qty && !this.godMode) affordable = false;
                }
                
                if (affordable) {
                    if (this.activeBlueprint.special === 'boat') {
                        if (![TILES.WATER.id, TILES.DEEP_WATER.id].includes(this.world.getTile(gx, gy))) return;
                        if (!this.godMode) for (let [id, qty] of Object.entries(costMap)) this.player.inventory[id] -= qty;
                        
                        if (this.network.isHost) {
                             this.boats.push(new Boat(gx*32+16, gy*32+16));
                             this.spawnParticles(gx*32+16, gy*32+16, '#8B4513', 8);
                        } else {
                             this.network.actions.sendEntReq({ act: 'spawnBoat', x: gx*32+16, y: gy*32+16 });
                        }
                    } else {
                        let built = false;
                        const isBridge = this.activeBlueprint.special === 'bridge';
                        this.activeBlueprint.structure.forEach(part => {
                             if(this.tryBuild(gx + part.x, gy + part.y, part.id, false, isBridge)) built = true;
                        });
                        
                        if (built) {
                            if (!this.godMode) for (let [id, qty] of Object.entries(costMap)) this.player.inventory[id] -= qty;
                            this.recalculateCannons();
                        }
                    }
                } else {
                    this.spawnText(mx, my, "TOO EXPENSIVE", "#f00");
                }
            }

        } else if (this.input.mouse.clickedRight) {
            
            if (this.activeBlueprint) {
                this.activeBlueprint = null;
                this.ui.update();
                return;
            }

            // Board/Unboard
            if (this.player.inBoat) {
                const clickedTile = this.world.getTile(gx, gy);
                const allowed = [TILES.GRASS.id, TILES.SAND.id, TILES.GREY.id, TILES.WOOD_RAIL.id];
                if (allowed.includes(clickedTile) && Utils.distance(this.player, {x:mx, y:my}) < 100) {
                     const newBoat = new Boat(this.player.x, this.player.y);
                     newBoat.hp = this.player.hp;
                     this.player.hp = this.player.storedHp || 100;
                     this.player.inBoat = false;
                     this.player.x = gx*32+16; 
                     this.player.y = gy*32+16;
                     
                     if(this.network.isHost) this.boats.push(newBoat);
                     else this.network.actions.sendEntReq({ act: 'spawnBoat', x: newBoat.x, y: newBoat.y });
                     return;
                }
            } else {
                const boatIdx = this.boats.findIndex(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (boatIdx !== -1 && Utils.distance(this.player, this.boats[boatIdx]) < 100) {
                     const boat = this.boats[boatIdx];
                     this.player.storedHp = this.player.hp;
                     this.player.hp = boat.hp;
                     this.player.inBoat = true;
                     this.player.x = boat.x; 
                     this.player.y = boat.y;
                     this.player.boatStats = boat.boatStats;
                     
                     if (this.network.isHost) this.boats.splice(boatIdx, 1);
                     else {
                         this.network.actions.sendEntReq({ act: 'enterBoat', id: boat.id });
                         this.boats.splice(boatIdx, 1); 
                     }
                     return;
                }
            }

            // Shear Sheep
            const clickedSheep = this.animals.find(s => Utils.distance(s, { x: mx, y: my }) < 24);
            if (clickedSheep && clickedSheep.hasWool) {
                if (this.network.isHost) {
                    clickedSheep.hasWool = false;
                    clickedSheep.woolTimer = CONFIG.WOOL_REGROW_TIME;
                    this.spawnLoot(clickedSheep.x, clickedSheep.y, 'sheep');
                    this.spawnParticles(clickedSheep.x, clickedSheep.y, '#eee', 5);
                } else {
                    this.network.actions.sendEntReq({ id: clickedSheep.id, act: 'shear' });
                }
                return;
            }
            
            // Remove/Attack Tile
            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            
            // Simplified check: Directly target the clicked tile
            if (tileId === TILES.TREE.id || (tileDef && tileDef.hp) || [TILES.GREY.id, TILES.WOOD.id, TILES.WOOD_RAIL.id].includes(tileId)) {
                this.applyDamageToTile(gx, gy, 20); 
            }
        }
    }

    tryBuild(gx, gy, id, allowRailOverwrite = false, isBridge = false, force = false) {
        if (!this.network.isHost && !force) {
            this.network.requestBuild(gx, gy, id);
            return false;
        }

        const current = this.world.getTile(gx, gy);
        if (current === id) return false;
        
        if ((current === TILES.WATER.id || current === TILES.DEEP_WATER.id) && !isBridge) return false;

        this.world.setTile(gx, gy, id);
        if (this.network.isHost && !force) this.network.broadcastBuild(gx, gy, id);
        return true;
    }

    throwProjectile(tx, ty) {
        if (this.shootCooldown > 0) return;
        const weaponId = this.player.activeRange;
        let damage = 25, speed = 8, color = '#aaa', range = 25, type = 'stone';
        
        if (weaponId === TILES.SPEAR_WOOD.id) { damage = 35; speed = 10; color = '#8B4513'; range = 45; type = 'spear'; }
        else if (weaponId === TILES.SPEAR_IRON.id) { damage = 60; speed = 14; color = '#aaa'; range = 50; type = 'spear'; }

        if (!this.godMode && (this.player.inventory[weaponId] || 0) <= 0) {
             this.spawnText(this.player.x, this.player.y - 20, "NO AMMO", "#f00"); 
             return;
        }

        if (!this.godMode) this.player.inventory[weaponId]--;
        
        const proj = new Projectile(this.player.x, this.player.y - 10, tx, ty, damage, speed, color, true, type);
        proj.life = range;
        this.projectiles.push(proj);
        this.shootCooldown = 30;
        
        if (type === 'stone') this.spawnParticles(this.player.x, this.player.y, '#aaa', 3);
        this.ui.update();
    }

    updateMeleeCombat() {
        // Reverting to original condition + cooldown check
        if ((!this.player.isMoving && this.player.activeMelee === 'hand') || this.shootCooldown > 0) return;

        let dmg = 0;
        const meleeId = this.player.activeMelee;
        if (meleeId === TILES.SWORD_IRON.id) dmg = 90;
        else if (meleeId === TILES.SWORD_WOOD.id) dmg = 50;
        else if (meleeId === 'hand') dmg = 5; 
        if (dmg === 0) return;

        // 1. Check Entities (NPCs, Animals)
        const targets = [...this.npcs, ...this.animals];
        for (const t of targets) {
            if (Utils.distance(this.player, t) < CONFIG.TILE_SIZE + 10) {
                this.applyDamageToEntity(t, dmg);
                this.shootCooldown = 20;
                return;
            }
        }

        // 2. Check Trees (Melee) - REMOVED
        // Melee attacks no longer damage trees or boulders.
    }

    spawnLoot(x, y, type) {
        let dropId = TILES.GREY.id;
        let qty = 1;
        
        // Fix: Properly handle tree drops
        if (type === 'sheep') { 
            dropId = TILES.WOOL.id; qty = 2; 
        } else if (type === 'tree' || type === TILES.TREE.id) {
            // Chance for Greens
            if (Math.random() < 0.2) {
                dropId = TILES.GREENS.id; 
                qty = 1;
            } else {
                dropId = TILES.WOOD.id; 
                qty = 3;
            }
        }
        
        this.loot.push({ 
            uid: Math.random().toString(36).substr(2, 9), 
            x: x, y: y, id: dropId, qty: qty, 
            bob: Math.random() * 100 
        });
    }

    applyDamageToEntity(entity, damage, isProjectile) {
        if (entity.hp <= 0) return;
        if (entity === this.player && this.godMode) return;

        if (entity.type === 'peer') {
            if (this.network.isHost) {
                this.network.sendHit(entity.id, damage);
                entity.hp -= damage;
            }
        } else if (this.network.isHost) {
            entity.hp -= damage;
        } else {
            this.network.actions.sendEntHit({ id: entity.id, dmg: damage });
        }

        this.spawnParticles(entity.x, entity.y, '#f00', 5);
        this.spawnText(entity.x, entity.y, Math.floor(damage), "#fff");
    }
    
    applyDamageToTile(gx, gy, damage) {
        const tileId = this.world.getTile(gx, gy);
        const tileDef = ID_TO_TILE[tileId];

        if (!tileDef || (!tileDef.hp && tileId !== TILES.TREE.id)) return;
        
        // Removed explicit "instant-kill" block for trees. 
        // Trees now rely on tileDef.hp just like walls and boulders.

        const tx = gx * CONFIG.TILE_SIZE + 16;
        const ty = gy * CONFIG.TILE_SIZE + 16;
        
        if (this.network.isHost) {
            const totalDmg = this.world.hitTile(gx, gy, damage);
            
            // Use tile color for particles to support trees (brown) and stone (grey)
            this.spawnParticles(tx, ty, tileDef.color, 3);
            this.spawnText(tx, ty, `-${damage}`, '#fff');
            
            // Note: Trees now have 40 HP defined in config.js, so this logic works naturally.
            // Boulders have 80 HP.
            if (totalDmg >= tileDef.hp) {
                const biome = Utils.getBiome(gx, gy, this.world.seed);
                let restoreId = TILES.GRASS.id;
                if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;
                
                this.network.requestRemove(gx, gy, restoreId);
                // Tree Loot drop happens here now
                if (tileId === TILES.TREE.id) {
                    this.spawnLoot(tx, ty, 'tree');
                }
                this.spawnParticles(tx, ty, tileDef.color, 10);
                this.recalculateCannons();
            } else {
                this.network.broadcastTileHit(gx, gy, damage);
            }
        } else {
            this.network.actions.sendTileReq({ 
                x: gx, 
                y: gy, 
                dmg: damage, 
                type: 'damage' 
            });
        }
    }

    spawnText(x, y, txt, col) { this.particles.spawnFloatingText(x, y, txt, col); }
    spawnParticles(x, y, col, count) { this.particles.spawnExplosion(x, y, col, count); }

    recalculateCannons() {
        if (!this.player) return;

        const range = 30;
        const activeCannons = new Map();
        const viewers = [this.player, ...Object.values(this.peers)];

        viewers.forEach(p => {
            if (!p) return; 
            const px = Math.floor(p.x / CONFIG.TILE_SIZE);
            const py = Math.floor(p.y / CONFIG.TILE_SIZE);
            for (let y = py - range; y < py + range; y++) {
                for (let x = px - range; x < px + range; x++) {
                    const key = `${x},${y}`;
                    if (activeCannons.has(key)) continue;
                    const id = this.world.getTile(x, y);
                    const tile = ID_TO_TILE[id];
                    if (tile && tile.isTower) {
                         activeCannons.set(key, { key, x: x*32+16, y: y*32+16, damage: tile.cannonDamage||20, cooldown: 0, ammo: 10, range: 300 });
                    }
                }
            }
        });
        this.cannons = Array.from(activeCannons.values());
    }

    updateHostAI(dt) {
         if (!this.network.isHost) return;

         // 1. Spawning Animals (Sheep)
         if (this.animals.length < 10 && Math.random() < 0.005) {
            const ang = Math.random() * 6.28;
            const dist = 600;
            const nx = this.player.x + Math.cos(ang) * dist;
            const ny = this.player.y + Math.sin(ang) * dist;
            const ngx = Math.floor(nx / CONFIG.TILE_SIZE);
            const ngy = Math.floor(ny / CONFIG.TILE_SIZE);
            const tileId = this.world.getTile(ngx, ngy);
            const tileDef = ID_TO_TILE[tileId];
            
            if (!tileDef.solid && !tileDef.isWater) {
                this.animals.push(new Sheep(nx, ny));
            }
         }

         // 2. Animal AI
         this.animals.forEach(s => {
            s.updateAI(dt, this.player, this.world, this);
            if (s.isMoving) s.moveTime += dt;
         });

         // 3. NPC/Enemy Logic
         this.npcs.forEach(npc => {
            if (npc.updateAI) {
                npc.updateAI(dt, this.player, this.world, this);
            } else {
                // Fallback for simple entities if any
                if (!npc.aiState) npc.aiState = { mode: 'chase', tx: 0, ty: 0, timer: 0, target: null };
                // ... (Existing fallback logic if needed, but Raider handles itself) ...
            }
            if (npc.isMoving) npc.moveTime += dt;
         });

         // 4. Enemy Boat Spawning
         // Use the new createInvasionForce logic
         const boatCount = this.boats.filter(b => b.owner === 'enemy').length;
         if (boatCount < 2 && Math.random() < 0.001) { // 0.1% chance per frame to attempt spawn
             const enemyBoat = Boat.createInvasionForce(this);
             if (enemyBoat) {
                 this.boats.push(enemyBoat);
                 this.spawnText(enemyBoat.x, enemyBoat.y, "ENEMY SHIP!", "#ff0000");
             }
         }

         // 5. Boat AI
         this.boats.forEach(b => {
             if (b.owner === 'enemy') {
                 b.updateAI(dt, this.player, this.world, this);
             }
         });
    }

    findClosestTarget(npc) {
        let closest = null;
        let minDst = 600;
        const players = [this.player, ...Object.values(this.peers)];
        players.forEach(p => {
            if (p.hp > 0 && !p.godMode) {
                const d = Utils.distance(npc, p);
                if (d < minDst) { minDst = d; closest = { type: 'entity', obj: p, x: p.x, y: p.y }; }
            }
        });
        return closest;
    }

    tryHostAttack(npc, target) {
        const tObj = target.obj || target;
        const dist = Math.sqrt((tObj.x - npc.x) ** 2 + (tObj.y - npc.y) ** 2);
        if (!npc.attackCooldown) npc.attackCooldown = 0;
        if (npc.attackCooldown > 0) npc.attackCooldown--;
        if (dist < 13 && npc.attackCooldown <= 0) {
            npc.attackCooldown = 60;
            const dmg = 5;
            if (target.type === 'entity') {
                const ent = target.obj;
                if (ent.hp > 0) {
                    if (ent === this.player && !this.godMode) this.player.hp -= dmg;
                    else if (ent.type === 'peer') this.network.sendHit(ent.id, dmg);
                    else ent.hp -= dmg;
                    this.spawnParticles(ent.x, ent.y, '#f00', 2);
                }
            }
        }
    }
    
    updateEntities(deltaTime) {
        [...this.npcs, ...this.animals, ...this.boats].forEach(e => {
            if(!this.network.isHost) {
                const dx = e.targetX - e.x;
                const dy = e.targetY - e.y;
                e.x += dx * 0.15; e.y += dy * 0.15;
            }
        });
    }

    updateProjectiles() {
        this.projectiles.forEach(p => {
            p.update();
            if (!p.active) return;

            // 1. Check Entities
            const targets = [...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)];
            for (const t of targets) {
                // Don't hit self or owner if possible (simplified here)
                if (p.owner === 'player' && t === this.player) continue;
                
                if (Utils.distance(p, t) < 20) {
                    this.applyDamageToEntity(t, p.damage);
                    p.active = false;
                    return;
                }
            }

            // 2. Check Tiles
            const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            
            // Hit HP-tiles (but NOT Trees or Boulders via projectile)
            if (tileDef && tileDef.hp && tileId !== TILES.TREE.id && tileId !== TILES.STONE_BLOCK.id) {
                this.applyDamageToTile(gx, gy, p.damage);
                p.active = false;
                return;
            }
        });
        this.projectiles = this.projectiles.filter(p => p.active);
    }
    
    cleanupEntities() {
         if (this.network.isHost) {
            this.npcs = this.npcs.filter(n => n.hp > 0);
            // Loot spawns are handled in applyDamageToEntity, just filtering here
            this.npcs.forEach(n => {
                if(n.hp <= 0) {
                    // Assuming basic NPC drop for now if needed, currently no NPC loot logic beyond what's in Game.js already (which was minimal)
                }
            });
            this.boats = this.boats.filter(b => b.hp > 0);
            
            // Filter dead animals and drop loot
            const deadAnimals = this.animals.filter(a => a.hp <= 0);
            deadAnimals.forEach(a => {
                this.spawnLoot(a.x, a.y, 'sheep'); // Assuming all animals are sheep for now
                this.spawnParticles(a.x, a.y, '#f00', 8);
            });
            this.animals = this.animals.filter(a => a.hp > 0);
         }
    }

    handlePlayerDeath() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.deathCount++;
        this.respawnTimer = 3000 + (this.deathCount * 2000);
        this.spawnParticles(this.player.x, this.player.y, '#f00', 30);
        this.showMessage(`YOU DIED! RESPAWN IN ${Math.ceil(this.respawnTimer / 1000)}s`, "#f00");
    }

    handleRespawnTimer(deltaTime) {
        this.respawnTimer -= deltaTime;
        
        // Update the UI with the new time
        this.showMessage(`YOU DIED! RESPAWN IN ${Math.ceil(this.respawnTimer / 1000)}s`, "#f00");

        if (this.respawnTimer <= 0) {
            this.respawn();
            this.showMessage("", "#fff"); // Clear message on respawn
        }
    }
    
    respawn() {
        this.isRespawning = false;
        this.player.hp = 100;
        this.player.inBoat = false;
        this.player.x = this.spawnPoint.x;
        this.player.y = this.spawnPoint.y;
        this.ui.update();
    }
    
    handleCameraZoom() {
        if (this.input.wheel !== 0) {
            this.zoom = Math.max(0.3, Math.min(this.zoom - this.input.wheel * 0.001, 3));
        }
        const viewWidth = this.canvas.width / this.zoom;
        const viewHeight = this.canvas.height / this.zoom;
        this.camera.x = this.player.x - viewWidth / 2;
        this.camera.y = this.player.y - viewHeight / 2;
    }
    
    updatePeers() { 
        Object.values(this.peers).forEach(p => {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            p.x += dx * 0.15;
            p.y += dy * 0.15;
        });
    }
    
    saveGame() {
        const data = {
            player: {
                x: this.player.x, y: this.player.y, hp: this.player.hp,
                inventory: this.player.inventory, inBoat: this.player.inBoat,
                activeRange: this.player.activeRange,
                activeMelee: this.player.activeMelee,
                boatStats: this.player.boatStats
            },
            world: this.world.exportData(),
            boats: this.boats.map(b => ({ x: b.x, y: b.y, hp: b.hp, owner: b.owner })),
            invasion: { timer: this.invasionTimer, next: this.nextInvasionTime },
            deathCount: this.deathCount
        };
        try { 
            localStorage.setItem('pixelWarfareSave', JSON.stringify(data)); 
            this.showMessage("GAME SAVED", "#0f0"); 
        } catch (e) { 
            console.error(e); 
            this.showMessage("SAVE FAILED", "#f00"); 
        }
    }
    
    showMessage(txt, col) { document.getElementById('messages').innerText = txt; }
    
    cycleRangeWeapon() {
        const cycle = [TILES.GREY.id, TILES.SPEAR_WOOD.id, TILES.SPEAR_IRON.id];
        let idx = cycle.indexOf(this.player.activeRange);
        if (idx === -1) idx = 0;
        let found = false; let attempts = 0;
        while (!found && attempts < 3) {
            idx = (idx + 1) % cycle.length;
            const nextId = cycle[idx];
            if (nextId === TILES.GREY.id || (this.player.inventory[nextId] || 0) > 0 || this.godMode) {
                this.player.activeRange = nextId; found = true;
            }
            attempts++;
        }
        this.ui.update();
    }

    cycleMeleeWeapon() {
        const cycle = ['hand', TILES.SWORD_WOOD.id, TILES.SWORD_IRON.id];
        let idx = cycle.indexOf(this.player.activeMelee);
        if (idx === -1) idx = 0;
        let found = false; let attempts = 0;
        while (!found && attempts < 3) {
            idx = (idx + 1) % cycle.length;
            const nextId = cycle[idx];
            if (nextId === 'hand' || (this.player.inventory[nextId] || 0) > 0 || this.godMode) {
                this.player.activeMelee = nextId; found = true;
            }
            attempts++;
        }
        this.ui.update();
    }
}