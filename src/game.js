import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS, WEAPONS } from './config.js';
import Utils from './utils.js';
import InputHandler from './input.js';
import World from './world.js';
import { Entity, Particle, Projectile, Sheep, Boat, WindParticle } from './entities.js';

export default class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler(this);
        
        let validSpawn = null;
        let attempts = 0;
        
        while (!validSpawn && attempts < 10) {
            this.world = new World(); 
            validSpawn = this.findSafeSpawn();
            if (!validSpawn) {
                console.log("Map rejected (Bad Spawn). Regenerating...");
                attempts++;
            }
        }
        
        if (!validSpawn) {
            validSpawn = {x: 0, y: 0};
            console.warn("Could not find safe spawn after 10 attempts.");
        }

        this.player = new Entity(validSpawn.x, validSpawn.y, 'player');
        this.player.isMoving = false;
        this.player.moveTime = 0;
        
        this.player.activeRange = TILES.GREY.id; 
        this.player.activeMelee = 'hand';        

        this.npcs = [];
        this.animals = []; 
        this.boats = []; 
        this.loot = [];
        this.projectiles = [];
        this.particles = [];
        this.texts = [];
        this.cannons = []; 
        
        // [NEW] Wind Particles
        this.windParticles = Array.from({length: CONFIG.WIND.PARTICLE_COUNT}, () => new WindParticle(this.canvas.width, this.canvas.height));

        this.camera = { x: 0, y: 0 };
        this.zoom = 1;
        this.lastTime = 0;
        this.regenTimer = 0;
        this.godMode = false;
        this.activeBlueprint = null;
        this.shootCooldown = 0;
        
        this.invasionTimer = 0;
        this.nextInvasionTime = 0; 
        
        this.dom = {
            hp: document.getElementById('hp'),
            coords: document.getElementById('coords'),
            seed: document.getElementById('seed-disp'),
            invBar: document.getElementById('inventory-bar'),
            wpnBar: document.getElementById('weapon-bar'),
            bpMenu: document.getElementById('blueprint-menu'),
            wpnMenu: document.getElementById('weapon-menu'),
            activeBp: document.getElementById('active-bp-display'),
            activeWp: document.getElementById('active-weapon-display'),
            bpName: document.getElementById('current-bp-name'),
            wpName: document.getElementById('current-weapon-name'),
            elev: document.getElementById('elev-disp'),
            biome: document.getElementById('biome-disp') 
        };
        
        this.dom.seed.innerText = this.world.seed;
        
        document.getElementById('hammer-btn').onclick = () => this.toggleBlueprints();
        document.getElementById('weapon-btn').onclick = () => this.toggleWeapons();
        document.getElementById('btn-save').onclick = () => this.saveGame();
        document.getElementById('btn-load').onclick = () => this.loadGame();

        this.initUI();
        
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.godMode = !this.godMode;
                this.showMessage(this.godMode ? "GOD MODE ON" : "GOD MODE OFF");
                this.updateUI(); 
            }
        });

        requestAnimationFrame(t => this.loop(t));
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

    loadGame() {
        const json = localStorage.getItem('pixelWarfareSave');
        if (!json) { this.showMessage("NO SAVE FOUND", "#f00"); return; }
        try {
            const data = JSON.parse(json);
            this.world.importData(data.world);
            this.dom.seed.innerText = this.world.seed;
            this.player.x = data.player.x; this.player.y = data.player.y;
            this.player.hp = data.player.hp; this.player.inventory = data.player.inventory || {};
            this.player.inBoat = data.player.inBoat || false; 
            
            this.player.activeRange = data.player.activeRange || TILES.GREY.id;
            this.player.activeMelee = data.player.activeMelee || 'hand';
            
            if (data.player.boatStats) this.player.boatStats = data.player.boatStats;

            this.player.isMoving = false;
            
            if (data.invasion) {
                this.invasionTimer = data.invasion.timer || 0;
                this.nextInvasionTime = data.invasion.next || 0;
            }

            this.npcs = []; this.animals = []; this.projectiles = []; this.particles = []; this.loot = []; this.texts = [];
            
            this.boats = (data.boats || []).map(b => {
                const boat = new Boat(b.x, b.y, b.owner || 'player');
                boat.hp = b.hp;
                return boat;
            });

            this.recalcCannons(); this.updateUI(); this.showMessage("GAME LOADED", "#0f0");
        } catch (e) { console.error(e); this.showMessage("LOAD FAILED", "#f00"); }
    }

    toggleBlueprints() {
        this.dom.wpnMenu.style.display = 'none';
        const menu = this.dom.bpMenu;
        menu.style.display = menu.style.display === 'grid' ? 'none' : 'grid';
    }

    toggleWeapons() {
        this.dom.bpMenu.style.display = 'none';
        const menu = this.dom.wpnMenu;
        menu.style.display = menu.style.display === 'grid' ? 'none' : 'grid';
    }

    resize() { 
        this.canvas.width = window.innerWidth; 
        this.canvas.height = window.innerHeight; 
        // Re-init wind particles on resize to fill screen
        this.windParticles = Array.from({length: CONFIG.WIND.PARTICLE_COUNT}, () => new WindParticle(this.canvas.width, this.canvas.height));
    }

    showMessage(text, color) {
        const msg = document.getElementById('messages');
        msg.innerHTML = text; msg.style.color = color || '#fff'; msg.style.opacity = 1;
        setTimeout(() => msg.style.opacity = 0, 2000);
    }

    initUI() {
        this.dom.invBar.innerHTML = ''; 
        const materials = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS, TILES.WOOL];
        
        materials.forEach((t) => {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.id = `slot-${t.id}`;
            slot.innerHTML = `<div class="slot-color" style="background:${t.color}"></div><div class="short-name">${t.short}</div><div class="qty" id="qty-${t.id}">0</div>`;
            slot.onclick = () => {
                if (this.player.selectedTile === t.id) {
                    this.player.selectedTile = null;
                } else {
                    this.player.selectedTile = t.id;
                    this.activeBlueprint = null;
                }
                this.updateUI();
            };
            this.dom.invBar.appendChild(slot);
        });

        this.dom.wpnBar.innerHTML = '';
        
        const rangeSlot = document.createElement('div');
        rangeSlot.className = 'slot';
        rangeSlot.id = 'slot-range';
        rangeSlot.onclick = () => this.cycleRangeWeapon();
        this.dom.wpnBar.appendChild(rangeSlot);

        const meleeSlot = document.createElement('div');
        meleeSlot.className = 'slot';
        meleeSlot.id = 'slot-melee';
        meleeSlot.innerHTML = `<div class="icon-sword">🗡️</div><div class="short-name" id="name-melee">Hand</div>`;
        meleeSlot.onclick = () => this.cycleMeleeWeapon();
        this.dom.wpnBar.appendChild(meleeSlot);

        this.dom.bpMenu.innerHTML = '';
        BLUEPRINTS.forEach((bp, index) => {
            const div = document.createElement('div');
            div.className = 'bp-item';
            let costStr = "Free";
            if (bp.cost) costStr = Object.entries(bp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            div.innerHTML = `<div class="bp-name">${bp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => { 
                if (div.classList.contains('disabled')) return;
                this.activeBlueprint = bp; 
                this.player.selectedTile = null; 
                this.toggleBlueprints(); 
                this.updateUI(); 
            };
            this.dom.bpMenu.appendChild(div);
        });

        this.dom.wpnMenu.innerHTML = '';
        Object.values(WEAPONS).forEach((wp) => {
            const div = document.createElement('div');
            div.className = 'bp-item';
            let costStr = Object.entries(wp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            div.innerHTML = `<div class="bp-name">${wp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => {
                if (div.classList.contains('disabled')) return;
                if (!this.godMode) {
                    for (const [id, qty] of Object.entries(wp.cost)) this.player.inventory[id] -= qty;
                }
                this.player.inventory[wp.id] = (this.player.inventory[wp.id] || 0) + 1;
                this.showMessage(`Crafted ${wp.name}!`, '#fff');
                this.toggleWeapons();
                this.updateUI(); 
            };
            this.dom.wpnMenu.appendChild(div);
        });

        this.updateUI();
    }

    cycleRangeWeapon() {
        const cycle = [TILES.GREY.id, TILES.SPEAR_WOOD.id, TILES.SPEAR_IRON.id];
        let idx = cycle.indexOf(this.player.activeRange);
        if (idx === -1) idx = 0;

        let found = false;
        let attempts = 0;
        
        while(!found && attempts < 3) {
            idx = (idx + 1) % cycle.length;
            const nextId = cycle[idx];
            if (nextId === TILES.GREY.id || (this.player.inventory[nextId] || 0) > 0 || this.godMode) {
                this.player.activeRange = nextId;
                found = true;
            }
            attempts++;
        }
        this.updateUI();
    }

    cycleMeleeWeapon() {
        const cycle = ['hand', TILES.SWORD_WOOD.id, TILES.SWORD_IRON.id];
        let idx = cycle.indexOf(this.player.activeMelee);
        if (idx === -1) idx = 0;

        let found = false;
        let attempts = 0;
        
        while(!found && attempts < 3) {
            idx = (idx + 1) % cycle.length;
            const nextId = cycle[idx];
            if (nextId === 'hand' || (this.player.inventory[nextId] || 0) > 0 || this.godMode) {
                this.player.activeMelee = nextId;
                found = true;
            }
            attempts++;
        }
        this.updateUI();
    }

    updateUI() {
        const materials = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS, TILES.WOOL];
        materials.forEach(t => {
            const slot = document.getElementById(`slot-${t.id}`);
            const qtyEl = document.getElementById(`qty-${t.id}`);
            if(slot && qtyEl) {
                qtyEl.innerText = this.player.inventory[t.id] || 0;
                slot.classList.toggle('active', !this.activeBlueprint && t.id === this.player.selectedTile);
            }
        });

        const rSlot = document.getElementById('slot-range');
        let rIcon = '';
        let rName = '';
        if (this.player.activeRange === TILES.GREY.id) {
            rIcon = `<div class="icon-boulder"></div>`;
            rName = 'Stone';
        } else if (this.player.activeRange === TILES.SPEAR_WOOD.id) {
            rIcon = `<div class="icon-spear tip-black"></div>`;
            rName = 'Ob.Spr';
        } else if (this.player.activeRange === TILES.SPEAR_IRON.id) {
            rIcon = `<div class="icon-spear tip-grey"></div>`;
            rName = 'Ir.Spr';
        }
        rSlot.innerHTML = `${rIcon}<div class="short-name">${rName}</div>`;

        const mSlot = document.getElementById('slot-melee');
        let mIcon = '';
        let mName = '';
        if (this.player.activeMelee === 'hand') {
            mIcon = `<div class="icon-fist">✊</div>`;
            mName = 'Hand';
        } else if (this.player.activeMelee === TILES.SWORD_WOOD.id) {
            mIcon = `<div class="icon-sword-css blade-black"></div>`;
            mName = 'Ob.Swd';
        } else if (this.player.activeMelee === TILES.SWORD_IRON.id) {
            mIcon = `<div class="icon-sword-css blade-grey"></div>`;
            mName = 'Ir.Swd';
        }
        mSlot.innerHTML = `${mIcon}<div class="short-name">${mName}</div>`;

        const bpItems = this.dom.bpMenu.children;
        BLUEPRINTS.forEach((bp, i) => {
            const div = bpItems[i];
            let canAfford = true;
            if (bp.cost && !this.godMode) {
                for (const [id, qty] of Object.entries(bp.cost)) {
                    if ((this.player.inventory[id] || 0) < qty) { canAfford = false; break; }
                }
            }
            if (canAfford) div.classList.remove('disabled'); else div.classList.add('disabled');
        });

        const wpItems = this.dom.wpnMenu.children;
        Object.values(WEAPONS).forEach((wp, i) => {
            const div = wpItems[i];
            let canAfford = true;
            if (wp.cost && !this.godMode) {
                for (const [id, qty] of Object.entries(wp.cost)) {
                    if ((this.player.inventory[id] || 0) < qty) { canAfford = false; break; }
                }
            }
            if (canAfford) div.classList.remove('disabled'); else div.classList.add('disabled');
        });

        if(this.activeBlueprint) {
            this.dom.activeBp.style.display = 'block';
            this.dom.bpName.innerText = this.activeBlueprint.name;
        } else {
            this.dom.activeBp.style.display = 'none';
        }
    }

    findSafeSpawn() {
        const isSafe = (gx, gy) => {
            const t = this.world.getTile(gx, gy);
            if (t !== TILES.GRASS.id) return false;
            const radius = 8;
            for(let y = -radius; y <= radius; y++) {
                for(let x = -radius; x <= radius; x++) {
                    const nt = this.world.getTile(gx + x, gy + y);
                    if (nt === TILES.WATER.id || nt === TILES.DEEP_WATER.id) return false;
                }
            }
            return true;
        };
        for (let r = 0; r < 2000; r++) { 
            const x = (Math.random() - 0.5) * 5000; const y = (Math.random() - 0.5) * 5000;
            const gx = Math.floor(x/CONFIG.TILE_SIZE); const gy = Math.floor(y/CONFIG.TILE_SIZE);
            if (isSafe(gx, gy)) return {x, y};
        }
        return null; 
    }

    throwProjectile(tx, ty) {
        if (this.shootCooldown > 0) return;
        
        const weaponId = this.player.activeRange;
        let damage = 25;
        let speed = 8;
        let color = '#aaa';
        let range = 25; 
        let type = 'stone'; 
        
        if (weaponId === TILES.SPEAR_WOOD.id) { damage = 35; speed = 10; color = '#8B4513'; range = 45; type = 'spear'; }
        else if (weaponId === TILES.SPEAR_IRON.id) { damage = 60; speed = 14; color = '#aaa'; range = 50; type = 'spear'; }
        
        if (!this.godMode && (this.player.inventory[weaponId] || 0) <= 0) {
            if (weaponId !== TILES.GREY.id) {
                this.spawnText(this.player.x, this.player.y - 20, "NO AMMO", "#f00");
                return;
            } else {
                this.spawnText(this.player.x, this.player.y - 20, "NO STONE", "#f00");
                return;
            }
        }
        
        if (!this.godMode) this.player.inventory[weaponId]--;
        
        const proj = new Projectile(this.player.x, this.player.y - 10, tx, ty, damage, speed, color, true, type);
        proj.life = range; 
        this.projectiles.push(proj);
        
        this.shootCooldown = 30;
        if (type === 'stone') this.spawnParticles(this.player.x, this.player.y, '#aaa', 3);
        
        this.updateUI();
    }

    handleInteraction() {
        if (!this.input.mouse.clickedLeft && !this.input.mouse.clickedRight) return;

        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);

        if (Utils.distance(this.player, {x: mx, y: my}) > CONFIG.BUILD_RANGE) return;

        const isOccupied = (tx, ty) => {
            const tileCenter = { x: tx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: ty * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 };
            const allEntities = [this.player, ...this.npcs, ...this.animals, ...this.boats];
            return allEntities.some(e => Utils.distance(e, tileCenter) < CONFIG.TILE_SIZE/1.5);
        };

        if (this.input.mouse.clickedLeft) {
            
            const clickedTile = this.world.getTile(gx, gy);
            if (clickedTile === TILES.WOOD_WALL.id) {
                this.world.setTile(gx, gy, TILES.WOOD_WALL_OPEN.id);
                this.spawnParticles(mx, my, TILES.WOOD.color, 4);
                return;
            } else if (clickedTile === TILES.WOOD_WALL_OPEN.id) {
                if (isOccupied(gx, gy)) { this.spawnText(mx, my, "BLOCKED", "#f00"); return; }
                this.world.setTile(gx, gy, TILES.WOOD_WALL.id);
                this.spawnParticles(mx, my, TILES.WOOD.color, 4);
                return;
            }

            if (this.player.selectedTile === TILES.GREENS.id) {
                const clickedSheep = this.animals.find(s => Utils.distance(s, {x:mx, y:my}) < 24);
                if (clickedSheep && !clickedSheep.fed) {
                    if (this.player.inventory[TILES.GREENS.id] > 0 || this.godMode) {
                        if(!this.godMode) this.player.inventory[TILES.GREENS.id]--;
                        clickedSheep.fed = true;
                        this.spawnParticles(clickedSheep.x, clickedSheep.y, '#ff00ff', 5);
                        this.spawnText(clickedSheep.x, clickedSheep.y - 10, "❤️", "#f0f");
                        this.updateUI();
                        return;
                    }
                }
            }

            // --- SHOOTING ---
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
                       if (this.tryBuild(gx, gy, id, false, false)) {
                           if(!this.godMode) this.player.inventory[id]--;
                           this.updateUI();
                           this.recalcCannons();
                       }
                    }
                    return;
                }
            }

            if (this.player.selectedTile === TILES.TREE.id || this.player.selectedTile === TILES.MOUNTAIN.id) return;

            const cannon = this.cannons.find(c => {
                const [cx, cy] = c.key.split(',').map(Number);
                return gx === cx && gy === cy;
            });
            if (cannon && this.player.selectedTile === TILES.IRON.id) {
                if (this.player.inventory[TILES.IRON.id] > 0 || this.godMode) {
                    if (!this.godMode) this.player.inventory[TILES.IRON.id]--;
                    cannon.ammo += 5;
                    this.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
                    this.updateUI();
                    return;
                }
            }

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
                        const targetId = this.world.getTile(gx, gy);
                        const allowed = [TILES.WATER.id, TILES.DEEP_WATER.id, TILES.SAND.id];
                        if (!allowed.includes(targetId)) {
                            this.spawnText(mx * this.zoom, my * this.zoom, "INVALID LOCATION", "#f00");
                            return;
                        }
                        
                        this.boats.push(new Boat((gx * CONFIG.TILE_SIZE) + 16, (gy * CONFIG.TILE_SIZE) + 16));
                        for (let [id, qty] of Object.entries(costMap)) consume(id, qty);
                        this.spawnParticles((gx * CONFIG.TILE_SIZE) + 16, (gy * CONFIG.TILE_SIZE) + 16, '#8B4513', 8);
                        this.updateUI();
                        return; 
                    }

                    const isBridgeBp = this.activeBlueprint.special === 'bridge' || this.activeBlueprint.requiresWater;

                    if (this.activeBlueprint.special === 'bridge') {
                        const targetId = this.world.getTile(gx, gy);
                        if (targetId !== TILES.WATER.id && targetId !== TILES.DEEP_WATER.id && targetId !== TILES.WOOD_RAIL.id) {
                             this.spawnText(mx * this.zoom, my * this.zoom, "MUST BUILD ON WATER/RAIL", "#f00"); return;
                        }
                    } else if (this.activeBlueprint.requiresWater) {
                        const targetId = this.world.getTile(gx, gy);
                        if (targetId !== TILES.WATER.id && targetId !== TILES.DEEP_WATER.id) {
                             this.spawnText(mx * this.zoom, my * this.zoom, "MUST BUILD ON WATER", "#f00"); return;
                        }
                    }
                    
                    let built = false;
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
                                    this.world.setTile(n.x, n.y, TILES.WOOD_RAIL.id);
                                    this.spawnParticles(n.x * CONFIG.TILE_SIZE + 16, n.y * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 4);
                                }
                            });
                        }
                        this.updateUI();
                        this.recalcCannons();
                    }
                }
            } else {
                if (isOccupied(gx, gy)) { this.spawnText(mx * this.zoom, my * this.zoom, "OCCUPIED", "#f00"); return; }
                const id = this.player.selectedTile;
                if (canAfford(id, 1)) {
                    if (this.tryBuild(gx, gy, id, false, false)) {
                        consume(id, 1);
                        this.updateUI();
                        this.recalcCannons();
                    }
                }
            }
        } else if (this.input.mouse.clickedRight) {
            
            if (this.player.inBoat) {
                const clickedTile = this.world.getTile(gx, gy);
                if (clickedTile === TILES.SAND.id || clickedTile === TILES.GRASS.id) {
                    const dist = Utils.distance(this.player, {x: mx, y: my});
                    if (dist < 60) {
                        const boatSpawnX = this.player.x;
                        const boatSpawnY = this.player.y;

                        this.player.inBoat = false;
                        this.player.x = (gx * CONFIG.TILE_SIZE) + 16;
                        this.player.y = (gy * CONFIG.TILE_SIZE) + 16;
                        
                        // Reset Boat Stats
                        this.player.boatStats.speed = 0;
                        this.player.boatStats.sailLevel = 0;

                        this.boats.push(new Boat(boatSpawnX, boatSpawnY));
                        
                        this.spawnText(this.player.x, this.player.y, "EXIT BOAT", "#fff");
                        return;
                    }
                }
            } else {
                const clickedBoatIndex = this.boats.findIndex(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (clickedBoatIndex !== -1) {
                    if (Utils.distance(this.player, this.boats[clickedBoatIndex]) < 60) {
                        this.player.inBoat = true;
                        this.player.x = this.boats[clickedBoatIndex].x;
                        this.player.y = this.boats[clickedBoatIndex].y;
                        
                        // Stop velocity on enter
                        this.player.boatStats.speed = 0;

                        this.boats.splice(clickedBoatIndex, 1);
                        this.spawnText(this.player.x, this.player.y, "ENTER BOAT", "#fff");
                        return;
                    }
                }
            }

            const clickedSheep = this.animals.find(s => Utils.distance(s, {x:mx, y:my}) < 24);
            if (clickedSheep && clickedSheep.hasWool) {
                clickedSheep.hasWool = false;
                clickedSheep.woolTimer = CONFIG.WOOL_REGROW_TIME;
                this.loot.push({x: clickedSheep.x, y: clickedSheep.y, id: TILES.WOOL.id, qty: 1, bob: Math.random()*100});
                this.spawnParticles(clickedSheep.x, clickedSheep.y, '#eee', 5);
                return;
            }

            if (this.activeBlueprint) {
                this.activeBlueprint = null;
                this.updateUI();
            } else {
                const tx = gx; const ty = gy;
                let tileId = this.world.getTile(gx, gy);
                const tileDef = ID_TO_TILE[tileId];

                if (!tileDef.solid && tileId !== TILES.TREE.id && tileId !== TILES.WOOD_WALL_OPEN.id) {
                    let below = this.world.getTile(gx, gy + 1);
                    if ([12,14,15].includes(below)) { tileId = below; } 
                    else {
                        let below2 = this.world.getTile(gx, gy + 2);
                        if ([12,14,15].includes(below2)) { tileId = below2; }
                    }
                }
                
                if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id || tileId === TILES.SAND.id || tileId === TILES.GRASS.id) return;
                
                if (tileId === TILES.TREE.id) {
                    this.world.setTile(tx, ty, TILES.GRASS.id);
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 8);
                    this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 3, bob: Math.random()*100});
                    if (Math.random() < 0.1) this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREENS.id, qty: 1, bob: Math.random()*100});
                    return;
                }

                const targetDef = ID_TO_TILE[tileId];
                if (targetDef.hp) {
                    const damageDealt = 20; 
                    const totalDmg = this.world.hitTile(tx, ty, damageDealt);
                    
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 3);
                    this.spawnText(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE, `-${damageDealt}`, '#fff');

                    if (totalDmg >= targetDef.hp) {
                        this.world.setTile(tx, ty, TILES.GRASS.id); 
                        this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#555', 10);
                        
                        if (tileId === TILES.MOUNTAIN.id || tileId === TILES.STONE_BLOCK.id) {
                             this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 3, bob: Math.random()*100});
                             if (Math.random() < 0.1) this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.IRON.id, qty: 2, bob: Math.random()*100});
                             if (Math.random() < 0.01) this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GOLD.id, qty: 1, bob: Math.random()*100});
                        } else if ([12,14,15].includes(tileId)) {
                             this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 4, bob: Math.random()*100});
                        } else if (tileId === TILES.WOOD_WALL.id || tileId === TILES.WOOD_WALL_OPEN.id) {
                             this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 1, bob: Math.random()*100});
                        } else if (tileId === TILES.WALL.id) {
                             this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: 1, bob: Math.random()*100});
                        }
                        
                        this.recalcCannons();
                        this.updateUI();
                    }
                    return;
                }

                if (tileId === TILES.GREY.id || tileId === TILES.WOOD_RAIL.id) {
                    if (isOccupied(tx, ty)) { this.spawnText(mx * this.zoom, my * this.zoom, "OCCUPIED", "#f00"); return; }
                    const biome = Utils.getBiome(tx, ty, this.world.seed);
                    let restoreId = (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) ? biome : TILES.GRASS.id;
                    if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;

                    this.world.setTile(tx, ty, restoreId);
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 5);
                    this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: tileId === TILES.GREY.id ? TILES.GREY.id : TILES.WOOD.id, qty: 1, bob: Math.random()*100});
                    this.updateUI();
                }
            }
        }
    }

    tryBuild(gx, gy, id, allowRailOverwrite = false, isBridge = false) {
        const current = this.world.getTile(gx, gy);
        if (current === id) return false;
        
        if ((current === TILES.WATER.id || current === TILES.DEEP_WATER.id) && !isBridge) return false;
        
        if (allowRailOverwrite && current === TILES.WOOD_RAIL.id) {
            this.world.setTile(gx, gy, id);
            return true;
        }

        if (ID_TO_TILE[current].solid && current !== TILES.WATER.id && current !== TILES.DEEP_WATER.id) return false;
        
        this.world.setTile(gx, gy, id);
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
                if ([12, 14, 15].includes(id)) {
                    const key = `${x},${y}`;
                    let damage = (id===12)?20 : (id===14)?40 : 80;
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
        if (this.input.wheel !== 0) {
            this.zoom = Math.max(0.3, Math.min(this.zoom - this.input.wheel * 0.001, 3));
        }
        
        // Update global wind
        this.world.update(dt);
        
        // [NEW] Update Wind Particles (Screen Space)
        this.windParticles.forEach(p => p.update(this.canvas.width, this.canvas.height, this.world.wind.angle));

        if (this.shootCooldown > 0) this.shootCooldown--;

        this.regenTimer += dt;
        if (this.regenTimer > 2000 && this.player.hp < 100) {
            this.player.hp = Math.min(100, this.player.hp + 5);
            this.spawnText(this.player.x, this.player.y - 20, "+5 HP", "#0f0");
            this.regenTimer = 0;
        }

        // MOVEMENT LOGIC
        const inputState = {
            up: this.input.keys['w'] || this.input.keys['arrowup'],
            down: this.input.keys['s'] || this.input.keys['arrowdown'],
            left: this.input.keys['a'] || this.input.keys['arrowleft'],
            right: this.input.keys['d'] || this.input.keys['arrowright']
        };

        if (this.player.inBoat) {
            this.player.updateBoatMovement(inputState, dt, this.world);
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

        this.handleInteraction();

        // --- ENEMY BOAT SPAWN LOGIC ---
        const enemyBoat = this.boats.find(b => b.owner === 'enemy');
        
        if (!enemyBoat) {
            this.invasionTimer++;
            if (this.invasionTimer > this.nextInvasionTime) {
                // Try spawn
                if (Math.random() < 0.1) { 
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 600 + Math.random() * 200;
                    const sx = this.player.x + Math.cos(angle) * dist;
                    const sy = this.player.y + Math.sin(angle) * dist;
                    const gx = Math.floor(sx / CONFIG.TILE_SIZE);
                    const gy = Math.floor(sy / CONFIG.TILE_SIZE);
                    
                    const tile = this.world.getTile(gx, gy);
                    if (tile === TILES.WATER.id || tile === TILES.DEEP_WATER.id) {
                        this.boats.push(new Boat(sx, sy, 'enemy'));
                        this.spawnText(sx, sy, "NEW INVASION", "#f00");
                        
                        // Reset Invasion Timer (2-20 mins)
                        this.invasionTimer = 0;
                        const minFrames = 7200; // 2 mins
                        const maxFrames = 72000; // 20 mins
                        this.nextInvasionTime = minFrames + Math.random() * (maxFrames - minFrames);
                        console.log(`Next Boat Invasion in ${(this.nextInvasionTime/60/60).toFixed(2)} mins`);
                    }
                }
            }
        } else {
            // Boat exists, reset timer just in case
            this.invasionTimer = 0;
            enemyBoat.updateAI(dt, this.player, this.world, this);
        }
        // ----------------------------------------

        // NPC AI LOGIC OVERHAUL: CHASE -> CHARGE -> REST
        this.npcs.forEach(npc => {
            // Initialize AI state if missing
            if (!npc.aiState) npc.aiState = { mode: 'chase', tx: 0, ty: 0, timer: 0 };

            if (npc.aiState.timer > 0) {
                // Resting
                npc.aiState.timer--;
                npc.isMoving = false;
            } else if (npc.aiState.mode === 'chase') {
                const dist = Utils.distance(npc, this.player);
                
                // Transition to Charge if close (approx 2-3 tiles)
                if (dist < 80) {
                    npc.aiState.mode = 'charge';
                    // Calculate Overrun Target (Point behind player)
                    const angle = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
                    const overrunDist = 150; 
                    npc.aiState.tx = this.player.x + Math.cos(angle) * overrunDist;
                    npc.aiState.ty = this.player.y + Math.sin(angle) * overrunDist;
                } else {
                    // Normal Chase
                    const angle = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
                    npc.move(Math.cos(angle) * 2, Math.sin(angle) * 2, this.world);
                    npc.isMoving = true;
                    npc.moveTime += dt;
                }
            } else if (npc.aiState.mode === 'charge') {
                // Move towards locked target
                const dx = npc.aiState.tx - npc.x;
                const dy = npc.aiState.ty - npc.y;
                const distToTarget = Math.sqrt(dx*dx + dy*dy);
                
                if (distToTarget < 10) {
                    // Reached target -> Rest
                    npc.aiState.mode = 'rest';
                    npc.aiState.timer = 60 + Math.random() * 60; // 1-2 sec pause
                } else {
                    const angle = Math.atan2(dy, dx);
                    // Charging is slightly faster
                    const moved = npc.move(Math.cos(angle) * 3.5, Math.sin(angle) * 3.5, this.world);
                    npc.isMoving = true;
                    npc.moveTime += dt;
                }
            } else if (npc.aiState.mode === 'rest') {
                // Handled by timer check above. When timer hits 0:
                npc.aiState.mode = 'chase';
            }

            // Damage Logic (Always active if touching)
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
                
                // Allow Player to push/damage back
                if (this.player.isMoving) { // Check moving flag generically
                    let dmg = 0;
                    const meleeId = this.player.activeMelee;
                    if (meleeId === TILES.SWORD_IRON.id) dmg = 90;
                    else if (meleeId === TILES.SWORD_WOOD.id) dmg = 50;
                    else if (meleeId === 'hand') dmg = 1;

                    if (dmg > 0 && this.shootCooldown <= 0) {
                        npc.hp -= dmg;
                        this.spawnParticles(npc.x, npc.y, '#fff', 8);
                        this.spawnText(npc.x, npc.y, `HIT ${dmg}`, "#ff0");
                        this.shootCooldown = 20; 
                    }
                }
            }
        });

        // Sheep Logic (Unchanged)
        if (this.animals.length < 10 && Math.random() < 0.005) {
            const ang = Math.random() * 6.28;
            const dist = 600;
            const nx = this.player.x + Math.cos(ang)*dist;
            const ny = this.player.y + Math.sin(ang)*dist;
            const ngx = Math.floor(nx / CONFIG.TILE_SIZE);
            const ngy = Math.floor(ny / CONFIG.TILE_SIZE);
            
            const spawnPoint = {x: nx, y: ny};
            const occupied = [...this.npcs, ...this.animals].some(e => Utils.distance(e, spawnPoint) < CONFIG.TILE_SIZE);

            if (!occupied) {
                const tile = this.world.getTile(ngx, ngy);
                if (tile === TILES.GRASS.id && this.world.getTile(ngx+1, ngy) !== TILES.WATER.id) {
                    this.animals.push(new Sheep(nx, ny));
                }
            }
        }

        this.animals.forEach(s => {
            s.updateAI(dt, this.player, this.world);
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
        });
        
        this.cannons.forEach(c => {
            if (c.cooldown > 0) c.cooldown--;
            else if (c.ammo > 0) {
                let target = this.npcs.find(n => Utils.distance(c, n) < c.range);
                if (target) {
                    this.projectiles.push(new Projectile(c.x, c.y - CONFIG.TILE_SIZE, target.x, target.y, c.damage, 12, '#fff', false));
                    c.cooldown = 60;
                    this.spawnParticles(c.x, c.y - CONFIG.TILE_SIZE, '#aaa', 8);
                    if (!this.godMode) c.ammo--;
                }
            }
        });

        this.projectiles.forEach(p => {
            p.update();
            if (p.owner === 'player' || p.owner === 'enemy') { 
                const potentialTargets = [...this.npcs, ...this.animals, ...this.boats];
                potentialTargets.forEach(n => {
                    if (p.active && Utils.distance(p, n) < 16) {
                        p.active = false;
                        n.hp -= p.damage;
                        this.spawnParticles(n.x, n.y, '#f00', 6);
                        this.spawnText(n.x, n.y, Math.floor(p.damage), "#fff");
                    }
                });
            }
        });

        this.projectiles = this.projectiles.filter(p => p.active);

        const cleanup = (arr) => arr.filter(n => {
            if (n.hp <= 0) {
                const roll = Math.random();
                let dropId = TILES.GREY.id;
                let qty = 1;
                
                if (n.type === 'sheep') {
                     dropId = TILES.WOOL.id; 
                     qty = 2;
                } else {
                     if (roll < 0.10) { dropId = TILES.GOLD.id; qty = 2; } 
                     else if (roll < 0.40) { dropId = TILES.WOOD.id; qty = 5; } 
                     else if (roll < 0.70) { dropId = TILES.IRON.id; qty = 5; } 
                     else { dropId = TILES.GREY.id; qty = 8; }
                }

                this.loot.push({x: n.x, y: n.y, id: dropId, qty: qty, bob: Math.random()*100});
                this.spawnParticles(n.x, n.y, '#f00', 10);
                return false;
            }
            return true;
        });

        this.npcs = cleanup(this.npcs);
        this.animals = cleanup(this.animals);
        
        this.boats = this.boats.filter(b => {
             if (b.hp <= 0) {
                 this.loot.push({x: b.x, y: b.y, id: TILES.WOOD.id, qty: 3, bob: Math.random()*100});
                 this.loot.push({x: b.x, y: b.y, id: TILES.WOOL.id, qty: 1, bob: Math.random()*100});
                 this.spawnParticles(b.x, b.y, '#8B4513', 10);
                 return false;
             }
             return true;
        });

        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.life > 0);
        this.texts.forEach(t => { t.y += t.dy; t.life--; });
        this.texts = this.texts.filter(t => t.life > 0);
        this.loot = this.loot.filter(l => {
            if (Utils.distance(this.player, l) < 32) {
                this.player.inventory[l.id] = (this.player.inventory[l.id]||0) + l.qty;
                this.spawnText(this.player.x, this.player.y - 30, `+${l.qty} ${ID_TO_TILE[l.id].short}`, "#ff0");
                this.updateUI();
                return false;
            }
            return true;
        });

        this.dom.hp.innerText = Math.floor(this.player.hp);
        const px = Math.floor(this.player.x/CONFIG.TILE_SIZE);
        const py = Math.floor(this.player.y/CONFIG.TILE_SIZE);
        this.dom.coords.innerText = `${px}, ${py}`;
        
        const currentElev = Utils.getElevation(px, py, this.world.seed);
        const currentTileId = this.world.getTile(px, py);
        this.dom.elev.innerText = currentElev.toFixed(2);
        this.dom.biome.innerText = ID_TO_TILE[currentTileId].name;
        
        if (this.player.hp <= 0) location.reload();
        
        this.input.flush();
    }

    drawHealth(e) {
        if (e.hp >= e.maxHp) return;
        
        const w = 24, h = 4;
        const x = e.x - w/2, y = e.y - CONFIG.TILE_SIZE/2 - 8;
        this.ctx.fillStyle = '#300'; this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = '#0f0'; this.ctx.fillRect(x, y, w * (Math.max(0,e.hp)/e.maxHp), h);
    }

    draw() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        const startCol = Math.floor(this.camera.x / CONFIG.TILE_SIZE);
        const endCol = startCol + (this.canvas.width / this.zoom / CONFIG.TILE_SIZE) + 1;
        const startRow = Math.floor(this.camera.y / CONFIG.TILE_SIZE);
        const endRow = startRow + (this.canvas.height / this.zoom / CONFIG.TILE_SIZE) + 1;

        const rowBuckets = {};
        const addToBucket = (obj, type) => {
            const r = Math.floor(obj.y / CONFIG.TILE_SIZE);
            if (!rowBuckets[r]) rowBuckets[r] = [];
            rowBuckets[r].push({ ...obj, _type: type, _orig: obj });
        };

        this.npcs.forEach(n => addToBucket(n, 'npc'));
        this.animals.forEach(n => addToBucket(n, 'sheep')); 
        this.boats.forEach(n => addToBucket(n, 'boat')); 
        addToBucket(this.player, 'player');
        this.loot.forEach(l => addToBucket(l, 'loot'));

        // PASS 1: GROUND
        for (let r = startRow - 2; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const id = this.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;

                if ((!tile.solid || id === TILES.WATER.id || id === TILES.DEEP_WATER.id) && id !== TILES.TREE.id && id !== TILES.WOOD_WALL_OPEN.id) {
                    const tx = c * CONFIG.TILE_SIZE;
                    const ty = r * CONFIG.TILE_SIZE;
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
                
                if (id === TILES.WOOD_WALL_OPEN.id) {
                    const tx = c * CONFIG.TILE_SIZE;
                    const ty = r * CONFIG.TILE_SIZE;
                    this.ctx.fillStyle = TILES.GRASS.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, 6, CONFIG.TILE_SIZE);
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 6, ty, 6, CONFIG.TILE_SIZE);
                }
                
                if (id === TILES.TREE.id || id === TILES.MOUNTAIN.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     this.ctx.fillStyle = TILES.GRASS.color; 
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
            }
        }

        // PASS 2: OBJECTS
        for (let r = startRow - 2; r <= endRow; r++) { 
            for (let c = startCol; c <= endCol; c++) {
                const id = this.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;
                
                const tx = c * CONFIG.TILE_SIZE;
                const ty = r * CONFIG.TILE_SIZE;

                if (tile.solid && id !== TILES.WATER.id && id !== TILES.DEEP_WATER.id && id !== TILES.TREE.id && id !== TILES.MOUNTAIN.id && id !== TILES.STONE_BLOCK.id && ![12, 14, 15].includes(id)) {
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty, 4, CONFIG.TILE_SIZE); 
                    this.ctx.fillRect(tx, ty + CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE, 4); 
                    this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, 4); 
                    this.ctx.fillRect(tx, ty, 4, CONFIG.TILE_SIZE); 
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.strokeRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
                
                if (id === TILES.STONE_BLOCK.id) {
                    this.ctx.fillStyle = TILES.GRASS.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    const shapeR = Utils.noise(c, r, this.world.seed + 777);
                    this.ctx.fillStyle = Utils.hsl(0, 0, 55, c, r, this.world.seed, 0, 10);

                    if (shapeR < 0.33) {
                        this.ctx.fillRect(tx + 4, ty + 4, 24, 24);
                        this.ctx.fillRect(tx + 2, ty + 8, 4, 16); 
                        this.ctx.fillRect(tx + 26, ty + 8, 4, 16);
                        this.ctx.fillRect(tx + 8, ty + 2, 16, 4); 
                        this.ctx.fillRect(tx + 8, ty + 26, 16, 4); 
                        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                        this.ctx.fillRect(tx + 8, ty + 6, 8, 4);
                        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
                        this.ctx.fillRect(tx + 8, ty + 22, 16, 6);
                    } else if (shapeR < 0.66) {
                        this.ctx.fillRect(tx + 2, ty + 12, 28, 18);
                        this.ctx.fillRect(tx + 6, ty + 8, 20, 4);
                        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                        this.ctx.fillRect(tx + 6, ty + 8, 20, 2);
                        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
                        this.ctx.fillRect(tx + 22, ty + 12, 8, 18);
                    } else {
                        this.ctx.fillRect(tx + 2, ty + 14, 12, 14); 
                        this.ctx.fillRect(tx + 12, ty + 6, 18, 22); 
                        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                        this.ctx.fillRect(tx + 14, ty + 6, 10, 4);
                        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
                        this.ctx.fillRect(tx + 8, ty + 20, 6, 8);
                    }
                }

                if (tile.hp) {
                    const dmg = this.world.getTileDamage(c, r);
                    if (dmg > 0) {
                        const max = tile.hp;
                        const w = 24; const h = 4;
                        const bx = tx + 4; const by = ty - 10;
                        this.ctx.fillStyle = '#300';
                        this.ctx.fillRect(bx, by, w, h);
                        this.ctx.fillStyle = '#fff';
                        this.ctx.fillRect(bx, by, w * ((max - dmg) / max), h);
                    }
                }

                if (id === TILES.MOUNTAIN.id) {
                    this.ctx.fillStyle = Utils.hsl(0, 0, 60, c, r, this.world.seed, 0, 15);
                    this.ctx.fillRect(tx, ty - 8, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE + 8); 
                    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty - 8, 4, CONFIG.TILE_SIZE + 8);
                    this.ctx.fillStyle = '#eee'; 
                    this.ctx.fillRect(tx + 4, ty - 8, CONFIG.TILE_SIZE - 8, 8);
                }

                if (id === TILES.TREE.id) {
                    let isOccluding = false;
                    for (let checkR = r - 2; checkR < r; checkR++) {
                        if (rowBuckets[checkR] && rowBuckets[checkR].some(e => Math.floor(e.x / CONFIG.TILE_SIZE) === c)) isOccluding = true;
                    }
                    this.ctx.globalAlpha = isOccluding ? 0.4 : 1.0;
                    this.ctx.fillStyle = Utils.hsl(25, 57, 23, c, r, this.world.seed + 100, 5, 5);
                    this.ctx.fillRect(tx + 12, ty - 8, 8, 24); 
                    this.ctx.fillStyle = Utils.hsl(120, 61, 34, c, r, this.world.seed, 15, 10);
                    const shapeR = Utils.noise(c, r, this.world.seed + 555);
                    
                    if (shapeR < 0.33) {
                        this.ctx.fillRect(tx, ty - 24, 32, 24);
                        this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
                        this.ctx.fillRect(tx + 4, ty - 20, 24, 16);
                    } else if (shapeR < 0.66) {
                        this.ctx.fillRect(tx + 2, ty - 16, 28, 16); 
                        this.ctx.fillRect(tx + 6, ty - 30, 20, 14); 
                        this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
                        this.ctx.fillRect(tx + 8, ty - 26, 16, 22);
                    } else {
                        this.ctx.fillRect(tx - 2, ty - 20, 36, 20); 
                        this.ctx.fillRect(tx + 6, ty - 26, 20, 6); 
                        this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
                        this.ctx.fillRect(tx + 4, ty - 16, 24, 12);
                    }
                    this.ctx.globalAlpha = 1.0;
                }

                if ([12, 14, 15].includes(id)) {
                    let isOccluding = false;
                    for (let checkR = r - 2; checkR < r; checkR++) {
                        if (rowBuckets[checkR]) {
                            if (rowBuckets[checkR].some(e => Math.floor(e.x / CONFIG.TILE_SIZE) === c)) isOccluding = true;
                        }
                    }
                    this.ctx.globalAlpha = isOccluding ? 0.4 : 1.0;
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty, 4, CONFIG.TILE_SIZE); 
                    this.ctx.fillRect(tx, ty + CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE, 4); 
                    this.ctx.strokeRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

                    this.ctx.fillStyle = (id===14 ? '#444' : id===15 ? '#ffd700' : '#777');
                    this.ctx.fillRect(tx, ty - CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.strokeRect(tx, ty - CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    
                    this.ctx.fillStyle = '#5C3317';
                    this.ctx.beginPath();
                    this.ctx.moveTo(tx, ty - CONFIG.TILE_SIZE);
                    this.ctx.lineTo(tx + CONFIG.TILE_SIZE, ty - CONFIG.TILE_SIZE);
                    this.ctx.lineTo(tx + CONFIG.TILE_SIZE/2, ty - CONFIG.TILE_SIZE*2);
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.stroke();

                    const cannon = this.cannons.find(can => can.key === `${c},${r}`);
                    if (cannon) {
                        this.ctx.fillStyle = cannon.ammo > 0 ? '#0ff' : '#f00';
                        this.ctx.font = '10px monospace';
                        this.ctx.fillText(cannon.ammo, tx + 10, ty + 20);
                    }
                    this.ctx.globalAlpha = 1.0;
                }
            }

            if (rowBuckets[r]) {
                rowBuckets[r].forEach(obj => {
                    // --- RENDER BOAT (Unoccupied) ---
                    if (obj._type === 'boat') {
                        this.ctx.fillStyle = '#8B4513';
                        // Boat shape
                        this.ctx.fillRect(obj.x - 12, obj.y - 6, 24, 12);
                        this.ctx.fillStyle = '#5C3317';
                        this.ctx.fillRect(obj.x - 8, obj.y - 4, 16, 8); // Inner part
                        
                        // Mast (simple)
                        this.ctx.fillStyle = '#333';
                        this.ctx.fillRect(obj.x - 2, obj.y - 16, 4, 16);
                        
                        // Sail
                        this.ctx.fillStyle = obj._orig.owner === 'enemy' ? '#000' : '#fff'; // Flag logic
                        this.ctx.beginPath();
                        this.ctx.moveTo(obj.x, obj.y - 16);
                        this.ctx.lineTo(obj.x + 12, obj.y - 10);
                        this.ctx.lineTo(obj.x, obj.y - 4);
                        this.ctx.fill();
                        
                        this.drawHealth(obj._orig); // Show Boat Health
                    } else if (obj._type === 'loot') {
                        const bob = Math.sin((Date.now()/200) + obj.bob) * 3;
                        this.ctx.fillStyle = ID_TO_TILE[obj.id].color;
                        this.ctx.fillRect(obj.x - 6, obj.y - 6 + bob, 12, 12);
                    } else if (obj._type === 'sheep') {
                        // [Existing Sheep Render logic]
                        const isMoving = obj._orig.moveTimer > 0;
                        const tick = isMoving ? (Date.now() * 0.015) : (Date.now() * 0.005);
                        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 2 : 0;
                        const breathe = !isMoving ? Math.sin(tick) * 0.5 : 0;
                        
                        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
                        this.ctx.beginPath();
                        this.ctx.ellipse(obj.x, obj.y + 6, 8, 3, 0, 0, Math.PI * 2);
                        this.ctx.fill();

                        const bodyY = obj.y - 10 - bounceY - breathe;

                        const legOffset1 = isMoving ? Math.sin(tick)*3 : 0;
                        const legOffset2 = isMoving ? Math.sin(tick+Math.PI)*3 : 0;
                        this.ctx.fillStyle = '#111';
                        this.ctx.fillRect(obj.x - 6 + legOffset1, obj.y + 2, 3, 6);
                        this.ctx.fillRect(obj.x + 3 + legOffset2, obj.y + 2, 3, 6);

                        this.ctx.fillStyle = obj.fed ? '#ffcccc' : (obj.hasWool ? '#eeeeee' : '#aaaaaa');
                        this.ctx.fillRect(obj.x - 10, bodyY, 20, 14);
                        
                        this.ctx.fillStyle = '#111';
                        this.ctx.fillRect(obj.x + 8, bodyY - 2, 8, 8);
                        
                        this.drawHealth(obj._orig);
                    } else {
                        // PLAYER/NPC
                        const isPlayer = obj._type === 'player';
                        const inBoat = isPlayer && obj._orig.inBoat; 

                        if (inBoat) {
                            // [NEW] Rotate Context for Boat
                            this.ctx.save();
                            this.ctx.translate(obj.x, obj.y);
                            this.ctx.rotate(obj._orig.boatStats.heading);
                            this.ctx.translate(-obj.x, -obj.y);

                            this.ctx.fillStyle = '#8B4513';
                            // Draw centered on 0,0 relative to translate
                            // hull
                            this.ctx.fillRect(obj.x - 12, obj.y - 6, 24, 12);
                            
                            // Sail
                            this.ctx.fillStyle = '#fff'; 
                            this.ctx.beginPath();
                            this.ctx.moveTo(obj.x + 4, obj.y - 16);
                            this.ctx.lineTo(obj.x + 16, obj.y); // Pointing back/side
                            this.ctx.lineTo(obj.x + 4, obj.y + 4);
                            this.ctx.fill();

                            // Mast
                            this.ctx.fillStyle = '#333';
                            this.ctx.fillRect(obj.x + 2, obj.y - 4, 4, 4); 

                            // Player Head (Visual reference for center)
                            this.ctx.fillStyle = '#3498db';
                            this.ctx.fillRect(obj.x - 4, obj.y - 4, 8, 8);

                            this.ctx.restore(); // Undo rotation
                            
                            this.drawHealth(obj._orig);
                            return; // Skip standard player render
                        }

                        const colorShirt = isPlayer ? '#3498db' : '#993333';
                        const colorPants = isPlayer ? '#8B4513' : '#654321';
                        const colorSkin = isPlayer ? '#ffcc99' : '#e0b090';
                        const colorHelmet = '#8B6F43';
                        const colorBoots = '#333333';
                        
                        const isMoving = obj._orig.isMoving; 
                        
                        const tick = isMoving ? (obj._orig.moveTime * 0.015) : (Date.now() * 0.005);
                        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 1.5 : Math.sin(tick) * 0.5;
                        
                        const stride = 4;
                        const leg1Offset = isMoving ? Math.sin(tick) * stride : 0;
                        const leg2Offset = isMoving ? Math.sin(tick + Math.PI) * stride : 0;
                        
                        const armSwing = 5;
                        const arm1Offset = isMoving ? Math.sin(tick + Math.PI) * armSwing : 0;
                        const arm2Offset = isMoving ? Math.sin(tick) * armSwing : 0;

                        const BODY_W = 16;
                        const BODY_X = obj.x - BODY_W / 2;
                        
                        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
                        this.ctx.beginPath();
                        this.ctx.ellipse(obj.x, obj.y + 12, 6, 3, 0, 0, Math.PI * 2);
                        this.ctx.fill();

                        // FEET
                        this.ctx.fillStyle = colorBoots;
                        this.ctx.fillRect(BODY_X + 2, obj.y + 10 + leg1Offset, 4, 4); 
                        this.ctx.fillRect(BODY_X + BODY_W - 6, obj.y + 10 + leg2Offset, 4, 4); 

                        // If in boat, shift body up slightly
                        const torsoY = obj.y - 8 - bounceY;

                        // LEGS
                        this.ctx.fillStyle = colorPants;
                        this.ctx.fillRect(BODY_X, obj.y + 4 - bounceY, BODY_W, 6); 

                        this.ctx.fillStyle = colorShirt;
                        this.ctx.fillRect(BODY_X, torsoY, BODY_W, 15); 
                        
                        this.ctx.fillStyle = colorSkin;
                        this.ctx.fillRect(obj.x - 12, torsoY + 4 + arm1Offset, 4, 4); 
                        this.ctx.fillRect(obj.x + 8, torsoY + 4 + arm2Offset, 4, 4); 

                        const HEAD_SIZE = 12;
                        const HEAD_Y = torsoY - 14;
                        this.ctx.fillStyle = colorSkin;
                        this.ctx.fillRect(obj.x - HEAD_SIZE/2, HEAD_Y, HEAD_SIZE, HEAD_SIZE); 

                        this.ctx.fillStyle = colorHelmet;
                        this.ctx.fillRect(obj.x - (HEAD_SIZE/2 + 1), HEAD_Y - 4, HEAD_SIZE + 2, 6); 

                        // Draw Weapon in Hand ONLY IF SWORD
                        const heldId = this.player.activeMelee;
                        if ((heldId === TILES.SWORD_WOOD.id || heldId === TILES.SWORD_IRON.id)) {
                            // Simple rendering of a sword
                            this.ctx.strokeStyle = heldId === TILES.SWORD_IRON.id ? '#aaa' : '#5C3317'; // Iron vs Wood Color
                            this.ctx.lineWidth = 3;
                            
                            // Position relative to hand
                            const handX = obj.x + 10; 
                            const handY = torsoY + 6 + arm2Offset;
                            
                            this.ctx.beginPath();
                            this.ctx.moveTo(handX, handY);
                            this.ctx.lineTo(handX + 10, handY - 10); // Pointing up/out
                            this.ctx.stroke();
                        }

                        const dir = isPlayer ? obj._orig.direction : { x: 0, y: 1 };
                        let eyeX1 = obj.x - 5;
                        let eyeX2 = obj.x + 2;
                        
                        if (dir.x > 0) { eyeX1 += 2; eyeX2 += 2; }
                        if (dir.x < 0) { eyeX1 -= 2; eyeX2 -= 2; }
                        
                        if (dir.y >= 0) { 
                            this.ctx.fillStyle = '#000000';
                            this.ctx.fillRect(eyeX1, HEAD_Y + 4, 3, 3);
                            this.ctx.fillRect(eyeX2, HEAD_Y + 4, 3, 3);
                        }

                        this.drawHealth(obj._orig); 
                    }
                });
            }
        }

        this.ctx.fillStyle = '#fff';
        this.projectiles.forEach(p => {
            if(p.draw) p.draw(this.ctx, 0, 0); // Use projectile's draw method
        });

        this.particles.forEach(p => p.draw(this.ctx, 0, 0)); 

        if (this.activeBlueprint) {
            const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
            const my = (this.input.mouse.y / this.zoom) + this.camera.y;
            const gx = Math.floor(mx / CONFIG.TILE_SIZE);
            const gy = Math.floor(my / CONFIG.TILE_SIZE);
            
            this.ctx.globalAlpha = 0.5;
            this.activeBlueprint.structure.forEach(part => {
                const tile = ID_TO_TILE[part.id];
                this.ctx.fillStyle = tile.color;
                this.ctx.fillRect((gx + part.x) * CONFIG.TILE_SIZE, (gy + part.y) * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            });
            this.ctx.globalAlpha = 1.0;
            
            this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, CONFIG.BUILD_RANGE, 0, 6.28);
            this.ctx.stroke();
        }
        
        this.ctx.restore(); // Undo Camera

        // [NEW] Draw Wind Particles in Screen Space (After restore)
        this.windParticles.forEach(p => p.draw(this.ctx, this.world.wind.angle));

        this.ctx.font = "bold 14px monospace";
        // To draw texts in world space, we must re-apply camera or refactor text system.
        // For simplicity, let's re-apply camera just for texts (as they were in world space)
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        this.texts.forEach(t => {
            this.ctx.fillStyle = t.col;
            this.ctx.fillText(t.txt, t.x, t.y);
        });
        this.ctx.restore();
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.update(dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    }
}ds