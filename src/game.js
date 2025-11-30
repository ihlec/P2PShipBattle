import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS, WEAPONS } from './config.js';
import Utils from './utils.js';
import InputHandler from './input.js';
import World from './world.js';
import Renderer from './renderer.js';
import { Entity, Projectile, Sheep, Boat } from './entities.js';
import { Particle, WindParticle } from './particles.js';
import Network from './network.js';
import UIManager from './ui.js';

export default class Game {
    constructor(roomId, isHost, playerName, loadData) {
        this.canvas = document.getElementById('gameCanvas');
        this.input = new InputHandler(this);
        
        // --- MULTIPLAYER INIT ---
        this.world = new World(); 
        this.network = new Network(this, roomId, isHost, playerName);
        this.peers = {}; 
        this.spawnPoint = {x: 0, y: 0};
        
        // --- MAP GENERATION / LOADING ---
        let validSpawn = {x: 0, y: 0};
        
        if (isHost) {
            if (loadData) {
                // LOAD FROM SAVE
                this.world.importData(loadData.world);
                validSpawn = { x: loadData.player.x, y: loadData.player.y };
                console.log("Loaded Saved Game");
            } else {
                // GENERATE NEW
                let attempts = 0;
                let spawn = null;
                while (!spawn && attempts < 20) {
                    this.world = new World(); 
                    spawn = this.findSafeSpawn();
                    if (!spawn) {
                        console.log("Map rejected. Regenerating...");
                        attempts++;
                    }
                }
                if (spawn) validSpawn = spawn;
                else {
                    this.world.setTile(0, 0, TILES.GRASS.id);
                    this.world.setTile(1, 0, TILES.GRASS.id);
                    this.world.setTile(0, 1, TILES.GRASS.id);
                    this.world.setTile(1, 1, TILES.GRASS.id);
                    validSpawn = {x: 16, y: 16};
                    console.warn("Could not find safe spawn. Forcing 0,0.");
                }
            }
            this.spawnPoint = { ...validSpawn }; 
        }

        this.player = new Entity(validSpawn.x, validSpawn.y, 'player');
        
        // RESTORE PLAYER STATS
        if (loadData && isHost) {
            this.player.hp = loadData.player.hp;
            this.player.inventory = loadData.player.inventory;
            this.player.activeMelee = loadData.player.activeMelee || 'hand';
            this.player.activeRange = loadData.player.activeRange || TILES.GREY.id;
        }

        this.player.isMoving = false;
        this.player.moveTime = 0;
        if (!this.player.activeRange) this.player.activeRange = TILES.GREY.id; 
        if (!this.player.activeMelee) this.player.activeMelee = 'hand';        

        this.npcs = [];
        this.animals = []; 
        this.boats = []; 
        
        // RESTORE BOATS
        if (loadData && isHost && loadData.boats) {
            this.boats = loadData.boats.map(b => {
                const boat = new Boat(b.x, b.y, b.owner || 'player');
                boat.hp = b.hp;
                return boat;
            });
        }

        this.loot = [];
        this.projectiles = [];
        this.particles = [];
        this.texts = [];
        this.cannons = []; 
        
        this.windParticles = Array.from({length: CONFIG.WIND.PARTICLE_COUNT}, () => new WindParticle(this.canvas.width, this.canvas.height));

        this.camera = { x: 0, y: 0 };
        this.zoom = 1;
        this.lastTime = 0;
        this.regenTimer = 0;
        this.godMode = false;
        this.activeBlueprint = null;
        this.shootCooldown = 0;
        
        this.invasionTimer = (loadData && loadData.invasion) ? (loadData.invasion.timer || 0) : 0;
        this.nextInvasionTime = (loadData && loadData.invasion) ? (loadData.invasion.next || 0) : 0; 
        
        this.ui = new UIManager(this); // Init UI Manager

        this.renderer = new Renderer(this, this.canvas);

        document.getElementById('hammer-btn').onclick = () => this.ui.toggleBlueprints();
        document.getElementById('weapon-btn').onclick = () => this.ui.toggleWeapons();
        document.getElementById('btn-save').onclick = () => this.saveGame();
        
        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.windParticles = Array.from({length: CONFIG.WIND.PARTICLE_COUNT}, () => new WindParticle(this.canvas.width, this.canvas.height));
        });

        if(isHost) this.recalcCannons(); 
        
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.godMode = !this.godMode;
                this.showMessage(this.godMode ? "GOD MODE ON" : "GOD MODE OFF");
                this.ui.update(); 
            }
            if (e.key.toLowerCase() === 'h' && this.network.isHost) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 400; 
                const ex = this.player.x + Math.cos(angle) * dist;
                const ey = this.player.y + Math.sin(angle) * dist;
                const gx = Math.floor(ex/CONFIG.TILE_SIZE);
                const gy = Math.floor(ey/CONFIG.TILE_SIZE);
                const tile = this.world.getTile(gx, gy);
                if(tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id) {
                    this.boats.push(new Boat(ex, ey, 'enemy'));
                    this.showMessage("ENEMY SHIP SPAWNED", "#f00");
                }
            }
        });

        this.ui.update();
        requestAnimationFrame(t => this.loop(t));
    }

    respawn() {
        this.spawnParticles(this.player.x, this.player.y, '#f00', 20);
        this.spawnText(this.player.x, this.player.y, "RESPAWNED", "#fff");
        this.player.hp = this.player.maxHp;
        this.player.inBoat = false;
        this.player.x = this.spawnPoint.x;
        this.player.y = this.spawnPoint.y;
        if(this.player.x === 0 && this.player.y === 0) {
             this.player.x = 100;
             this.player.y = 100;
        }
        this.player.velocity = {x:0, y:0};
        this.ui.update();
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
            boats: this.boats.map(b => ({x: b.x, y: b.y, hp: b.hp, owner: b.owner})),
            invasion: { timer: this.invasionTimer, next: this.nextInvasionTime }
        };
        try { localStorage.setItem('pixelWarfareSave', JSON.stringify(data)); this.showMessage("GAME SAVED", "#0f0"); } 
        catch (e) { console.error(e); this.showMessage("SAVE FAILED", "#f00"); }
    }

    showMessage(text, color) { const msg = document.getElementById('messages'); msg.innerHTML = text; msg.style.color = color || '#fff'; msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 2000); }

    cycleRangeWeapon() {
        const cycle = [TILES.GREY.id, TILES.SPEAR_WOOD.id, TILES.SPEAR_IRON.id];
        let idx = cycle.indexOf(this.player.activeRange);
        if (idx === -1) idx = 0;
        let found = false; let attempts = 0;
        while(!found && attempts < 3) {
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
        while(!found && attempts < 3) {
            idx = (idx + 1) % cycle.length;
            const nextId = cycle[idx];
            if (nextId === 'hand' || (this.player.inventory[nextId] || 0) > 0 || this.godMode) {
                this.player.activeMelee = nextId; found = true;
            }
            attempts++;
        }
        this.ui.update();
    }

    findSafeSpawn() {
        const isSafe = (gx, gy) => {
            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            if (tileDef.solid) return false;
            if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return false;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nid = this.world.getTile(gx + dx, gy + dy);
                    const ndef = ID_TO_TILE[nid];
                    if (ndef.solid || ndef.isWater) return false; 
                }
            }
            return true;
        };
        for (let r = 0; r < 2000; r++) { 
            const x = (Math.random() - 0.5) * 5000; 
            const y = (Math.random() - 0.5) * 5000;
            const gx = Math.floor(x/CONFIG.TILE_SIZE); 
            const gy = Math.floor(y/CONFIG.TILE_SIZE);
            if (isSafe(gx, gy)) {
                return { x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 };
            }
        }
        return null; 
    }

    throwProjectile(tx, ty) {
        if (this.shootCooldown > 0) return;
        const weaponId = this.player.activeRange;
        let damage = 25; let speed = 8; let color = '#aaa'; let range = 25; let type = 'stone'; 
        if (weaponId === TILES.SPEAR_WOOD.id) { damage = 35; speed = 10; color = '#8B4513'; range = 45; type = 'spear'; }
        else if (weaponId === TILES.SPEAR_IRON.id) { damage = 60; speed = 14; color = '#aaa'; range = 50; type = 'spear'; }
        if (!this.godMode && (this.player.inventory[weaponId] || 0) <= 0) {
            if (weaponId !== TILES.GREY.id) { this.spawnText(this.player.x, this.player.y - 20, "NO AMMO", "#f00"); return; } 
            else { this.spawnText(this.player.x, this.player.y - 20, "NO STONE", "#f00"); return; }
        }
        if (!this.godMode) this.player.inventory[weaponId]--;
        const proj = new Projectile(this.player.x, this.player.y - 10, tx, ty, damage, speed, color, true, type);
        proj.life = range; 
        this.projectiles.push(proj);
        this.shootCooldown = 30;
        if (type === 'stone') this.spawnParticles(this.player.x, this.player.y, '#aaa', 3);
        this.ui.update();
    }

    handleInteraction() {
        if (!this.input.mouse.clickedLeft && !this.input.mouse.clickedRight) return;
        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);
        if (Utils.distance(this.player, {x: mx, y: my}) > CONFIG.BUILD_RANGE) return;

        const isOccupied = (tx, ty) => {
            const tileLeft = tx * CONFIG.TILE_SIZE;
            const tileRight = tileLeft + CONFIG.TILE_SIZE;
            const tileTop = ty * CONFIG.TILE_SIZE;
            const tileBottom = tileTop + CONFIG.TILE_SIZE;
            const allEntities = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)];
            return allEntities.some(e => {
                const eLeft = e.x - 8;
                const eRight = e.x + 8;
                const eTop = e.y - 8;
                const eBottom = e.y + 8;
                return (eLeft < tileRight && eRight > tileLeft && eTop < tileBottom && eBottom > tileTop);
            });
        };

        if (this.input.mouse.clickedLeft) {
            const clickedTile = this.world.getTile(gx, gy);
            
            if (clickedTile === TILES.WOOD_WALL.id) {
                if(this.tryBuild(gx, gy, TILES.WOOD_WALL_OPEN.id)) this.spawnParticles(mx, my, TILES.WOOD.color, 4);
                return;
            } else if (clickedTile === TILES.WOOD_WALL_OPEN.id) {
                if (isOccupied(gx, gy)) { this.spawnText(mx, my, "BLOCKED", "#f00"); return; }
                if(this.tryBuild(gx, gy, TILES.WOOD_WALL.id)) this.spawnParticles(mx, my, TILES.WOOD.color, 4);
                return;
            }
            
            if (this.player.selectedTile === TILES.GREENS.id) {
                const clickedSheep = this.animals.find(s => Utils.distance(s, {x:mx, y:my}) < 24);
                if (clickedSheep && !clickedSheep.fed) {
                    if (this.player.inventory[TILES.GREENS.id] > 0 || this.godMode) {
                        if(!this.godMode) this.player.inventory[TILES.GREENS.id]--;
                        
                        if (this.network.isHost) {
                            clickedSheep.fed = true;
                            this.spawnParticles(clickedSheep.x, clickedSheep.y, '#ff00ff', 5);
                        } else {
                            this.network.actions.sendEntReq({ id: clickedSheep.id, act: 'feed' });
                        }
                        
                        this.spawnText(clickedSheep.x, clickedSheep.y - 10, "❤️", "#f0f");
                        this.ui.update();
                        return;
                    }
                }
            }

            const cannon = this.cannons.find(c => { const [cx, cy] = c.key.split(',').map(Number); return gx === cx && gy === cy; });
            if (cannon && this.player.selectedTile === TILES.IRON.id) {
                if (this.player.inventory[TILES.IRON.id] > 0 || this.godMode) {
                    if (!this.godMode) this.player.inventory[TILES.IRON.id]--;
                    cannon.ammo += 5;
                    this.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
                    this.ui.update();
                    return;
                }
            }

            if (!this.activeBlueprint) {
                const sel = this.player.selectedTile;
                if (!sel) {
                    this.throwProjectile(mx, my);
                    return;
                }
                if (sel) {
                    const id = sel;
                    const canAfford = (c) => this.godMode || (this.player.inventory[id] || 0) >= c;
                    if (canAfford(1)) {
                       const tileDef = ID_TO_TILE[id];
                       if (tileDef.solid && isOccupied(gx, gy)) { this.spawnText(mx, my, "BLOCKED", "#f00"); return; }
                       if (this.tryBuild(gx, gy, id, false, false)) {
                           if(!this.godMode) this.player.inventory[id]--;
                           this.ui.update();
                           this.recalcCannons();
                       }
                    }
                    return;
                }
            }

            if (this.player.selectedTile === TILES.TREE.id || this.player.selectedTile === TILES.MOUNTAIN.id) return; 

            const canAfford = (id, cost) => this.godMode || (this.player.inventory[id] || 0) >= cost;
            const consume = (id, cost) => { if(!this.godMode) this.player.inventory[id] -= cost; };

            if (this.activeBlueprint) {
                const costMap = this.activeBlueprint.cost || {};
                let affordable = true;
                for (let [id, qty] of Object.entries(costMap)) {
                    if (!canAfford(id, qty)) { affordable = false; break; }
                }
                
                let occupied = false;
                if (affordable) {
                    for (const part of this.activeBlueprint.structure) {
                        if (isOccupied(gx + part.x, gy + part.y)) { occupied = true; break; }
                    }
                }

                if (occupied) { this.spawnText(mx * this.zoom, my * this.zoom, "OCCUPIED", "#f00"); return; }

                if (affordable) {
                    if (this.activeBlueprint.special === 'boat') {
                        if (!this.network.isHost) {
                             this.spawnText(mx * this.zoom, my * this.zoom, "HOST ONLY", "#f00");
                             return;
                        }
                        const targetId = this.world.getTile(gx, gy);
                        const allowed = [TILES.WATER.id, TILES.DEEP_WATER.id];
                        if (!allowed.includes(targetId)) {
                            this.spawnText(mx * this.zoom, my * this.zoom, "INVALID LOCATION", "#f00");
                            return;
                        }
                        
                        this.boats.push(new Boat((gx * CONFIG.TILE_SIZE) + 16, (gy * CONFIG.TILE_SIZE) + 16));
                        for (let [id, qty] of Object.entries(costMap)) consume(id, qty);
                        this.spawnParticles((gx * CONFIG.TILE_SIZE) + 16, (gy * CONFIG.TILE_SIZE) + 16, '#8B4513', 8);
                        this.ui.update();
                        return; 
                    }

                    let built = false;
                    const isBridgeBp = this.activeBlueprint.special === 'bridge' || this.activeBlueprint.requiresWater;
                    this.activeBlueprint.structure.forEach(part => {
                        const overwriteRail = this.activeBlueprint.special === 'bridge';
                        if (this.tryBuild(gx + part.x, gy + part.y, part.id, overwriteRail, isBridgeBp)) built = true;
                    });
                    
                    if (built) {
                        for (let [id, qty] of Object.entries(costMap)) consume(id, qty);
                        if (this.activeBlueprint.special === 'bridge') {
                            const neighbors = [{x:gx+1, y:gy}, {x:gx-1, y:gy}, {x:gx, y:gy+1}, {x:gx, y:gy-1}];
                            neighbors.forEach(n => {
                                const nid = this.world.getTile(n.x, n.y);
                                if (nid === TILES.WATER.id || nid === TILES.DEEP_WATER.id) {
                                    if(this.tryBuild(n.x, n.y, TILES.WOOD_RAIL.id)) {
                                        this.spawnParticles(n.x * CONFIG.TILE_SIZE + 16, n.y * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 4);
                                    }
                                }
                            });
                        }
                        this.ui.update();
                        this.recalcCannons();
                    }
                }
            } else {
                if (isOccupied(gx, gy)) { this.spawnText(mx * this.zoom, my * this.zoom, "OCCUPIED", "#f00"); return; }
                const id = this.player.selectedTile;
                if (canAfford(id, 1)) {
                    if (this.tryBuild(gx, gy, id, false, false)) {
                        consume(id, 1);
                        this.ui.update();
                        this.recalcCannons();
                    }
                }
            }
        } else if (this.input.mouse.clickedRight) {
            
            if (this.player.inBoat) {
                const clickedTile = this.world.getTile(gx, gy);
                if (clickedTile === TILES.SAND.id || clickedTile === TILES.GRASS.id || clickedTile === TILES.WOOD_RAIL.id || clickedTile === TILES.GREY.id) {
                    const dist = Utils.distance(this.player, {x: mx, y: my});
                    if (dist < 100) { 
                        const boatSpawnX = this.player.x;
                        const boatSpawnY = this.player.y;
                        this.player.inBoat = false;
                        this.player.x = (gx * CONFIG.TILE_SIZE) + 16;
                        this.player.y = (gy * CONFIG.TILE_SIZE) + 16;
                        this.player.boatStats.speed = 0;
                        this.boats.push(new Boat(boatSpawnX, boatSpawnY));
                        this.spawnText(this.player.x, this.player.y, "EXIT BOAT", "#fff");
                        return;
                    }
                }
            } else {
                const clickedBoatIndex = this.boats.findIndex(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (clickedBoatIndex !== -1) {
                    if (Utils.distance(this.player, this.boats[clickedBoatIndex]) < 100) {
                        this.player.inBoat = true;
                        this.player.x = this.boats[clickedBoatIndex].x;
                        this.player.y = this.boats[clickedBoatIndex].y;
                        this.player.boatStats.speed = 0;
                        this.boats.splice(clickedBoatIndex, 1);
                        this.spawnText(this.player.x, this.player.y, "ENTER BOAT", "#fff");
                        return;
                    }
                }
            }

            const clickedSheep = this.animals.find(s => Utils.distance(s, {x:mx, y:my}) < 24);
            if (clickedSheep && clickedSheep.hasWool) {
                if (this.network.isHost) {
                    clickedSheep.hasWool = false;
                    clickedSheep.woolTimer = CONFIG.WOOL_REGROW_TIME;
                    this.loot.push({
                        id: Math.random().toString(36).substr(2,9),
                        x: clickedSheep.x, y: clickedSheep.y, 
                        id: TILES.WOOL.id, qty: 1, bob: Math.random()*100
                    });
                    this.spawnParticles(clickedSheep.x, clickedSheep.y, '#eee', 5);
                } else {
                    this.network.actions.sendEntReq({ id: clickedSheep.id, act: 'shear' });
                }
                return;
            }

            const selId = this.player.selectedTile;
            if (selId === TILES.WOOD.id || selId === TILES.GREY.id) {
                const boatToRepair = this.boats.find(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (boatToRepair && boatToRepair.hp < boatToRepair.maxHp && selId === TILES.WOOD.id) {
                    if (this.player.inventory[TILES.WOOD.id] >= CONFIG.REPAIR.COST || this.godMode) {
                        if(!this.godMode) this.player.inventory[TILES.WOOD.id] -= CONFIG.REPAIR.COST;
                        boatToRepair.hp = Math.min(boatToRepair.hp + CONFIG.REPAIR.AMOUNT, boatToRepair.maxHp);
                        this.spawnParticles(boatToRepair.x, boatToRepair.y, '#0f0', 5);
                        this.spawnText(boatToRepair.x, boatToRepair.y, "+HP", "#0f0");
                        this.ui.update();
                        return;
                    }
                }
                
                const tx = gx; const ty = gy;
                const tileId = this.world.getTile(tx, ty);
                const tileDef = ID_TO_TILE[tileId];
                if (tileDef.hp) {
                    const dmg = this.world.getTileDamage(tx, ty);
                    if (dmg > 0) {
                        let canRepair = false;
                        if (selId === TILES.WOOD.id && (tileId === TILES.WOOD_WALL.id || tileId === TILES.WOOD_WALL_OPEN.id)) canRepair = true;
                        if (selId === TILES.GREY.id && (tileId === TILES.WALL.id || tileDef.isTower)) canRepair = true; 
                        
                        if (canRepair) {
                            if (this.player.inventory[selId] >= CONFIG.REPAIR.COST || this.godMode) {
                                if(!this.godMode) this.player.inventory[selId] -= CONFIG.REPAIR.COST;
                                this.world.hitTile(tx, ty, -CONFIG.REPAIR.AMOUNT);
                                if (this.world.tileData[`${tx},${ty}`].dmg < 0) this.world.tileData[`${tx},${ty}`].dmg = 0;
                                
                                this.spawnParticles(tx*CONFIG.TILE_SIZE+16, ty*CONFIG.TILE_SIZE+16, '#0f0', 5);
                                this.spawnText(tx*CONFIG.TILE_SIZE+16, ty*CONFIG.TILE_SIZE, "+HP", "#0f0");
                                this.ui.update();
                                return;
                            }
                        }
                    }
                }
            }

            if (this.activeBlueprint) {
                this.activeBlueprint = null;
                this.ui.update();
            } else {
                const tx = gx; const ty = gy;
                let tileId = this.world.getTile(gx, gy);
                let tileDef = ID_TO_TILE[tileId];

                if (!tileDef.solid && tileId !== TILES.TREE.id && tileId !== TILES.WOOD_WALL_OPEN.id && tileId !== TILES.TORCH.id) {
                    let below = this.world.getTile(gx, gy + 1);
                    if (ID_TO_TILE[below].isTower) { tileId = below; } 
                    else {
                        let below2 = this.world.getTile(gx, gy + 2);
                        if (ID_TO_TILE[below2].isTower) { tileId = below2; }
                    }
                }
                tileDef = ID_TO_TILE[tileId]; 
                
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id || tileId === TILES.SAND.id || tileId === TILES.GRASS.id) return;
                
                if (tileId === TILES.TREE.id) {
                    this.network.requestRemove(tx, ty, TILES.GRASS.id);
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 8);
                    this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 3, bob: Math.random()*100});
                    if (Math.random() < 0.1) this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREENS.id, qty: 1, bob: Math.random()*100});
                    return;
                }

                if (tileDef.hp) {
                    const damageDealt = 20; 
                    const totalDmg = this.world.hitTile(tx, ty, damageDealt);
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 3);
                    this.spawnText(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE, `-${damageDealt}`, '#fff');

                    if (totalDmg >= tileDef.hp) {
                        const biome = Utils.getBiome(tx, ty, this.world.seed);
                        let restoreId = TILES.GRASS.id;
                        if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                        if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;

                        this.network.requestRemove(tx, ty, restoreId);
                        
                        this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#555', 10);
                        
                        if (tileId === TILES.MOUNTAIN.id || tileId === TILES.STONE_BLOCK.id) {
                             this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 3, bob: Math.random()*100});
                             if (Math.random() < 0.1) this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.IRON.id, qty: 2, bob: Math.random()*100});
                             if (Math.random() < 0.01) this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GOLD.id, qty: 1, bob: Math.random()*100});
                        } else if (tileDef.isTower) {
                             this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 4, bob: Math.random()*100});
                        } else if (tileId === TILES.WOOD_WALL.id || tileId === TILES.WOOD_WALL_OPEN.id) {
                             this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 1, bob: Math.random()*100});
                        } else if (tileId === TILES.WALL.id) {
                             this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 1, bob: Math.random()*100});
                        } else if (tileId === TILES.TORCH.id) {
                             this.loot.push({id: Math.random().toString(36).substr(2,9), x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 1, bob: Math.random()*100});
                        }
                        
                        this.recalcCannons();
                        this.ui.update();
                    }
                    return;
                }

                const removable = [TILES.GREY.id, TILES.BLACK.id, TILES.IRON.id, TILES.GOLD.id, TILES.WOOD.id, TILES.GREENS.id, TILES.WOOL.id];
                if (removable.includes(tileId) || tileId === TILES.WOOD_RAIL.id) {
                    if (isOccupied(tx, ty)) { this.spawnText(mx * this.zoom, my * this.zoom, "OCCUPIED", "#f00"); return; }
                    const biome = Utils.getBiome(tx, ty, this.world.seed);
                    let restoreId = (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) ? biome : TILES.GRASS.id;
                    if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;

                    this.network.requestRemove(tx, ty, restoreId);
                    
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 5);
                    
                    if (removable.includes(tileId)) {
                        this.player.inventory[tileId] = (this.player.inventory[tileId] || 0) + 1;
                        this.spawnText(tx*CONFIG.TILE_SIZE + 16, ty*CONFIG.TILE_SIZE, `+1 ${ID_TO_TILE[tileId].short}`, "#fff");
                    } else if (tileId === TILES.WOOD_RAIL.id) {
                        this.player.inventory[TILES.WOOD.id] = (this.player.inventory[TILES.WOOD.id] || 0) + 1;
                        this.spawnText(tx*CONFIG.TILE_SIZE + 16, ty*CONFIG.TILE_SIZE, `+1 Wood`, "#fff");
                    }

                    this.ui.update();
                }
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
        
        if (allowRailOverwrite && current === TILES.WOOD_RAIL.id) {
            this.world.setTile(gx, gy, id);
            if(this.network.isHost && !force) this.network.broadcastBuild(gx, gy, id);
            return true;
        }

        if (ID_TO_TILE[current].solid && current !== TILES.WATER.id && current !== TILES.DEEP_WATER.id) return false;
        
        this.world.setTile(gx, gy, id);
        if(this.network.isHost && !force) this.network.broadcastBuild(gx, gy, id);
        return true;
    }

    recalcCannons() {
        const range = 30;
        const px = Math.floor(this.player.x / CONFIG.TILE_SIZE);
        const py = Math.floor(this.player.y / CONFIG.TILE_SIZE);
        const newCannons = [];
        for (let y = py - range; y < py + range; y++) {
            for (let x = px - range; x < px + range; x++) {
                const id = this.world.getTile(x, y);
                const tile = ID_TO_TILE[id];
                if (tile.isTower) {
                    const key = `${x},${y}`;
                    let damage = tile.cannonDamage || 20;
                    const existing = this.cannons.find(c => c.key === key);
                    newCannons.push({
                        key, x: x*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: y*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2,
                        damage, cooldown: existing ? existing.cooldown : 0, ammo: existing ? existing.ammo : 10, range: 300
                    });
                }
            }
        }
        this.cannons = newCannons;
    }

    spawnText(x, y, txt, col) { 
        this.texts.push({x, y, txt, col, life: 60, dy: -1}); 
    }
    
    spawnParticles(x, y, color, count) {
        for(let i=0; i<count; i++) {
            this.particles.push(new Particle(x, y, color, (Math.random()-0.5)*5, (Math.random()-0.5)*5, 30 + Math.random()*20));
        }
    }

    update(dt) {
        const oldCamX = this.camera.x;
        const oldCamY = this.camera.y;

        if (this.input.wheel !== 0) {
            this.zoom = Math.max(0.3, Math.min(this.zoom - this.input.wheel * 0.001, 3));
        }
        
        this.network.update(dt);
        this.world.update(dt);
        
        Object.values(this.peers).forEach(p => {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            p.x += dx * 0.15; 
            p.y += dy * 0.15;
            
            if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
                p.x = p.targetX;
                p.y = p.targetY;
            }
        });

        if (this.shootCooldown > 0) this.shootCooldown--;

        this.regenTimer += dt;
        if (this.regenTimer > 2000 && this.player.hp < 100 && this.player.hp > 0) {
            this.player.hp = Math.min(100, this.player.hp + 5);
            this.spawnText(this.player.x, this.player.y - 20, "+5 HP", "#0f0");
            this.regenTimer = 0;
        }

        const inputState = {
            up: this.input.keys['w'] || this.input.keys['arrowup'],
            down: this.input.keys['s'] || this.input.keys['arrowdown'],
            left: this.input.keys['a'] || this.input.keys['arrowleft'],
            right: this.input.keys['d'] || this.input.keys['arrowright']
        };

        if (this.player.inBoat) {
            if (this.input.keys['q']) this.player.shootBroadside(this, 'left');
            if (this.input.keys['e']) this.player.shootBroadside(this, 'right');
            this.player.updateBoatMovement(inputState, dt, this.world, this); 
            this.player.moveTime += dt;
        } else {
            let dx = 0, dy = 0;
            if(inputState.up) dy = -1;
            if(inputState.down) dy = 1;
            if(inputState.left) dx = -1;
            if(inputState.right) dx = 1;
            if (dx || dy) {
                this.player.isMoving = true; 
                this.player.moveTime += dt;  
                const len = Math.sqrt(dx*dx + dy*dy);
                this.player.move((dx/len)*this.player.speed, (dy/len)*this.player.speed, this.world);
            } else {
                this.player.isMoving = false;
            }
        }

        const viewW = this.canvas.width / this.zoom;
        const viewH = this.canvas.height / this.zoom;
        this.camera.x = this.player.x - viewW/2;
        this.camera.y = this.player.y - viewH/2;

        const camDx = (this.camera.x - oldCamX) * this.zoom;
        const camDy = (this.camera.y - oldCamY) * this.zoom;
        this.windParticles.forEach(p => p.update(this.canvas.width, this.canvas.height, this.world.wind.angle, camDx, camDy));

        this.handleInteraction();
        this.updateMeleeCombat(); 

        if (this.network.isHost) {
             const enemyBoat = this.boats.find(b => b.owner === 'enemy');
             if (!enemyBoat) {
                this.invasionTimer++;
                if (this.invasionTimer > this.nextInvasionTime) {
                    if (Math.random() < 0.1) { 
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 600 + Math.random() * 200;
                        const sx = this.player.x + Math.cos(angle) * dist;
                        const sy = this.player.y + Math.sin(angle) * dist;
                        const gx = Math.floor(sx / CONFIG.TILE_SIZE);
                        const gy = Math.floor(sy / CONFIG.TILE_SIZE);
                        const checkWater = (cx, cy) => {
                            const tile = this.world.getTile(Math.floor(cx/CONFIG.TILE_SIZE), Math.floor(cy/CONFIG.TILE_SIZE));
                            return tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id;
                        };
                        if (checkWater(sx, sy) && checkWater(sx + 16, sy) && checkWater(sx - 16, sy)) {
                            this.boats.push(new Boat(sx, sy, 'enemy'));
                            this.spawnText(sx, sy, "NEW INVASION", "#f00");
                            this.invasionTimer = 0;
                            const minFrames = 7200; 
                            const maxFrames = 72000;
                            this.nextInvasionTime = minFrames + Math.random() * (maxFrames - minFrames);
                        }
                    }
                }
             } else {
                 this.invasionTimer = 0;
                 enemyBoat.updateAI(dt, this.player, this.world, this);
             }
             
             this.npcs.forEach(npc => {
                if (!npc.aiState) npc.aiState = { mode: 'chase', tx: 0, ty: 0, timer: 0 };
                if (npc.aiState.timer > 0) {
                    npc.aiState.timer--;
                    npc.isMoving = false;
                } else if (npc.aiState.mode === 'chase') {
                    const dist = Utils.distance(npc, this.player);
                    if (dist < 80) {
                        npc.aiState.mode = 'charge';
                        const angle = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
                        npc.aiState.tx = this.player.x + Math.cos(angle) * 150;
                        npc.aiState.ty = this.player.y + Math.sin(angle) * 150;
                    } else {
                        const angle = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
                        npc.move(Math.cos(angle) * 2, Math.sin(angle) * 2, this.world);
                        npc.isMoving = true;
                        npc.moveTime += dt;
                    }
                } else if (npc.aiState.mode === 'charge') {
                    const dx = npc.aiState.tx - npc.x;
                    const dy = npc.aiState.ty - npc.y;
                    const distToTarget = Math.sqrt(dx*dx + dy*dy);
                    if (distToTarget < 10) {
                        npc.aiState.mode = 'rest';
                        npc.aiState.timer = 60 + Math.random() * 60; 
                    } else {
                        const angle = Math.atan2(dy, dx);
                        npc.move(Math.cos(angle) * 3.5, Math.sin(angle) * 3.5, this.world);
                        npc.isMoving = true;
                        npc.moveTime += dt;
                    }
                } else if (npc.aiState.mode === 'rest') {
                    npc.aiState.mode = 'chase';
                }
                if (Utils.distance(npc, this.player) < CONFIG.TILE_SIZE) {
                    if (!this.godMode) {
                        this.player.damageBuffer += 0.5; 
                        if (this.player.damageBuffer >= 1) {
                            const dmg = Math.floor(this.player.damageBuffer);
                            this.player.hp -= dmg;
                            this.player.damageBuffer -= dmg;
                            if (Math.random() > 0.8) this.spawnParticles(this.player.x, this.player.y, '#f00', 2);
                        }
                    }
                }
             });
        }

        if (this.network.isHost && this.animals.length < 10 && Math.random() < 0.005) {
            const ang = Math.random() * 6.28;
            const dist = 600;
            const nx = this.player.x + Math.cos(ang)*dist;
            const ny = this.player.y + Math.sin(ang)*dist;
            const ngx = Math.floor(nx / CONFIG.TILE_SIZE);
            const ngy = Math.floor(ny / CONFIG.TILE_SIZE);
            const spawnPoint = {x: nx, y: ny};
            const occupied = [...this.npcs, ...this.animals].some(e => Utils.distance(e, spawnPoint) < CONFIG.TILE_SIZE);
            if (!occupied) {
                const tileId = this.world.getTile(ngx, ngy);
                const tileDef = ID_TO_TILE[tileId];
                if (!tileDef.solid && !tileDef.isWater) {
                    this.animals.push(new Sheep(nx, ny));
                }
            }
        }

        this.animals.forEach(s => {
            if(this.network.isHost) {
                s.updateAI(dt, this.player, this.world, this); 
                if (s.isMoving) s.moveTime += dt;
                if (s.fed) {
                    this.animals.forEach(mate => {
                        if (s !== mate && mate.fed && Utils.distance(s, mate) < 20) {
                            s.fed = false; mate.fed = false;
                            const baby = new Sheep(s.x, s.y);
                            this.animals.push(baby);
                            this.spawnParticles(s.x, s.y, '#fff', 10);
                            this.spawnText(s.x, s.y, "BABY!", "#ff00ff");
                        }
                    });
                }
            }
        });
        
        this.cannons.forEach(c => {
            if (c.cooldown > 0) c.cooldown--;
            else if (c.ammo > 0) {
                const validTargets = [...this.npcs, ...this.boats.filter(b => b.owner === 'enemy')];
                let target = validTargets.find(n => Utils.distance(c, n) < c.range);
                if (target) {
                    this.projectiles.push(new Projectile(c.x, c.y - CONFIG.TILE_SIZE, target.x, target.y, c.damage, 12, '#fff', true));
                    c.cooldown = 60;
                    this.spawnParticles(c.x, c.y - CONFIG.TILE_SIZE, '#aaa', 8);
                    if (!this.godMode) c.ammo--;
                }
            }
        });

        this.projectiles.forEach(p => {
            const status = p.update();
            const targets = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...Object.values(this.peers)];
            let hit = false;
            if (p.active) {
                targets.forEach(n => {
                    if (!p.active) return;
                    if (p.owner === 'player' && n === this.player) return;
                    if (p.owner === 'player') {
                        if (n.type === 'peer') return;
                        if (n.type === 'boat' && n.owner === 'player') return;
                    }
                    if (p.owner === 'enemy' && n.owner === 'enemy') return; 
                    if (n === this.player && this.godMode) return;
                    if (n === this.player && this.player.inBoat) return;
                    if (p.owner === 'player' && n.type === 'boat') {
                        if (this.player.inBoat && n.x === this.player.x && n.y === this.player.y) return;
                    }
                    let hitDist = 16;
                    if (n.type === 'boat') hitDist = 32;
                    if (Utils.distance(p, n) < hitDist) {
                        p.active = false;
                        hit = true;
                        if (this.network.isHost) {
                             n.hp -= p.damage;
                        } else {
                             this.network.actions.sendEntHit({ id: n.id, dmg: p.damage });
                        }
                        if (n.type === 'boat') {
                            this.spawnParticles(p.x, p.y, '#ff0000', 5); 
                            this.spawnParticles(p.x, p.y, '#ffa500', 5);
                            this.spawnText(n.x, n.y - 20, Math.floor(p.damage), "#ff4444");
                        } else {
                            this.spawnParticles(n.x, n.y, '#f00', 6);
                            this.spawnText(n.x, n.y, Math.floor(p.damage), "#fff");
                        }
                    }
                });
            }
            if ((!hit && !p.active && status === 'expired') && p.type === 'cannonball') {
                const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
                const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
                const tile = this.world.getTile(gx, gy);
                if (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id) this.spawnParticles(p.x, p.y, '#3498db', 6); 
                else this.spawnParticles(p.x, p.y, '#555', 4);
            }
        });

        this.projectiles = this.projectiles.filter(p => p.active);

        if (this.network.isHost) {
            const cleanup = (arr) => arr.filter(n => {
                if (n.hp <= 0) {
                    const roll = Math.random();
                    let dropId = TILES.GREY.id;
                    let qty = 1;
                    if (n.type === 'sheep') {
                        dropId = TILES.WOOL.id; qty = 2;
                    } else {
                        if (roll < 0.10) { dropId = TILES.GOLD.id; qty = 2; } 
                        else if (roll < 0.40) { dropId = TILES.WOOD.id; qty = 5; } 
                        else if (roll < 0.70) { dropId = TILES.IRON.id; qty = 5; } 
                        else { dropId = TILES.GREY.id; qty = 8; }
                    }
                    this.loot.push({id: Math.random().toString(36).substr(2,9), x: n.x, y: n.y, id: dropId, qty: qty, bob: Math.random()*100});
                    this.spawnParticles(n.x, n.y, '#f00', 10);
                    return false;
                }
                return true;
            });
            this.npcs = cleanup(this.npcs);
            this.animals = cleanup(this.animals);
            this.boats = this.boats.filter(b => {
                if (b.hp <= 0) {
                    for(let i=0; i<8; i++) this.spawnParticles(b.x + (Math.random()-0.5)*40, b.y + (Math.random()-0.5)*40, '#8B4513', 3);
                    this.loot.push({id: Math.random().toString(36).substr(2,9), x: b.x, y: b.y, id: TILES.CRATE.id, qty: 1, bob: Math.random()*100});
                    if (this.player.inBoat && b.x === this.player.x && b.y === this.player.y) this.player.inBoat = false;
                    return false;
                }
                return true;
            });
        }

        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.life > 0);
        this.texts.forEach(t => { t.y += t.dy; t.life--; });
        this.texts = this.texts.filter(t => t.life > 0);
        this.loot = this.loot.filter(l => {
            if (Utils.distance(this.player, l) < 32) {
                if (this.network.isHost) {
                    // Logic handled locally
                } else {
                    this.network.actions.sendEntReq({ id: l.id, act: 'pickup' });
                }

                if (l.id === TILES.CRATE.id) {
                    const wood = 10 + Math.floor(Math.random() * 10);
                    const iron = 5 + Math.floor(Math.random() * 5);
                    this.player.inventory[TILES.WOOD.id] += wood;
                    this.player.inventory[TILES.IRON.id] += iron;
                    this.spawnText(this.player.x, this.player.y - 40, `+${wood} Wood`, "#f0aa00");
                    this.spawnText(this.player.x, this.player.y - 20, `+${iron} Iron`, "#aaa");
                } else {
                    this.player.inventory[l.id] = (this.player.inventory[l.id]||0) + l.qty;
                    this.spawnText(this.player.x, this.player.y - 30, `+${l.qty} ${ID_TO_TILE[l.id].short}`, "#ff0");
                }
                this.ui.update();
                return false; 
            }
            return true;
        });

        if (this.player.hp <= 0) this.respawn();

        this.ui.update(); 
        
        this.renderer.draw();
        
        this.input.flush();
    }
    
    updateMeleeCombat() {
        if (!this.player.isMoving || this.shootCooldown > 0) return;
        let dmg = 0;
        const meleeId = this.player.activeMelee;
        if (meleeId === TILES.SWORD_IRON.id) dmg = 90;
        else if (meleeId === TILES.SWORD_WOOD.id) dmg = 50;
        else if (meleeId === 'hand') dmg = 1;
        if (dmg === 0) return;
        const targets = [...this.npcs, ...this.animals];
        for (const t of targets) {
            if (Utils.distance(this.player, t) < CONFIG.TILE_SIZE) {
                if (this.network.isHost) {
                    t.hp -= dmg;
                } else {
                    this.network.actions.sendEntHit({ id: t.id, dmg: dmg });
                }
                this.spawnParticles(t.x, t.y, '#fff', 8);
                this.spawnText(t.x, t.y, `HIT ${dmg}`, "#ff0");
                this.shootCooldown = 20; 
                return; 
            }
        }
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.update(dt);
        requestAnimationFrame(t => this.loop(t));
    }
}