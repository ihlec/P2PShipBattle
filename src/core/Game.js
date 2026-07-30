import { CONFIG, TILES, ID_TO_TILE, WEAPONS, SHIP_SPECS } from '../config.js';
import Utils from '../utils.js';
import InputHandler from './InputHandler.js';
import Network from './Network.js';
import World from '../world/World.js';
import Renderer from '../systems/Renderer.js';
import UIManager from '../systems/UIManager.js';
import Minimap from '../systems/Minimap.js';
import ParticleSystem from '../world/ParticleSystem.js';
import { Entity } from '../entities/Entity.js';
import { Projectile } from '../entities/Projectile.js';
import { Sheep } from '../entities/Npc.js';
import { Boat } from '../entities/Boat.js';
import { Worker } from '../entities/Worker.js';

const DESTRUCTIBLE_TILES = [
    TILES.GREY.id, TILES.BLACK.id, TILES.IRON.id, TILES.GOLD.id,
    TILES.WOOD.id, TILES.WOOD_RAIL.id, TILES.ROAD.id, TILES.GREENS.id,
    TILES.WOOL.id
];

const NON_PLACEABLE_TILES = [TILES.WOOL.id];

export default class Game {
    constructor(roomId, isHost, playerName, loadData) {
        this.canvas = document.getElementById('gameCanvas');
        
        this.input = new InputHandler(this);
        this.world = new World();
        this.particles = new ParticleSystem();
        this.network = new Network(this, roomId, isHost, playerName);
        this.ui = new UIManager(this);
        this.renderer = new Renderer(this, this.canvas);
        this.minimap = new Minimap(this);

        this.peers = {};
        this.pings = [];
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
        this.cannonStore = new Map();
        this.workers = [];
        this.selectedWorker = null;

        this.camera = { x: 0, y: 0 };
        this.zoom = 1;
        this.shake = 0; 
        
        this.lastFrameTime = 0;
        this.regenTimer = 0;
        this.godMode = false;
        this.activeBlueprint = null;
        this.shootCooldown = 0;

        this.peaceTimer = 0;
        this.peaceThreshold = this.getNewPeaceThreshold();

        this.threatLevel = 0;
        this.crops = [];
        this.gameTime = 0;
        this.playerBuff = null;
        this.harvestTargetTile = null;
        this.miningChipTimer = 0;

        this.ui.renderBlueprintIcons();

        this.initializeGame(isHost, loadData);
        this.setupBindings();
        
        requestAnimationFrame(timestamp => this.gameLoop(timestamp));
    }

