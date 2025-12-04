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
        this.shake = 0; 
        
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
    }

    // [OPTIMIZED] Hybrid Spawn Strategy: Spiral (Center) -> Random (Global)
    findSafeSpawnPoint() {
        // 1. Spiral Search: Try to find land near 0,0 first
        let x = 0, y = 0;
        let dx = 0, dy = -1;
        const maxSpiralSteps = 10000; // Increased radius significantly
        
        for(let i=0; i<maxSpiralSteps; i++) {
            const gx = Math.floor(x);
            const gy = Math.floor(y);
            const id = this.world.getTile(gx, gy);
            const def = ID_TO_TILE[id];
            
            if (!def.solid && !def.isWater) {
                return { x: gx * CONFIG.TILE_SIZE + 16, y: gy * CONFIG.TILE_SIZE + 16 };
            }

            if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1-y)) {
                const temp = dx; dx = -dy; dy = temp;
            }
            x += dx;
            y += dy;
        }
        
        // 2. Random Fallback: If spiral fails (huge ocean), just pick random spots
        console.warn("Spiral spawn failed. Attempting global random search...");
        for(let i=0; i<1000; i++) {
            const rx = Math.floor((Math.random() - 0.5) * 2000); // Check +/- 1000 tiles
            const ry = Math.floor((Math.random() - 0.5) * 2000);
            const id = this.world.getTile(rx, ry);
            const def = ID_TO_TILE[id];
            
            if (!def.solid && !def.isWater) {
                return { x: rx * CONFIG.TILE_SIZE + 16, y: ry * CONFIG.TILE_SIZE + 16 };
            }
        }

        // 3. Absolute Last Resort
        return { x: 16, y: 16 };
    }

    gameLoop(timestamp) {
        let deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        if (deltaTime > 50) deltaTime = 50; 

        this.update(deltaTime);
        this.renderer.draw();
        requestAnimationFrame(t => this.gameLoop(t));
    }

    update(deltaTime) {
        if (this.shake > 0) this.shake *= 0.9;
        if (this.shake < 0.5) this.shake = 0;

        this.handleCameraZoom();
        this.network.update(deltaTime);
        this.world.update(deltaTime);
        this.particles.update(this.canvas.width, this.canvas.height, this.world.wind.angle, this.camera, this.zoom);
        
        this.updatePeers(deltaTime); 
        this.updatePlayer(deltaTime); 
        this.updateEntities(deltaTime);
        this.updateProjectiles();
        this.updateCannons(deltaTime); 
        this.updateHostAI(deltaTime); 
        this.updateLoot(); 

        this.cleanupEntities();
        this.ui.update();
        this.input.flush();
    }

    updatePlayer(deltaTime) {
        if (this.shootCooldown > 0) this.shootCooldown--;

        if (!this.isRespawning && !this.player.inBoat && this.player.hp > 0 && this.player.hp < 100) {
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

    isTileOccupied(tx, ty) {
        const tileRect = { l: tx * 32, r: (tx+1) * 32, t: ty * 32, b: (ty+1) * 32 };
        
        const all = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)].filter(e => e.hp > 0);
        
        return all.some(e => {
            return (e.x-10 < tileRect.r && e.x+10 > tileRect.l && e.y-10 < tileRect.b && e.y+10 > tileRect.t);
        });
    }

    handleInteraction() {
        if (!this.input.mouse.clickedLeft && !this.input.mouse.clickedRight) return;
        
        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);
        
        if (Utils.distance(this.player, { x: mx, y: my }) > CONFIG.BUILD_RANGE) return;

        if (this.input.mouse.clickedLeft) {
            const clickedTile = this.world.getTile(gx, gy);
            const cannon = this.cannons.find(c => { const [cx, cy] = c.key.split(',').map(Number); return gx === cx && gy === cy; });
            
            if (cannon) {
                let requiredId = null;
                if (clickedTile === TILES.TOWER_BASE_STONE.id) requiredId = TILES.GREY.id;
                else if (clickedTile === TILES.TOWER_BASE_IRON.id) requiredId = TILES.IRON.id;
                else if (clickedTile === TILES.TOWER_BASE_GOLD.id) requiredId = TILES.GOLD.id;

                if (requiredId && this.player.selectedTile === requiredId) {
                    if (this.player.inventory[requiredId] > 0 || this.godMode) {
                        if (!this.godMode) this.player.inventory[requiredId]--;
                        if (this.network.isHost) {
                            cannon.ammo += 5;
                            this.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
                            this.network.actions.sendCannon({ key: cannon.key, act: 'upd', ammo: cannon.ammo });
                        } else {
                            this.network.actions.sendEntReq({ id: cannon.key, act: 'refill' });
                        }
                        return;
                    }
                }
            }
            
            if (!this.activeBlueprint) {
                if ((clickedTile === TILES.WOOD_WALL.id || clickedTile === TILES.WOOD_WALL_OPEN.id) && 
                    Utils.distance(this.player, {x: mx, y: my}) < 120) {
                    const newId = (clickedTile === TILES.WOOD_WALL.id) ? TILES.WOOD_WALL_OPEN.id : TILES.WOOD_WALL.id;
                    if (this.network.isHost) {
                        this.world.setTile(gx, gy, newId);
                        this.network.broadcastBuild(gx, gy, newId);
                    } else {
                        this.network.requestBuild(gx, gy, newId);
                    }
                    return;
                }

                const sel = this.player.selectedTile;
                if (!sel) {
                    this.throwProjectile(mx, my);
                    return;
                }
                const tileDef = ID_TO_TILE[sel];
                
                if (tileDef.solid && this.isTileOccupied(gx, gy)) { 
                    this.spawnText(mx, my, "BLOCKED", "#f00"); 
                    return; 
                }

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
            
            if (this.activeBlueprint || this.player.selectedTile) {
                this.activeBlueprint = null;
                this.player.selectedTile = null;
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
            const destructible = [TILES.GREY.id, TILES.BLACK.id, TILES.IRON.id, TILES.GOLD.id, TILES.WOOD.id, TILES.WOOD_RAIL.id];

            if (tileId === TILES.TREE.id || (tileDef && tileDef.hp) || destructible.includes(tileId)) {
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
        
        const baseTerrains = [TILES.GRASS.id, TILES.SAND.id, TILES.WATER.id, TILES.DEEP_WATER.id];
        
        if (!baseTerrains.includes(current) && !allowRailOverwrite && current !== id) {
            return false;
        }

        const targetDef = ID_TO_TILE[id];
        if (targetDef.solid && this.isTileOccupied(gx, gy)) {
            return false;
        }

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
        
        const proj = new Projectile(this.player.x, this.player.y - 10, tx, ty, damage, speed, color, true, type, this.player.id);
        proj.life = range;
        this.projectiles.push(proj);
        this.shootCooldown = 30;
        
        this.network.actions.sendShoot({
            x: this.player.x, y: this.player.y - 10,
            tx: tx, ty: ty,
            dmg: damage, spd: speed,
            col: color, type: type,
            life: range
        });
        
        if (type === 'stone') this.spawnParticles(this.player.x, this.player.y, '#aaa', 3);
        this.ui.update();
    }

    updateMeleeCombat() {
        if ((!this.player.isMoving && this.player.activeMelee === 'hand') || this.shootCooldown > 0) return;

        let dmg = 0;
        const meleeId = this.player.activeMelee;
        if (meleeId === TILES.SWORD_IRON.id) dmg = 90;
        else if (meleeId === TILES.SWORD_WOOD.id) dmg = 50;
        else if (meleeId === 'hand') dmg = 5; 
        if (dmg === 0) return;

        const targets = [...this.npcs, ...this.animals];
        for (const t of targets) {
            if (Utils.distance(this.player, t) < CONFIG.TILE_SIZE + 10) {
                this.applyDamageToEntity(t, dmg);
                this.shootCooldown = 20;
                return;
            }
        }
    }

    spawnLoot(x, y, type) {
        let dropId = TILES.GREY.id;
        let qty = 1;
        
        if (type === 'sheep') { 
            dropId = TILES.WOOL.id; qty = 2; 
        } else if (type === 'raider') {
            // [NEW] Raider Drops: 70% Stone, 15% Obsidian, 10% Iron, 5% Gold
            const r = Math.random();
            if (r < 0.70) dropId = TILES.GREY.id;
            else if (r < 0.85) dropId = TILES.BLACK.id;
            else if (r < 0.95) dropId = TILES.IRON.id;
            else dropId = TILES.GOLD.id;
            qty = 1;
        } else if (type === 'tree' || type === TILES.TREE.id) {
            if (Math.random() < 0.2) {
                dropId = TILES.GREENS.id; 
                qty = 1;
            } else {
                dropId = TILES.WOOD.id; 
                qty = 3;
            }
        } else if (typeof type === 'number') {
            dropId = type;
            qty = 1;
            
            if (type === TILES.WALL.id) { dropId = TILES.GREY.id; qty = 1; }
            else if (type === TILES.WOOD_WALL.id || type === TILES.WOOD_WALL_OPEN.id) { dropId = TILES.WOOD.id; qty = 1; }
            else if (type === TILES.ROAD.id) { dropId = TILES.GREY.id; qty = 1; }
            else if (type === TILES.TORCH.id) { dropId = TILES.BLACK.id; qty = 1; }
            else if (type === TILES.WOOD_RAIL.id) { dropId = TILES.WOOD.id; qty = 1; }
            else if (type === TILES.TOWER_BASE_STONE.id) { dropId = TILES.GREY.id; qty = 2; }
            else if (type === TILES.TOWER_BASE_IRON.id) { dropId = TILES.IRON.id; qty = 2; }
            else if (type === TILES.TOWER_BASE_GOLD.id) { dropId = TILES.GOLD.id; qty = 2; }
            else if (type === TILES.MOUNTAIN.id) { 
                if (Math.random() < 0.2) {
                    dropId = TILES.IRON.id;
                } else {
                    dropId = TILES.GREY.id; 
                }
                qty = 1; 
            }
        }
        
        const newLoot = { 
            uid: Math.random().toString(36).substr(2, 9), 
            x: x, y: y, id: dropId, qty: qty, 
            bob: Math.random() * 100 
        };
        this.loot.push(newLoot);
    }

    applyDamageToEntity(entity, damage, isProjectile) {
        if (entity.hp <= 0) return;
        if (entity === this.player && this.godMode) return;
        if (isNaN(damage)) return; // [FIX] Safety check

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

        const destructible = [
            TILES.GREY.id, TILES.BLACK.id, TILES.IRON.id, TILES.GOLD.id, 
            TILES.WOOD.id, TILES.WOOD_RAIL.id
        ];

        if (!tileDef || (!tileDef.hp && tileId !== TILES.TREE.id && !destructible.includes(tileId))) return;
        
        if (tileId === TILES.TREE.id) {
             this.network.requestRemove(gx, gy, TILES.GRASS.id);
             this.spawnParticles(gx * CONFIG.TILE_SIZE + 16, gy * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 8);
             return;
        }

        const tx = gx * CONFIG.TILE_SIZE + 16;
        const ty = gy * CONFIG.TILE_SIZE + 16;
        
        if (this.network.isHost) {
            const totalDmg = this.world.hitTile(gx, gy, damage);
            
            this.spawnParticles(tx, ty, tileDef.color, 3);
            this.spawnText(tx, ty, `-${damage}`, '#fff');
            
            let destroyed = false;
            if (tileDef.hp) {
                if (totalDmg >= tileDef.hp) destroyed = true;
            } else if (destructible.includes(tileId)) {
                destroyed = true;
            } else if (tileId === TILES.TREE.id) {
                if (totalDmg >= tileDef.hp) destroyed = true;
            }

            if (destroyed) {
                const biome = Utils.getBiome(gx, gy, this.world.seed);
                let restoreId = TILES.GRASS.id;
                if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;
                
                this.network.requestRemove(gx, gy, restoreId);
                this.spawnParticles(tx, ty, tileDef.color, 10);
                this.triggerShake(5); 
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
        
        const oldCannons = new Map();
        if (this.cannons) {
            this.cannons.forEach(c => oldCannons.set(c.key, c));
        }

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
                         const existing = oldCannons.get(key);
                         const ammo = existing ? existing.ammo : 10;
                         const cooldown = existing ? existing.cooldown : 0;
                         
                         activeCannons.set(key, { 
                             key, 
                             x: x*32+16, 
                             y: y*32+16, 
                             damage: tile.cannonDamage||20, 
                             cooldown: cooldown, 
                             ammo: ammo, 
                             range: 300 
                         });
                    }
                }
            }
        });
        this.cannons = Array.from(activeCannons.values());
    }

    updateCannons(dt) {
        this.cannons.forEach(c => {
            if (c.cooldown > 0) c.cooldown--;
            if (c.ammo <= 0) return;

            let target = null;
            let minDst = c.range;
            
            const enemyBoats = this.boats.filter(b => b.owner === 'enemy');
            const targets = [...this.npcs, ...enemyBoats]; 

            targets.forEach(t => {
                if (t.hp > 0) {
                    const d = Math.sqrt((t.x - c.x)**2 + (t.y - c.y)**2);
                    if (d < minDst) {
                        minDst = d;
                        target = t;
                    }
                }
            });

            if (target && c.cooldown <= 0) {
                c.ammo--;
                c.cooldown = 60; 
                
                const proj = new Projectile(c.x, c.y - 20, target.x, target.y, c.damage, 10, '#000', true, 'cannonball');
                this.projectiles.push(proj);
                this.spawnParticles(c.x, c.y - 10, '#888', 3);
                this.triggerShake(2); 

                if (this.network.isHost) {
                    this.network.actions.sendCannon({ 
                        key: c.key, 
                        act: 'shoot', 
                        ammo: c.ammo, 
                        tx: target.x, 
                        ty: target.y 
                    });
                }
            }
        });
    }

    updateHostAI(dt) {
         if (!this.network.isHost) return;

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

         this.animals.forEach(s => {
            s.updateAI(dt, this.player, this.world, this);
            if (s.isMoving) s.moveTime += dt;
         });

         this.npcs.forEach(npc => {
            if (npc.updateAI) {
                npc.updateAI(dt, this.player, this.world, this);
            } else {
                if (!npc.aiState) npc.aiState = { mode: 'chase', tx: 0, ty: 0, timer: 0, target: null };
            }
            if (npc.isMoving) npc.moveTime += dt;
         });

         const boatCount = this.boats.filter(b => b.owner === 'enemy').length;
         if (boatCount < 2 && Math.random() < 0.001) { 
             const enemyBoat = Boat.createInvasionForce(this);
             if (enemyBoat) {
                 this.boats.push(enemyBoat);
                 this.spawnText(enemyBoat.x, enemyBoat.y, "ENEMY SHIP!", "#ff0000");
             }
         }

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
            const status = p.update();
            if (!p.active) return;

            // [NEW] Water Splash
            if (status === 'expired') {
                 const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
                 const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
                 const tileId = this.world.getTile(gx, gy);
                 if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) {
                     this.spawnParticles(p.x, p.y, '#ffffff', 6);
                 }
                 return;
            }

            const targets = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)];
            
            for (const t of targets) {
                if (p.owner === 'player' && t === this.player) continue;
                if (p.ownerId && p.ownerId === t.id) continue;
                
                if (Utils.distance(p, t) < 20) {
                    this.applyDamageToEntity(t, p.damage);
                    p.active = false;
                    return;
                }
            }

            const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            
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
            // [NEW] Raider Loot Drop Logic
            const deadNpcs = this.npcs.filter(n => n.hp <= 0);
            deadNpcs.forEach(n => {
                this.spawnLoot(n.x, n.y, 'raider'); 
                this.spawnParticles(n.x, n.y, '#555', 8);
            });
            this.npcs = this.npcs.filter(n => n.hp > 0);

            this.boats = this.boats.filter(b => b.hp > 0);
            
            const deadAnimals = this.animals.filter(a => a.hp <= 0);
            deadAnimals.forEach(a => {
                this.spawnLoot(a.x, a.y, 'sheep'); 
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
        this.triggerShake(15); // [NEW] Big shake on death
        this.showMessage(`YOU DIED! RESPAWN IN ${Math.ceil(this.respawnTimer / 1000)}s`, "#f00");
    }

    handleRespawnTimer(deltaTime) {
        this.respawnTimer -= deltaTime;
        
        this.showMessage(`YOU DIED! RESPAWN IN ${Math.ceil(this.respawnTimer / 1000)}s`, "#f00");

        if (this.respawnTimer <= 0) {
            this.respawn();
            this.showMessage("", "#fff");
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
        
        // [NEW] Add Shake Offset
        let shakeX = 0, shakeY = 0;
        if (this.shake > 0) {
            shakeX = (Math.random() - 0.5) * this.shake;
            shakeY = (Math.random() - 0.5) * this.shake;
        }

        this.camera.x = this.player.x - viewWidth / 2 + shakeX;
        this.camera.y = this.player.y - viewHeight / 2 + shakeY;
    }
    
    // [NEW] Trigger Shake
    triggerShake(amount) {
        this.shake = Math.min(this.shake + amount, 20);
    }

    // [OPTIMIZED] Frame-rate independent smoothing
    updatePeers(deltaTime) { 
        Object.values(this.peers).forEach(p => {
            // Distance Check for Teleport
            const dist = Math.sqrt((p.targetX - p.x)**2 + (p.targetY - p.y)**2);
            if (dist > 300) {
                p.x = p.targetX;
                p.y = p.targetY;
            } else {
                // Smooth Lerp using deltaTime (approx 10% movement per 16ms)
                const factor = 1 - Math.exp(-0.008 * deltaTime);
                p.x += (p.targetX - p.x) * factor;
                p.y += (p.targetY - p.y) * factor;
            }

            if (p.inBoat && p.boatStats) {
                const lerpAngle = (start, end, amt) => {
                    let diff = end - start;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    return start + diff * amt;
                };
                // Rotate boats smoothly too
                const rotFactor = 1 - Math.exp(-0.005 * deltaTime);
                p.boatStats.heading = lerpAngle(p.boatStats.heading, p.boatStats.targetHeading, rotFactor);
            }
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