    getNewPeaceThreshold() {
        const min = 2 * 60 * 1000;
        const max = 7 * 60 * 1000;
        return min + Math.random() * (max - min);
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
                if (loadData.threatLevel) this.threatLevel = loadData.threatLevel;
                if (loadData.crops) this.crops = loadData.crops;
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
                        const boat = new Boat(b.x, b.y, b.owner || 'player', b.subtype || 'sloop');
                        boat.hp = b.hp;
                        boat.hullLevel = b.hull || 0;
                        boat.sailLevel = b.sail || 0;
                        boat.cannonLevel = b.cannon || 0;
                        boat.applyUpgrades();
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
        const hammerBtn = document.getElementById('hammer-btn');
        hammerBtn.onclick = (e) => {
            if (this.activeBlueprint) {
                this.activeBlueprint = null;
                this.closeFloatingMenus();
                this.ui.update();
            } else {
                this.ui.toggleBlueprints();
            }
            e.currentTarget.blur();
        };
        document.getElementById('weapon-btn').onclick = (e) => {
            this.ui.toggleWeapons();
            e.currentTarget.blur();
        };
        document.getElementById('btn-save').onclick = () => this.saveGame();

        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.particles.initWind(this.canvas.width, this.canvas.height);
        });

        this.input.initMobileLayout();
    }

    closeFloatingMenus() {
        const bpMenu = document.getElementById('blueprint-menu');
        const wpMenu = document.getElementById('weapon-menu');
        if (bpMenu) bpMenu.style.display = 'none';
        if (wpMenu) wpMenu.style.display = 'none';
    }

    exitPlacementMode() {
        this.activeBlueprint = null;
        this.player.selectedTile = null;
        this.selectedWorker = null;
        this.closeFloatingMenus();
        this.ui.update();
    }

    findSafeSpawnPoint() {
        let x = 0, y = 0;
        let dx = 0, dy = -1;
        const maxSpiralSteps = 10000; 
        
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
        
        console.warn("Spiral spawn failed. Attempting global random search...");
        for(let i=0; i<1000; i++) {
            const rx = Math.floor((Math.random() - 0.5) * 2000); 
            const ry = Math.floor((Math.random() - 0.5) * 2000);
            const id = this.world.getTile(rx, ry);
            const def = ID_TO_TILE[id];
            
            if (!def.solid && !def.isWater) {
                return { x: rx * CONFIG.TILE_SIZE + 16, y: ry * CONFIG.TILE_SIZE + 16 };
            }
        }

        return { x: 16, y: 16 };
    }

    gameLoop(timestamp) {
        let deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        if (deltaTime > 50) deltaTime = 50; 

        this.update(deltaTime);
        if (!this.network.isHost && !this.network.worldReceived) {
            const ctx = this.renderer.ctx;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('SYNCING WORLD WITH HOST...', this.canvas.width / 2, this.canvas.height / 2);
        } else {
            this.renderer.draw();
            this.minimap.draw();
        }
        requestAnimationFrame(t => this.gameLoop(t));
    }

    update(deltaTime) {
        if (this.shake > 0) this.shake *= 0.9;
        if (this.shake < 0.5) this.shake = 0;

        this.handleCameraZoom();
        this.network.update(deltaTime);

        if (!this.network.isHost && !this.network.worldReceived) {
            this.showMessage("SYNCING WORLD WITH HOST...", "#ff0");
            this.updatePeers(deltaTime);
            this.ui.update();
            this.input.flush();
            return;
        }

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
        this.updatePings();
        this.ui.update();
        this.input.flush();
    }

    placePing(x, y, fromNetwork = false, name = null) {
        const now = Date.now();
        if (!fromNetwork) {
            if (now - (this.minimap?.lastPingTime || 0) < CONFIG.MINIMAP.PING_COOLDOWN_MS) return;
            if (this.minimap) this.minimap.lastPingTime = now;
            name = this.network.playerName || 'Player';
            if (this.network.actions.sendPing) {
                this.network.actions.sendPing({
                    x: Math.floor(x),
                    y: Math.floor(y),
                    name
                });
            }
        }

        const label = name || 'Player';
        this.pings.push({ x, y, name: label, t: now });
        this.spawnParticles(x, y, '#ffd700', 8);
        this.spawnText(x, y - 20, label, '#ffd700');
        this.showMessage(`${label} pinged the map`, "#ffd700", 1500);
    }

    updatePings() {
        const now = Date.now();
        this.pings = this.pings.filter(p => now - p.t < CONFIG.MINIMAP.PING_MS);
    }

    updatePlayer(deltaTime) {
        if (this.shootCooldown > 0) this.shootCooldown--;

        if (!this.isRespawning && !this.player.inBoat && this.player.hp > 0 && this.player.hp < 100) {
            this.regenTimer += deltaTime;
            const regenTime = (this.playerBuff && this.playerBuff.timer > 0) ? 1000 : 2000;
            if (this.regenTimer > regenTime) {
                this.player.hp = Math.min(100, this.player.hp + 5);
                this.spawnText(this.player.x, this.player.y - 20, "+5 HP", "#0f0");
                this.regenTimer = 0;
            }
        }

        if (this.playerBuff && this.playerBuff.timer > 0) {
            this.playerBuff.timer -= deltaTime;
            this.player.speedMult = 1.5;
            this.player.dmgBonus = 10;
            if (Math.random() < 0.05) {
                this.spawnParticles(this.player.x + (Math.random()-0.5)*20, this.player.y + (Math.random()-0.5)*20, '#0f0', 1);
            }
            if (this.playerBuff.timer <= 0) {
                this.playerBuff = null;
                this.player.speedMult = 1;
                this.player.dmgBonus = 0;
                this.spawnText(this.player.x, this.player.y - 20, "BUFF EXPIRED", "#888");
            }
        } else {
            this.player.speedMult = 1;
            this.player.dmgBonus = 0;
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
        this.syncHarvestVisualState();
    }

    syncHarvestVisualState() {
        this.harvestTargetTile = null;
        if (!this.player || this.isRespawning || this.player.inBoat || this.player.hp <= 0) return;
        if (this.activeBlueprint || this.player.selectedTile) return;
        if (this.selectedWorker) return;
        if (!this.input.isHarvestInteractionHeld()) return;

        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        if (Utils.distance(this.player, { x: mx, y: my }) > CONFIG.BUILD_RANGE) return;

        const clickedSheep = this.animals.find(s =>
            Utils.distance(s, { x: mx, y: my }) < 24 && s.hasWool
        );
        if (clickedSheep) return;

        const boatIdx = this.boats.findIndex(b => Utils.distance(b, { x: mx, y: my }) < 32);
        if (boatIdx !== -1 && Utils.distance(this.player, this.boats[boatIdx]) < 100) return;

        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);

        if (this.world.getTile(gx, gy) === TILES.CROP_READY.id) return;

        const tileId = this.world.getTile(gx, gy);
        const tileDef = ID_TO_TILE[tileId];
        if (tileId === TILES.TREE.id || (tileDef && tileDef.hp) || DESTRUCTIBLE_TILES.includes(tileId)) {
            this.harvestTargetTile = { gx, gy };
            this.miningChipTimer += 16;
            if (this.miningChipTimer >= 80) {
                this.miningChipTimer = 0;
                const tx = gx * CONFIG.TILE_SIZE + 16;
                const ty = gy * CONFIG.TILE_SIZE + 16;
                const chipColor = tileId === TILES.TREE.id ? TILES.WOOD.color : tileDef.color;
                this.particles.spawnMiningChips(tx, ty, chipColor);
            }
        } else {
            this.miningChipTimer = 0;
        }
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
                if (this.player.selectedTile === TILES.WOOD.id) {
                    const currentDmg = this.world.getTileDamage(gx, gy);
                    const tileId = this.world.getTile(gx, gy);
                    const def = ID_TO_TILE[tileId];

                    if (def && def.hp && currentDmg > 0) {
                         if (this.player.inventory[TILES.WOOD.id] >= CONFIG.REPAIR.COST || this.godMode) {
                             if (!this.godMode) this.player.inventory[TILES.WOOD.id] -= CONFIG.REPAIR.COST;
                             this.applyDamageToTile(gx, gy, -CONFIG.REPAIR.AMOUNT);
                             this.ui.update();
                             return;
                         } else {
                             this.spawnText(mx, my, "NEED WOOD", "#f00");
                             return;
                         }
                    }
                }

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

                if (!this.godMode && (this.player.inventory[sel] || 0) <= 0) {
                    this.spawnText(mx, my, "NO RESOURCE", "#f00");
                    return;
                }

                // Greens: eat if clicking on player, plant if clicking on grass/sand
                if (sel === TILES.GREENS.id) {
                    if (Utils.distance(this.player, {x: mx, y: my}) < 20) {
                        this.eatFood();
                        return;
                    }
                    const current = this.world.getTile(gx, gy);
                    if (current === TILES.GRASS.id || current === TILES.SAND.id) {
                        if (this.tryBuild(gx, gy, TILES.CROP_SEED.id)) {
                            if (!this.godMode) this.player.inventory[TILES.GREENS.id]--;
                            if (this.network.isHost) this.crops.push({ x: gx, y: gy, timer: 0 });
                            this.spawnText(mx, my, "PLANTED!", "#0f0");
                            this.spawnParticles(mx, my, '#2d6e32', 5);
                            this.ui.update();
                        }
                        return;
                    }
                }

                const clickedFurnace = this.world.getTile(gx, gy) === TILES.FURNACE.id && Utils.distance(this.player, { x: mx, y: my }) < 120;
                if (clickedFurnace) {
                    const inv = this.player.inventory;
                    if (sel === TILES.GREY.id) {
                        if ((inv[TILES.WOOD.id] || 0) >= 100 && (inv[TILES.GREY.id] || 0) >= 50) {
                            if (!this.godMode) { inv[TILES.WOOD.id] -= 100; inv[TILES.GREY.id] -= 50; }
                            inv[TILES.GOLD.id] = (inv[TILES.GOLD.id] || 0) + 1;
                            this.spawnText(mx, my, "+1 Gold", "#ffd700");
                            this.spawnParticles(mx, my, '#ffd700', 8);
                        } else {
                            this.spawnText(mx, my, "NEED 100 WOD + 50 STN", "#f00");
                        }
                    } else if (sel === TILES.WOOD.id) {
                        if ((inv[TILES.WOOD.id] || 0) >= 10 && (inv[TILES.GREY.id] || 0) >= 5) {
                            if (!this.godMode) { inv[TILES.WOOD.id] -= 10; inv[TILES.GREY.id] -= 5; }
                            inv[TILES.IRON.id] = (inv[TILES.IRON.id] || 0) + 1;
                            this.spawnText(mx, my, "+1 Iron", "#aaa");
                            this.spawnParticles(mx, my, '#aaa', 8);
                        } else {
                            this.spawnText(mx, my, "NEED 10 WOD + 5 STN", "#f00");
                        }
                    } else {
                        this.spawnText(mx, my, "SELECT WOOD OR STONE", "#ff0");
                    }
                    this.ui.update();
                    return;
                }

                const clickedBoat = this.boats.find(b => b.owner === 'player' && Utils.distance({x: mx, y: my}, b) < 120);
                if (clickedBoat) {
                    let upgraded = false;
                    if (sel === TILES.WOOD.id) {
                        if (clickedBoat.hp >= clickedBoat.maxHp) { this.spawnText(mx, my, "FULL HP", "#0f0"); }
                        else if (this.player.inventory[TILES.WOOD.id] >= CONFIG.REPAIR.COST || this.godMode) {
                            if (!this.godMode) this.player.inventory[TILES.WOOD.id] -= CONFIG.REPAIR.COST;
                            clickedBoat.hp = Math.min(clickedBoat.hp + CONFIG.REPAIR.AMOUNT, clickedBoat.maxHp);
                            this.spawnText(mx, my, `+${CONFIG.REPAIR.AMOUNT} HP`, "#0f0");
                            upgraded = true;
                        } else { this.spawnText(mx, my, "NEED WOOD", "#f00"); }
                    } else if (sel === TILES.IRON.id) {
                        if ((clickedBoat.hullLevel || 0) >= 4) { this.spawnText(mx, my, "MAX HULL", "#f00"); }
                        else if (this.player.inventory[TILES.IRON.id] >= 3 || this.godMode) {
                            if (!this.godMode) this.player.inventory[TILES.IRON.id] -= 3;
                            clickedBoat.hullLevel = (clickedBoat.hullLevel || 0) + 1;
                            clickedBoat.applyUpgrades();
                            this.spawnText(mx, my, `HULL LV${clickedBoat.hullLevel}`, "#aaa");
                            upgraded = true;
                        } else { this.spawnText(mx, my, "NEED 3 IRON", "#f00"); }
                    } else if (sel === TILES.WOOL.id) {
                        if ((clickedBoat.sailLevel || 0) >= 4) { this.spawnText(mx, my, "MAX SAILS", "#f00"); }
                        else if (this.player.inventory[TILES.WOOL.id] >= 3 || this.godMode) {
                            if (!this.godMode) this.player.inventory[TILES.WOOL.id] -= 3;
                            clickedBoat.sailLevel = (clickedBoat.sailLevel || 0) + 1;
                            this.spawnText(mx, my, `SAILS LV${clickedBoat.sailLevel}`, "#eee");
                            upgraded = true;
                        } else { this.spawnText(mx, my, "NEED 3 WOOL", "#f00"); }
                    } else if (sel === TILES.GOLD.id) {
                        if ((clickedBoat.cannonLevel || 0) >= 4) { this.spawnText(mx, my, "MAX CANNON", "#f00"); }
                        else if (this.player.inventory[TILES.GOLD.id] >= 2 || this.godMode) {
                            if (!this.godMode) this.player.inventory[TILES.GOLD.id] -= 2;
                            clickedBoat.cannonLevel = (clickedBoat.cannonLevel || 0) + 1;
                            this.spawnText(mx, my, `CANNON LV${clickedBoat.cannonLevel}`, "#ffd700");
                            upgraded = true;
                        } else { this.spawnText(mx, my, "NEED 2 GOLD", "#f00"); }
                    }
                    if (upgraded) {
                        if (!this.network.isHost) {
                            const uType = sel === TILES.WOOD.id ? 'repair' : sel === TILES.IRON.id ? 'hull' : sel === TILES.WOOL.id ? 'sail' : 'cannon';
                            this.network.actions.sendEntReq({ act: 'upgradeBoat', id: clickedBoat.id, type: uType });
                        }
                        this.spawnParticles(mx, my, sel === TILES.WOOD.id ? '#0f0' : '#ff0', 8);
                        this.ui.update();
                    }
                    return;
                }

                if (NON_PLACEABLE_TILES.includes(sel)) return;

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
            
            // Blueprint Logic
            if (this.activeBlueprint) {
                const costMap = this.activeBlueprint.cost || {};
                let affordable = true;
                for (let [id, qty] of Object.entries(costMap)) {
                     if ((this.player.inventory[id] || 0) < qty && !this.godMode) affordable = false;
                }
                
                if (affordable) {
                    if (this.activeBlueprint.special === 'boat' || this.activeBlueprint.special === 'galleon') {
                        if (![TILES.WATER.id, TILES.DEEP_WATER.id].includes(this.world.getTile(gx, gy))) return;
                        if (!this.godMode) for (let [id, qty] of Object.entries(costMap)) this.player.inventory[id] -= qty;
                        
                        const subtype = this.activeBlueprint.special === 'galleon' ? 'galleon' : 'sloop';
                        
                        if (this.network.isHost) {
                             this.boats.push(new Boat(gx*32+16, gy*32+16, 'player', subtype));
                             this.spawnParticles(gx*32+16, gy*32+16, '#8B4513', 8);
                        } else {
                             this.network.actions.sendEntReq({ act: 'spawnBoat', x: gx*32+16, y: gy*32+16, type: subtype });
                        }
                    } else if (this.activeBlueprint.special === 'worker') {
                        const currentTile = this.world.getTile(gx, gy);
                        if ([TILES.WATER.id, TILES.DEEP_WATER.id].includes(currentTile)) return;
                        const tileDef = ID_TO_TILE[currentTile];
                        if (tileDef && tileDef.solid) return;

                        if (!this.godMode) for (let [id, qty] of Object.entries(costMap)) this.player.inventory[id] -= qty;

                        const wx = gx * 32 + 16;
                        const wy = gy * 32 + 16;
                        if (this.network.isHost) {
                            this.workers.push(new Worker(wx, wy));
                            this.spawnParticles(wx, wy, '#DEB887', 8);
                            this.spawnText(wx, wy, "WORKER PLACED", "#ffd700");
                        } else {
                            this.network.actions.sendEntReq({ act: 'spawnWorker', x: wx, y: wy });
                        }
                        this.ui.update();
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
                    this.activeBlueprint = null;
                    this.player.selectedTile = null;
                    this.ui.update();
                }
            }

        } else if (this.input.mouse.clickedRight) {
            if (this.activeBlueprint || this.player.selectedTile) {
                this.exitPlacementMode();
                return;
            }
            this.closeFloatingMenus();

            // Worker targeting (if a worker is selected, assign a resource target)
            if (this.selectedWorker && this.selectedWorker.hp > 0) {
                const clickedSheepForWorker = this.animals.find(a =>
                    Utils.distance(a, { x: mx, y: my }) < 24 && a.hasWool
                );
                if (clickedSheepForWorker) {
                    if (this.network.isHost) {
                        this.selectedWorker.assignTarget({ type: 'sheep', id: clickedSheepForWorker.id }, this);
                    } else {
                        this.network.actions.sendEntReq({
                            act: 'workerTarget', wid: this.selectedWorker.id,
                            ttype: 'sheep', tid: clickedSheepForWorker.id
                        });
                    }
                    this.spawnText(mx, my, "SHEARING", "#ffd700");
                    this.selectedWorker = null;
                    return;
                }

                const targetTileId = this.world.getTile(gx, gy);
                if (Worker.isGatherable(targetTileId)) {
                    if (this.network.isHost) {
                        this.selectedWorker.assignTarget({ type: 'tile', gx, gy }, this);
                    } else {
                        this.network.actions.sendEntReq({
                            act: 'workerTarget', wid: this.selectedWorker.id,
                            ttype: 'tile', gx, gy
                        });
                    }
                    this.spawnText(mx, my, "GATHERING", "#ffd700");
                    this.selectedWorker = null;
                    return;
                }

                this.spawnText(mx, my, "INVALID TARGET", "#f00");
                this.selectedWorker = null;
                return;
            }

            // Worker selection
            const clickedWorker = this.workers.find(w =>
                w.hp > 0 && Utils.distance(w, { x: mx, y: my }) < 20
            );
            if (clickedWorker) {
                this.selectedWorker = clickedWorker;
                this.spawnText(clickedWorker.x, clickedWorker.y - 10, "SELECTED", "#ffd700");
                return;
            }

            // Board/Unboard
            if (this.player.inBoat) {
                const clickedTile = this.world.getTile(gx, gy);
                const allowed = [TILES.GRASS.id, TILES.SAND.id, TILES.GREY.id, TILES.WOOD_RAIL.id];
                if (allowed.includes(clickedTile) && Utils.distance(this.player, {x:mx, y:my}) < 100) {
                     const currentType = this.player.subtype || 'sloop';
                     const newBoat = new Boat(this.player.x, this.player.y, 'player', currentType);
                     newBoat.hp = this.player.hp;
                     newBoat.hullLevel = this.player.hullLevel || 0;
                     newBoat.sailLevel = this.player.sailLevel || 0;
                     newBoat.cannonLevel = this.player.cannonLevel || 0;
                     newBoat.applyUpgrades();
                     this.player.hp = this.player.storedHp || 100;
                     this.player.maxHp = 100;
                     this.player.inBoat = false;
                     this.player.subtype = null;
                     this.player.x = gx*32+16; 
                     this.player.y = gy*32+16;
                     
                     if (this.network.isHost) {
                         this.boats.push(newBoat);
                     } else {
                         this.network.actions.sendEntReq({
                             act: 'spawnBoat',
                             x: newBoat.x, y: newBoat.y,
                             type: currentType,
                             hp: newBoat.hp,
                             hull: newBoat.hullLevel || 0,
                             sail: newBoat.sailLevel || 0,
                             cannon: newBoat.cannonLevel || 0
                         });
                     }
                     return;
                }
            } else {
                const boatIdx = this.boats.findIndex(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (boatIdx !== -1 && Utils.distance(this.player, this.boats[boatIdx]) < 100) {
                     const boat = this.boats[boatIdx];
                     this.player.storedHp = this.player.hp;
                     this.player.hp = boat.hp;
                     this.player.maxHp = (SHIP_SPECS[boat.subtype] || SHIP_SPECS['sloop']).hp + (boat.hullLevel || 0) * 50;
                     this.player.inBoat = true;
                     this.player.subtype = boat.subtype;
                     this.player.hullLevel = boat.hullLevel || 0;
                     this.player.sailLevel = boat.sailLevel || 0;
                     this.player.cannonLevel = boat.cannonLevel || 0;
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
            
            // Harvest mature crop
            const cropTile = this.world.getTile(gx, gy);
            if (cropTile === TILES.CROP_READY.id) {
                if (this.network.isHost) {
                    const biome = Utils.getBiome(gx, gy, this.world.seed);
                    const restoreId = biome === TILES.SAND.id ? TILES.SAND.id : TILES.GRASS.id;
                    this.world.setTile(gx, gy, restoreId);
                    this.network.broadcastBuild(gx, gy, restoreId);
                    this.crops = this.crops.filter(c => c.x !== gx || c.y !== gy);
                } else {
                    this.network.actions.sendEntReq({ act: 'harvestCrop', x: gx, y: gy });
                }
                const harvestQty = 2 + Math.floor(Math.random() * 2);
                this.player.inventory[TILES.GREENS.id] = (this.player.inventory[TILES.GREENS.id] || 0) + harvestQty;
                this.spawnText(mx, my, `+${harvestQty} Greens`, "#0f0");
                this.spawnParticles(mx, my, '#4a8c3f', 8);
                this.ui.update();
                return;
            }

            // Remove/Attack Tile
            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];

            if (tileId === TILES.TREE.id || (tileDef && tileDef.hp) || DESTRUCTIBLE_TILES.includes(tileId)) {
                this.applyDamageToTile(gx, gy, 20); 
            }
        }
    }

    tryBuild(gx, gy, id, allowRailOverwrite = false, isBridge = false, force = false) {
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

        if (!this.network.isHost && !force) {
            this.network.requestBuild(gx, gy, id);
            return true;
        }

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
             if (weaponId !== TILES.GREY.id && (this.player.inventory[TILES.GREY.id] || 0) > 0) {
                 this.player.activeRange = TILES.GREY.id;
                 this.spawnText(this.player.x, this.player.y - 20, "SWITCHED TO STONES", "#ff0");
                 this.ui.update();
                 return;
             }
             this.spawnText(this.player.x, this.player.y - 20, "NO AMMO", "#f00"); 
             return;
        }

        if (!this.godMode) this.player.inventory[weaponId]--;

        const originX = this.player.x;
        const originY = this.player.y - 10;
        const aimAngle = Math.atan2(ty - originY, tx - originX);
        const spawnDist = 28;
        const sx = originX + Math.cos(aimAngle) * spawnDist;
        const sy = originY + Math.sin(aimAngle) * spawnDist;
        
        const proj = new Projectile(sx, sy, tx, ty, damage, speed, color, true, type, this.network.selfId);
        proj.life = range;
        proj.fromLocal = true;
        proj.grace = 10;
        this.projectiles.push(proj);
        this.shootCooldown = 30;
        
        this.network.actions.sendShoot({
            x: sx, y: sy,
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
        
        if (meleeId === TILES.SWORD_IRON.id) dmg = WEAPONS.SWORD_IRON.damage;
        else if (meleeId === TILES.SWORD_WOOD.id) dmg = WEAPONS.SWORD_WOOD.damage;
        else if (meleeId === 'hand') dmg = 5; 
        
        if (dmg === 0) return;
        dmg += (this.player.dmgBonus || 0);

        let range = CONFIG.TILE_SIZE + 10;
        if (meleeId === TILES.SWORD_IRON.id || meleeId === TILES.SWORD_WOOD.id) range += 8;

        const targets = [...this.npcs, ...this.animals];
        for (const t of targets) {
            if (t.hp <= 0) continue;
            if (Utils.distance(this.player, t) < range) {
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
            const r = Math.random();
            if (r < 0.70) dropId = TILES.GREY.id;
            else if (r < 0.85) dropId = TILES.BLACK.id;
            else if (r < 0.95) dropId = TILES.IRON.id;
            else dropId = TILES.GOLD.id;
            qty = 1;
        } else if (type === 'archer') {
            dropId = Math.random() < 0.5 ? TILES.WOOD.id : TILES.BLACK.id;
            qty = 1;
        } else if (type === 'brute') {
            const r = Math.random();
            if (r < 0.4) { dropId = TILES.IRON.id; qty = 2; }
            else if (r < 0.7) { dropId = TILES.GREY.id; qty = 3; }
            else { dropId = TILES.GOLD.id; qty = 1; }
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
            else if (type === TILES.STONE_BLOCK.id) { 
                dropId = TILES.GREY.id; 
                qty = 3; 
            }
            else if (type === TILES.MOUNTAIN.id) { 
                const r = Math.random();
                if (r < 0.15) dropId = TILES.BLACK.id;
                else if (r < 0.35) dropId = TILES.IRON.id;
                else dropId = TILES.GREY.id;
                qty = 1; 
            }
            else if (type === TILES.CROP_READY.id) { dropId = TILES.GREENS.id; qty = 2; }
            else if (type === TILES.CROP_GROWING.id) { dropId = TILES.GREENS.id; qty = 1; }
            else if (type === TILES.CROP_SEED.id) { dropId = TILES.GREENS.id; qty = 1; }
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
        if (isNaN(damage)) return;
        if (entity.type === 'peer') return;

        if (this.network.isHost && entity.type === 'player') {
            this.peaceTimer = 0;
        }

        if (entity === this.player) {
            if (this.network.isHost) {
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

        if (damage < 0) {
            if (this.network.isHost) {
                 this.world.hitTile(gx, gy, damage);
                 
                 if (this.world.getTileDamage(gx, gy) <= 0) {
                     delete this.world.tileData[`${gx},${gy}`];
                 }

                 const tx = gx * CONFIG.TILE_SIZE + 16;
                 const ty = gy * CONFIG.TILE_SIZE + 16;
                 this.spawnParticles(tx, ty, '#0f0', 5);
                 this.spawnText(tx, ty, `+${Math.abs(damage)}`, '#0f0');
                 this.network.broadcastTileHit(gx, gy, damage);
            } else {
                 this.network.actions.sendTileReq({
                    x: gx, y: gy, dmg: damage, type: 'damage'
                 });
            }
            return;
        }

        if (!tileDef || (!tileDef.hp && tileId !== TILES.TREE.id && !DESTRUCTIBLE_TILES.includes(tileId))) return;
        
        if (tileId === TILES.TREE.id) {
             this.network.requestRemove(gx, gy, TILES.GRASS.id);
             this.spawnHarvestParticles(gx * CONFIG.TILE_SIZE + 16, gy * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 1.2);
             return;
        }

        const tx = gx * CONFIG.TILE_SIZE + 16;
        const ty = gy * CONFIG.TILE_SIZE + 16;
        
        if (this.network.isHost) {
            const totalDmg = this.world.hitTile(gx, gy, damage);
            
            this.spawnHarvestParticles(tx, ty, tileDef.color, 1);
            this.spawnText(tx, ty, `-${damage}`, '#fff');
            
            let destroyed = false;
            if (tileDef.hp) {
                if (totalDmg >= tileDef.hp) destroyed = true;
            } else if (DESTRUCTIBLE_TILES.includes(tileId)) {
                destroyed = true;
            }

            if (destroyed) {
                const biome = Utils.getBiome(gx, gy, this.world.seed);
                let restoreId = TILES.GRASS.id;
                if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;
                
                this.network.requestRemove(gx, gy, restoreId);
                this.spawnHarvestParticles(tx, ty, tileDef.color, 1.6);
                this.triggerShake(5); 
                this.recalculateCannons();
                if (tileId === TILES.CROP_SEED.id || tileId === TILES.CROP_GROWING.id || tileId === TILES.CROP_READY.id) {
                    this.crops = this.crops.filter(c => c.x !== gx || c.y !== gy);
                }
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
    spawnHarvestParticles(x, y, color, intensity = 1) {
        this.particles.spawnHarvestBurst(x, y, color, intensity);
    }

    recalculateCannons() {
        if (!this.player) return;

        if (this.cannons) {
            this.cannons.forEach(c => this.cannonStore.set(c.key, { ammo: c.ammo, cooldown: c.cooldown }));
        }

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
                         const stored = this.cannonStore.get(key);
                         const ammo = stored ? stored.ammo : 10;
                         const cooldown = stored ? stored.cooldown : 0;
                         
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

            if (!this.network.isHost) return;
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
                
                const proj = new Projectile(c.x, c.y - 20, target.x, target.y, c.damage, 10, '#000', true, 'cannonball', c.key);
                this.projectiles.push(proj);
                this.spawnParticles(c.x, c.y - 10, '#888', 3);
                this.triggerShake(2); 

                this.network.actions.sendCannon({ 
                    key: c.key, 
                    act: 'shoot', 
                    ammo: c.ammo, 
                    tx: target.x, 
                    ty: target.y 
                });
            }
        });
    }

    updateHostAI(dt) {
         if (!this.network.isHost) return;

         this.gameTime += dt;
         this.updateCrops(dt);

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

         const graceOver = this.gameTime >= 60000;

         if (graceOver) {
             this.threatLevel += dt / 60000;
             this.handlePeaceTimer(dt);
         }

         this.npcs.forEach(npc => {
            if (npc.updateAI) {
                npc.updateAI(dt, this.player, this.world, this);
            } else {
                if (!npc.aiState) npc.aiState = { mode: 'chase', tx: 0, ty: 0, timer: 0, target: null };
            }
            if (npc.isMoving) npc.moveTime += dt;
         });

         this.workers.forEach(w => w.updateAI(dt, this));

         if (graceOver) {
             const boatCount = this.boats.filter(b => b.owner === 'enemy').length;
             if (boatCount < 2 && Math.random() < 0.001) { 
                 const enemyBoat = Boat.createInvasionForce(this);
                 if (enemyBoat) {
                     this.boats.push(enemyBoat);
                     this.spawnText(enemyBoat.x, enemyBoat.y, "ENEMY SHIP!", "#ff0000");
                 }
             }
         }

         this.boats.forEach(b => {
             if (b.owner === 'enemy') {
                 b.updateAI(dt, this.player, this.world, this);
             }
         });
    }

    handlePeaceTimer(dt) {
        this.peaceTimer += dt;
        const enemyBoatCount = this.boats.filter(b => b.owner === 'enemy').length;
        if (this.peaceTimer >= this.peaceThreshold && enemyBoatCount < 3) {
            const enemyBoat = Boat.createInvasionForce(this);
            if (enemyBoat) {
                this.boats.push(enemyBoat);
                this.spawnText(enemyBoat.x, enemyBoat.y, "PEACE BROKEN!", "#ff0000");
                this.showMessage("A NEW ENEMY APPROACHES", "#f00", 4000);
            }
            this.peaceTimer = 0;
            this.peaceThreshold = this.getNewPeaceThreshold();
        }
    }

    
    updateEntities(deltaTime) {
        [...this.npcs, ...this.animals, ...this.boats, ...this.workers].forEach(e => {
            if(!this.network.isHost) {
                const dx = (e.targetX || e.x) - e.x;
                const dy = (e.targetY || e.y) - e.y;
                e.x += dx * 0.15; e.y += dy * 0.15;
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                    e.isMoving = true;
                    e.moveTime = (e.moveTime || 0) + deltaTime;
                } else {
                    e.isMoving = false;
                }
            }
        });
    }

    updateProjectiles() {
        this.projectiles.forEach(p => {
            const status = p.update();

            if (status === 'expired') {
                 const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
                 const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
                 const tileId = this.world.getTile(gx, gy);
                 if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) {
                     this.spawnParticles(p.x, p.y, '#ffffff', 6);
                 }
                 return;
            }

            if (!p.active) return;

            const targets = [this.player, ...this.npcs, ...this.animals, ...this.boats, ...this.workers, ...Object.values(this.peers)];
            const selfId = this.network.selfId;
            
            for (const t of targets) {
                const hitsLocalPlayer = t === this.player;
                const isOwnLocalShot = p.fromLocal || p.ownerId === selfId || p.ownerId === this.player.id;
                if (hitsLocalPlayer && isOwnLocalShot) continue;
                if (hitsLocalPlayer && p.grace > 0) continue;
                if (p.ownerId && p.ownerId === t.id) continue;
                if (p.owner === 'player' && (hitsLocalPlayer || t.type === 'peer')) continue;
                if (p.owner === 'player' && t.type === 'boat' && t.owner === 'player') continue;
                if (p.owner === 'enemy' && t.type === 'npc') continue;
                if (p.owner === 'enemy' && t.type === 'boat' && t.owner === 'enemy') continue;
                
                if (Utils.distance(p, t) < 20) {
                    if (this.network.isHost) {
                        this.applyDamageToEntity(t, p.damage);
                    } else {
                        this.spawnParticles(t.x, t.y, '#f00', 3);
                    }
                    p.active = false;
                    return;
                }
            }

            const gx = Math.floor(p.x / CONFIG.TILE_SIZE);
            const gy = Math.floor(p.y / CONFIG.TILE_SIZE);
            
            if (p.ownerId === `${gx},${gy}`) return;

            const tileId = this.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            
            if (tileDef && tileDef.hp && tileId !== TILES.TREE.id && tileId !== TILES.STONE_BLOCK.id && !tileDef.isTower) {
                if (this.network.isHost) {
                    this.applyDamageToTile(gx, gy, p.damage);
                }
                p.active = false;
                return;
            }
        });
        this.projectiles = this.projectiles.filter(p => p.active);
    }
    
    cleanupEntities() {
         if (this.network.isHost) {
            const deadNpcs = this.npcs.filter(n => n.hp <= 0);
            deadNpcs.forEach(n => {
                this.spawnLoot(n.x, n.y, n.npcType || 'raider'); 
                this.spawnParticles(n.x, n.y, '#555', 8);
            });
            const allPlayers = [this.player, ...Object.values(this.peers)];
            this.npcs = this.npcs.filter(n => {
                if (n.hp <= 0) return false;
                return allPlayers.some(p => Utils.distance(n, p) < 3000);
            });

            this.boats = this.boats.filter(b => b.hp > 0);
            
            const deadAnimals = this.animals.filter(a => a.hp <= 0);
            deadAnimals.forEach(a => {
                this.spawnLoot(a.x, a.y, 'sheep'); 
                this.spawnParticles(a.x, a.y, '#f00', 8);
            });
            this.animals = this.animals.filter(a => a.hp > 0);

            const deadWorkers = this.workers.filter(w => w.hp <= 0);
            deadWorkers.forEach(w => {
                this.spawnParticles(w.x, w.y, '#DEB887', 8);
                this.spawnText(w.x, w.y, "WORKER LOST", "#f00");
            });
            this.workers = this.workers.filter(w => w.hp > 0);
         }
    }

    handlePlayerDeath() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.deathCount++;
        this.respawnTimer = 3000 + (this.deathCount * 2000);
        this.playerBuff = null;
        this.player.speedMult = 1;
        this.player.dmgBonus = 0;
        this.spawnParticles(this.player.x, this.player.y, '#f00', 30);
        this.triggerShake(15); 
        this.showMessage(`YOU DIED! RESPAWN IN ${Math.ceil(this.respawnTimer / 1000)}s`, "#f00");
        if (this.network.actions.sendKillFeed) {
            this.network.actions.sendKillFeed({ name: this.network.playerName });
        }
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
        this.player.maxHp = 100;
        this.player.inBoat = false;
        this.player.subtype = null;
        this.player.x = this.spawnPoint.x;
        this.player.y = this.spawnPoint.y;
        this.regenTimer = 0;
        this.ui.update();
    }
    
    handleCameraZoom() {
        if (this.input.wheel !== 0) {
            this.zoom = Math.max(0.3, Math.min(this.zoom - this.input.wheel * 0.001, 3));
        }
        const viewWidth = this.canvas.width / this.zoom;
        const viewHeight = this.canvas.height / this.zoom;
        
        let shakeX = 0, shakeY = 0;
        if (this.shake > 0) {
            shakeX = (Math.random() - 0.5) * this.shake;
            shakeY = (Math.random() - 0.5) * this.shake;
        }

        this.camera.x = this.player.x - viewWidth / 2 + shakeX;
        this.camera.y = this.player.y - viewHeight / 2 + shakeY;
    }
    
    triggerShake(amount) {
        this.shake = Math.min(this.shake + amount, 20);
    }

    updatePeers(deltaTime) { 
        Object.values(this.peers).forEach(p => {
            const dist = Math.sqrt((p.targetX - p.x)**2 + (p.targetY - p.y)**2);
            if (dist > 300) {
                p.x = p.targetX;
                p.y = p.targetY;
            } else {
                const factor = 1 - Math.exp(-0.008 * deltaTime);
                p.x += (p.targetX - p.x) * factor;
                p.y += (p.targetY - p.y) * factor;
            }

            if (p.inBoat && p.boatStats) {
                const rotFactor = 1 - Math.exp(-0.005 * deltaTime);
                p.boatStats.heading = Utils.lerpAngle(p.boatStats.heading, p.boatStats.targetHeading, rotFactor);
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
            boats: this.boats.map(b => ({ x: b.x, y: b.y, hp: b.hp, owner: b.owner, subtype: b.subtype, hull: b.hullLevel || 0, sail: b.sailLevel || 0, cannon: b.cannonLevel || 0 })),
            deathCount: this.deathCount,
            threatLevel: this.threatLevel,
            crops: this.crops
        };
        try { 
            localStorage.setItem('peerPiratesSave', JSON.stringify(data)); 
            this.showMessage("GAME SAVED", "#0f0", 3000);
        } catch (e) {
            console.error(e);
            this.showMessage("SAVE FAILED", "#f00", 3000);
        }
    }
    
    showMessage(txt, col, duration) {
        const el = document.getElementById('messages');
        el.innerText = txt;
        if(col) el.style.color = col;
        if (this._msgTimer) clearTimeout(this._msgTimer);
        if (duration) {
            this._msgTimer = setTimeout(() => { el.innerText = ''; }, duration);
        }
    }
    
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

    giveResources() {
        const resources = [TILES.WOOD.id, TILES.GREY.id, TILES.BLACK.id, TILES.IRON.id, TILES.GOLD.id, TILES.WOOL.id, TILES.GREENS.id];
        resources.forEach(id => { this.player.inventory[id] = (this.player.inventory[id] || 0) + 10; });
        this.spawnText(this.player.x, this.player.y - 10, "+10 ALL", "#0f0");
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

    updateCrops(dt) {
        this.crops = this.crops.filter(c => {
            const tileId = this.world.getTile(c.x, c.y);
            if (tileId !== TILES.CROP_SEED.id && tileId !== TILES.CROP_GROWING.id && tileId !== TILES.CROP_READY.id) {
                return false;
            }
            c.timer += dt;
            if (tileId === TILES.CROP_SEED.id && c.timer >= 20000) {
                this.world.setTile(c.x, c.y, TILES.CROP_GROWING.id);
                this.network.broadcastBuild(c.x, c.y, TILES.CROP_GROWING.id);
            } else if (tileId === TILES.CROP_GROWING.id && c.timer >= 40000) {
                this.world.setTile(c.x, c.y, TILES.CROP_READY.id);
                this.network.broadcastBuild(c.x, c.y, TILES.CROP_READY.id);
            }
            return true;
        });
    }

    eatFood() {
        if (this.isRespawning || this.player.hp <= 0) return;
        const cost = 3;
        if ((this.player.inventory[TILES.GREENS.id] || 0) < cost && !this.godMode) {
            this.spawnText(this.player.x, this.player.y - 20, "NEED 3 GREENS", "#f00");
            return;
        }
        if (!this.godMode) this.player.inventory[TILES.GREENS.id] -= cost;
        this.playerBuff = { timer: 20000 };
        this.spawnText(this.player.x, this.player.y - 20, "WELL FED!", "#0f0");
        this.spawnParticles(this.player.x, this.player.y, '#0f0', 10);
        this.ui.update();
    }
}