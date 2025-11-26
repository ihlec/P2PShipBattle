import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS } from './config.js';
import Utils from './utils.js';
import InputHandler from './input.js';
import World from './world.js';
import { Entity, Particle } from './entities.js';

export default class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Pass 'this' so InputHandler can call game methods
        this.input = new InputHandler(this);
        this.world = new World();
        this.player = new Entity(0, 0, 'player');
        
        // --- MODIFIED: ADD ANIMATION STATE TRACKING ---
        this.player.isMoving = false;
        this.player.moveTime = 0;
        // ----------------------------------------------
        
        // --- MOVED SPAWN LOGIC HERE ---
        const spawn = this.findSafeSpawn();
        this.player.x = spawn.x; this.player.y = spawn.y;

        this.npcs = [];
        this.loot = [];
        this.projectiles = [];
        this.particles = [];
        this.texts = [];
        this.cannons = []; 
        
        this.camera = { x: 0, y: 0 };
        this.zoom = 1;
        this.lastTime = 0;
        this.regenTimer = 0;
        this.godMode = false;
        this.activeBlueprint = null;
        
        this.dom = {
            hp: document.getElementById('hp'),
            coords: document.getElementById('coords'),
            seed: document.getElementById('seed-disp'),
            invBar: document.getElementById('inventory-bar'),
            bpMenu: document.getElementById('blueprint-menu'),
            activeBp: document.getElementById('active-bp-display'),
            bpName: document.getElementById('current-bp-name'),
            elev: document.getElementById('elev-disp'),
            biome: document.getElementById('biome-disp') 
        };
        
        this.dom.seed.innerText = this.world.seed;
        
        // Setup Hammer Button
        document.getElementById('hammer-btn').onclick = () => this.toggleBlueprints();

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

    toggleBlueprints() {
        const menu = document.getElementById('blueprint-menu');
        menu.style.display = menu.style.display === 'grid' ? 'none' : 'grid';
    }

    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

    showMessage(text) {
        const msg = document.getElementById('messages');
        msg.innerHTML = text;
        msg.style.opacity = 1;
        setTimeout(() => msg.style.opacity = 0, 2000);
    }

    initUI() {
        this.dom.invBar.innerHTML = ''; 
        const usable = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS];
        usable.forEach((t) => {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.innerHTML = `<div class="slot-color" style="background:${t.color}"></div><div class="short-name">${t.short}</div><div class="qty" id="qty-${t.id}">0</div>`;
            slot.onclick = () => {
                this.player.selectedTile = t.id;
                this.activeBlueprint = null;
                this.updateUI();
            };
            this.dom.invBar.appendChild(slot);
        });
        
        this.dom.bpMenu.innerHTML = '';
        BLUEPRINTS.forEach((bp, index) => {
            const div = document.createElement('div');
            div.className = 'bp-item';
            let costStr = "Free";
            if (bp.cost) {
                costStr = Object.entries(bp.cost)
                    .map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`)
                    .join(', ');
            }
            div.innerHTML = `<div class="bp-name">${bp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => { 
                if (div.classList.contains('disabled')) return;
                this.activeBlueprint = bp; 
                this.toggleBlueprints(); 
                this.updateUI(); 
            };
            this.dom.bpMenu.appendChild(div);
        });
        this.updateUI();
    }

    updateUI() {
        const slots = document.querySelectorAll('.slot');
        const usable = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS];
        slots.forEach((s, i) => {
            const id = usable[i].id;
            s.classList.toggle('active', !this.activeBlueprint && id === this.player.selectedTile);
            const qtyEl = document.getElementById(`qty-${id}`);
            if(qtyEl) qtyEl.innerText = this.player.inventory[id] || 0;
        });

        const bpItems = this.dom.bpMenu.children;
        BLUEPRINTS.forEach((bp, i) => {
            const div = bpItems[i];
            let canAfford = true;
            if (bp.cost && !this.godMode) {
                for (const [id, qty] of Object.entries(bp.cost)) {
                    if ((this.player.inventory[id] || 0) < qty) {
                        canAfford = false;
                        break;
                    }
                }
            }
            if (canAfford) div.classList.remove('disabled');
            else div.classList.add('disabled');
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
            
            // --- MODIFIED SPAWN LOGIC ---
            // Only check if the tile is SAND.
            // We removed the "radius check for water" because Sand is always next to water.
            return t === TILES.SAND.id;
        };

        // Attempt 1: Random Sampling (Fast)
        for (let r = 0; r < 2000; r++) { // Increased attempts slightly since Sand is rare
            const x = (Math.random() - 0.5) * 5000; 
            const y = (Math.random() - 0.5) * 5000;
            const gx = Math.floor(x/CONFIG.TILE_SIZE);
            const gy = Math.floor(y/CONFIG.TILE_SIZE);
            if (isSafe(gx, gy)) return {x, y};
        }
        
        // Attempt 2: Spiral Search Outward (Guaranteed)
        let r = 0;
        while (r < 1000) { 
            const points = [{x: r, y: 0}, {x: -r, y: 0}, {x: 0, y: r}, {x: 0, y: -r}, {x: r, y: r}, {x: -r, y: -r}, {x: r, y: -r}, {x: -r, y: r}];
            for (let p of points) {
                if (isSafe(p.x, p.y)) return {x: p.x*CONFIG.TILE_SIZE, y: p.y*CONFIG.TILE_SIZE};
            }
            r++;
        }
        return {x: 0, y: 0}; 
    }

    handleInteraction() {
        if (!this.input.mouse.clickedLeft && !this.input.mouse.clickedRight) return;

        const mx = (this.input.mouse.x / this.zoom) + this.camera.x;
        const my = (this.input.mouse.y / this.zoom) + this.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);

        if (Utils.distance(this.player, {x: mx, y: my}) > CONFIG.BUILD_RANGE) return;

        // Helper function to check if a grid tile is occupied by an entity
        const isOccupied = (tx, ty) => {
            const tileCenter = { x: tx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: ty * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 };
            const allEntities = [this.player, ...this.npcs];
            return allEntities.some(e => Utils.distance(e, tileCenter) < CONFIG.TILE_SIZE/1.5);
        };

        if (this.input.mouse.clickedLeft) {
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
                    if (!canAfford(id, qty)) {
                        affordable = false;
                        break;
                    }
                }
                
                // --- OCCUPANCY CHECK FOR BLUEPRINT ---
                let occupied = false;
                if (affordable) {
                    for (const part of this.activeBlueprint.structure) {
                        if (isOccupied(gx + part.x, gy + part.y)) {
                            occupied = true;
                            break;
                        }
                    }
                }

                if (occupied) {
                    this.spawnText(mx * this.zoom, my * this.zoom, "CANNOT BUILD: OCCUPIED", "#f00");
                    return;
                }
                // ------------------------------------

                if (affordable) {
                    const isBridgeBp = this.activeBlueprint.special === 'bridge' || this.activeBlueprint.requiresWater;

                    if (this.activeBlueprint.special === 'bridge') {
                        const targetId = this.world.getTile(gx, gy);
                        if (targetId !== TILES.WATER.id && targetId !== TILES.DEEP_WATER.id && targetId !== TILES.WOOD_RAIL.id) {
                             this.spawnText(mx * this.zoom, my * this.zoom, "MUST BUILD ON WATER/RAIL", "#f00");
                             return;
                        }
                    } else if (this.activeBlueprint.requiresWater) {
                        const targetId = this.world.getTile(gx, gy);
                        if (targetId !== TILES.WATER.id && targetId !== TILES.DEEP_WATER.id) {
                             this.spawnText(mx * this.zoom, my * this.zoom, "MUST BUILD ON WATER", "#f00");
                             return;
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
                // --- OCCUPANCY CHECK FOR SINGLE TILE ---
                if (isOccupied(gx, gy)) {
                    this.spawnText(mx * this.zoom, my * this.zoom, "CANNOT BUILD: OCCUPIED", "#f00");
                    return;
                }
                // ---------------------------------------
                
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
            if (this.activeBlueprint) {
                this.activeBlueprint = null;
                this.updateUI();
            } else {
                let tx = gx, ty = gy;
                let tileId = this.world.getTile(gx, gy);
                
                if (tileId === TILES.WOOD_RAIL.id) {
                     this.spawnText(mx * this.zoom, my * this.zoom, "BREAK ROAD TO DEMOLISH", "#f00");
                     return;
                }
                
                if (!ID_TO_TILE[tileId].solid && tileId !== TILES.TREE.id) {
                    let below = this.world.getTile(gx, gy + 1);
                    if ([12,14,15].includes(below)) { ty = gy + 1; tileId = below; }
                    else {
                        let below2 = this.world.getTile(gx, gy + 2);
                        if ([12,14,15].includes(below2)) { ty = gy + 2; tileId = below2; }
                    }
                }

                if (tileId !== TILES.GRASS.id && tileId !== TILES.WATER.id && tileId !== TILES.DEEP_WATER.id && tileId !== TILES.SAND.id) {
                    if (tileId === TILES.TREE.id) {
                        this.world.setTile(tx, ty, TILES.GRASS.id);
                        this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 8);
                        this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.WOOD.id, qty: 3, bob: Math.random()*100});
                        
                        if (Math.random() < 0.1) {
                            this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREENS.id, qty: 1, bob: Math.random()*100});
                        }
                        this.updateUI();
                        return;
                    }

                    if (tileId === TILES.MOUNTAIN.id || tileId === TILES.STONE_BLOCK.id) {
                        const dmg = 20; 
                        const totalDmg = this.world.hitTile(tx, ty, dmg);
                        const maxHp = 100;
                        
                        this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 3);
                        this.spawnText(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE, `-${dmg}`, '#fff');

                        if (totalDmg >= maxHp) {
                            this.world.setTile(tx, ty, TILES.GRASS.id); 
                            this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#555', 10);
                            
                            let stoneQty = 3;
                            if (Math.random() < 0.1) this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.IRON.id, qty: 2, bob: Math.random()*100});
                            if (Math.random() < 0.01) this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GOLD.id, qty: 1, bob: Math.random()*100});
                            this.loot.push({x: tx*CONFIG.TILE_SIZE + 16, y: ty*CONFIG.TILE_SIZE + 16, id: TILES.GREY.id, qty: stoneQty, bob: Math.random()*100});
                        }
                        return; 
                    }

                    const tilesToRemove = [{x: tx, y: ty}];
                    if (tileId === TILES.GREY.id) {
                        const neighbors = [{x:tx+1, y:ty}, {x:tx-1, y:ty}, {x:tx, y:ty+1}, {x:tx, y:ty-1}];
                        neighbors.forEach(n => {
                            if (this.world.getTile(n.x, n.y) === TILES.WOOD_RAIL.id) {
                                const railNeighbors = [{x:n.x+1, y:n.y}, {x:n.x-1, y:n.y}, {x:n.x, y:n.y+1}, {x:n.x, y:n.y-1}];
                                const support = railNeighbors.some(rn => (rn.x !== tx || rn.y !== ty) && this.world.getTile(rn.x, rn.y) === TILES.GREY.id);
                                if (!support) tilesToRemove.push({x: n.x, y: n.y});
                            }
                        });
                    }

                    const isOccupiedOnBreak = tilesToRemove.some(t => isOccupied(t.x, t.y)); // Reuse isOccupied logic

                    if (isOccupiedOnBreak) {
                        this.spawnText(mx * this.zoom, my * this.zoom, "CANNOT BREAK: OCCUPIED", "#f00");
                        return;
                    }

                    const biome = Utils.getBiome(tx, ty, this.world.seed);
                    let restoreId = TILES.GRASS.id;
                    if (biome === TILES.WATER.id) restoreId = TILES.WATER.id;
                    if (biome === TILES.DEEP_WATER.id) restoreId = TILES.DEEP_WATER.id;
                    if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;

                    this.world.setTile(tx, ty, restoreId);
                    
                    if (!this.godMode) {
                        if ([12,14,15].includes(tileId)) {
                             this.player.inventory[TILES.GREY.id] += 4;
                             this.player.inventory[TILES.WOOD.id] += 1;
                        } else {
                             this.player.inventory[tileId]++;
                        }
                    }
                    this.spawnParticles(tx * CONFIG.TILE_SIZE + 16, ty * CONFIG.TILE_SIZE + 16, '#777', 5);
                    
                    tilesToRemove.forEach(t => {
                        if (t.x === tx && t.y === ty) return;
                        const rBiome = Utils.getBiome(t.x, t.y, this.world.seed);
                        const rRestore = (rBiome === TILES.WATER.id || rBiome === TILES.DEEP_WATER.id) ? rBiome : TILES.GRASS.id;
                        this.world.setTile(t.x, t.y, rRestore);
                        this.spawnParticles(t.x * CONFIG.TILE_SIZE + 16, t.y * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 4);
                        if (!this.godMode) this.player.inventory[TILES.WOOD.id] += 1;
                    });
                    this.recalcCannons();
                    this.updateUI();
                }
            }
        }
    }

    tryBuild(gx, gy, id, allowRailOverwrite = false, isBridge = false) {
        // NOTE: The entity occupancy check is now handled in handleInteraction before calling tryBuild.
        
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

        this.regenTimer += dt;
        if (this.regenTimer > 2000 && this.player.hp < 100) {
            this.player.hp = Math.min(100, this.player.hp + 5);
            this.spawnText(this.player.x, this.player.y - 20, "+5 HP", "#0f0");
            this.regenTimer = 0;
        }

        let dx = 0, dy = 0;
        if(this.input.keys['w'] || this.input.keys['arrowup']) dy = -1;
        if(this.input.keys['s'] || this.input.keys['arrowdown']) dy = 1;
        if(this.input.keys['a'] || this.input.keys['arrowleft']) dx = -1;
        if(this.input.keys['d'] || this.input.keys['arrowright']) dx = 1;
        
        if (dx || dy) {
            // --- MODIFIED: TRACK MOVEMENT STATE AND TIME ---
            this.player.isMoving = true; 
            this.player.moveTime += dt;  
            // ----------------------------------------------
            const len = Math.sqrt(dx*dx + dy*dy);
            this.player.move((dx/len)*this.player.speed, (dy/len)*this.player.speed, this.world);
        } else {
            // --- MODIFIED: RESET MOVEMENT STATE ---
            this.player.isMoving = false;
            // --------------------------------------
        }

        const viewW = this.canvas.width / this.zoom;
        const viewH = this.canvas.height / this.zoom;
        this.camera.x = this.player.x - viewW/2;
        this.camera.y = this.player.y - viewH/2;

        this.handleInteraction();

        if (this.npcs.length < CONFIG.MAX_NPCS && Math.random() < CONFIG.NPC_SPAWN_RATE) {
            const ang = Math.random() * 6.28;
            const dist = 600;
            const nx = this.player.x + Math.cos(ang)*dist;
            const ny = this.player.y + Math.sin(ang)*dist;
            const ngx = Math.floor(nx / CONFIG.TILE_SIZE);
            const ngy = Math.floor(ny / CONFIG.TILE_SIZE);
            const tile = this.world.getTile(ngx, ngy);
            const elevation = Utils.getElevation(ngx, ngy, this.world.seed);

            if (elevation < 0.35 && tile !== TILES.WATER.id && tile !== TILES.DEEP_WATER.id && !ID_TO_TILE[tile].solid) {
                this.npcs.push(new Entity(nx, ny, 'npc'));
            }
        }

        this.npcs.forEach(npc => {
            const ang = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
            npc.move(Math.cos(ang)*2, Math.sin(ang)*2, this.world);
            
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
                if (dx||dy) {
                    npc.move(dx * 20, dy * 20, this.world); 
                    npc.hp -= 20;
                    this.spawnParticles(npc.x, npc.y, '#f00', 5);
                    this.spawnText(npc.x, npc.y, "20", "#fff");
                }
            }
        });
        
        this.cannons.forEach(c => {
            if (c.cooldown > 0) c.cooldown--;
            else if (c.ammo > 0) {
                let target = this.npcs.find(n => Utils.distance(c, n) < c.range);
                if (target) {
                    this.projectiles.push({x: c.x, y: c.y - CONFIG.TILE_SIZE, tx: target.x, ty: target.y, dmg: c.damage, active: true});
                    c.cooldown = 60;
                    this.spawnParticles(c.x, c.y - CONFIG.TILE_SIZE, '#aaa', 8);
                    if (!this.godMode) c.ammo--;
                }
            }
        });

        this.projectiles.forEach(p => {
            const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
            p.x += Math.cos(ang) * 12; p.y += Math.sin(ang) * 12;
            this.npcs.forEach(n => {
                if (Utils.distance(p, n) < 16) {
                    p.active = false;
                    n.hp -= p.dmg;
                    this.spawnParticles(n.x, n.y, '#f00', 6);
                    this.spawnText(n.x, n.y, Math.floor(p.dmg), "#fff");
                }
            });
            if (Utils.distance(p, {x:p.tx, y:p.ty}) < 10) p.active = false;
        });

        this.npcs = this.npcs.filter(n => {
            if (n.hp <= 0) {
                const roll = Math.random();
                let dropId = TILES.GREY.id;
                let qty = 5;
                if (roll < 0.10) { dropId = TILES.GOLD.id; qty = 2; } 
                else if (roll < 0.40) { dropId = TILES.WOOD.id; qty = 5; } 
                else if (roll < 0.70) { dropId = TILES.IRON.id; qty = 5; } 
                else { dropId = TILES.GREY.id; qty = 8; }

                this.loot.push({x: n.x, y: n.y, id: dropId, qty: qty, bob: Math.random()*100});
                this.spawnParticles(n.x, n.y, '#f00', 10);
                return false;
            }
            return true;
        });
        this.projectiles = this.projectiles.filter(p => p.active);
        
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

        // DEBUG DISPLAY
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
        const w = 24, h = 4;
        const x = e.x - w/2, y = e.y - CONFIG.TILE_SIZE/2 - 8;
        this.ctx.fillStyle = '#300'; this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = '#0f0'; this.ctx.fillRect(x, y, w * (Math.max(0,e.hp)/100), h);
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
        addToBucket(this.player, 'player');
        this.loot.forEach(l => addToBucket(l, 'loot'));

        // PASS 1: GROUND
        for (let r = startRow - 2; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const id = this.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;

                if ((!tile.solid || id === TILES.WATER.id || id === TILES.DEEP_WATER.id) && id !== TILES.TREE.id) {
                    const tx = c * CONFIG.TILE_SIZE;
                    const ty = r * CONFIG.TILE_SIZE;
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
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

                if (id === TILES.MOUNTAIN.id || id === TILES.STONE_BLOCK.id) {
                    const dmg = this.world.getTileDamage(c, r);
                    if (dmg > 0) {
                        const max = 100;
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
                    if (obj._type === 'loot') {
                        const bob = Math.sin((Date.now()/200) + obj.bob) * 3;
                        this.ctx.fillStyle = ID_TO_TILE[obj.id].color;
                        this.ctx.fillRect(obj.x - 6, obj.y - 6 + bob, 12, 12);
                    } else {
                        const isPlayer = obj._type === 'player';
                        const colorShirt = isPlayer ? '#3498db' : '#993333';
                        const colorPants = isPlayer ? '#8B4513' : '#654321';
                        const colorSkin = isPlayer ? '#ffcc99' : '#e0b090';
                        const colorHelmet = '#8B6F43';
                        const colorBoots = '#333333';

                        // --- IMPROVED WIGGLE LOGIC: State-driven sine wave ---
                        const MOVE_CYCLE_SPEED = 0.006;
                        const MAX_WIGGLE = 3;
                        
                        let footShift1 = 0;
                        let footShift2 = 0;

                        if (isPlayer && obj._orig.isMoving) {
                            const phase = (obj._orig.moveTime * MOVE_CYCLE_SPEED) % (2 * Math.PI);
                            footShift1 = Math.sin(phase) * MAX_WIGGLE; 
                            footShift2 = Math.sin(phase + Math.PI) * MAX_WIGGLE;
                        }
                        
                        // Hand shift logic
                        let handShift = 0;
                        const dir = isPlayer ? obj._orig.direction : { x: 0, y: 1 };
                        const moving = isPlayer && obj._orig.isMoving;
                        if (moving && Math.abs(dir.x) > Math.abs(dir.y)) handShift = Math.sign(dir.x) * 4;
                        
                        // --- PLAYER DIMENSIONS ---
                        const BODY_W = 16;
                        const BODY_X = obj.x - BODY_W / 2;
                        const HEAD_SIZE = 12;
                        const HEAD_Y = obj.y - 22;
                        const HAND_LEFT_X = obj.x - 10;
                        const HAND_RIGHT_X = obj.x + 6;
                        // -------------------------

                        // 1. FEET/BOOTS
                        this.ctx.fillStyle = colorBoots;
                        this.ctx.fillRect(BODY_X + footShift1, obj.y + 10, 4, 4); 
                        this.ctx.fillRect(BODY_X + BODY_W - 4 + footShift2, obj.y + 10, 4, 4); 

                        // 2. LEGS (Pants)
                        this.ctx.fillStyle = colorPants;
                        this.ctx.fillRect(BODY_X, obj.y + 4, BODY_W, 6); 

                        // 3. BODY (Shirt/Tunic)
                        this.ctx.fillStyle = colorShirt;
                        this.ctx.fillRect(BODY_X, obj.y - 8, BODY_W, 15); 
                        
                        // 4. HANDS/ARMS
                        this.ctx.fillStyle = colorSkin;
                        
                        if (handShift > 0) {
                            this.ctx.fillRect(HAND_LEFT_X + handShift, obj.y - 4, 4, 4); 
                            this.ctx.fillRect(HAND_RIGHT_X, obj.y - 4, 4, 4);           
                        } else if (handShift < 0) {
                            this.ctx.fillRect(HAND_LEFT_X, obj.y - 4, 4, 4);          
                            this.ctx.fillRect(HAND_RIGHT_X + handShift, obj.y - 4, 4, 4); 
                        } else {
                            this.ctx.fillRect(HAND_LEFT_X, obj.y - 4, 4, 4); 
                            this.ctx.fillRect(HAND_RIGHT_X, obj.y - 4, 4, 4);  
                        }

                        // 5. HEAD 
                        this.ctx.fillStyle = colorSkin;
                        this.ctx.fillRect(obj.x - HEAD_SIZE/2, HEAD_Y, HEAD_SIZE, HEAD_SIZE); 

                        // 6. HELMET/HAT
                        const HELMET_Y = HEAD_Y - 4;
                        this.ctx.fillStyle = colorHelmet;
                        this.ctx.fillRect(obj.x - (HEAD_SIZE/2 + 1), HELMET_Y, HEAD_SIZE + 2, 6); 

                        // 7. EYES (Directional Logic)
                        const EYE_SIZE = 3;
                        const EYE_Y = HEAD_Y + 3; 
                        let eyeX1 = obj.x - 5;
                        let eyeX2 = obj.x + 2;
                        let eyeDrawnSize = EYE_SIZE;

                        // Check for movement (or stationary) before determining look direction
                        if (!moving || Math.abs(dir.y) >= Math.abs(dir.x)) {
                            // Moving Up/Down or Stationary (Y is dominant/static)
                            if (dir.y < 0 && moving) { // Upwards (North): Hide eyes
                                eyeDrawnSize = 0;
                            } else { // Downwards (South) or Stationary
                                eyeDrawnSize = EYE_SIZE;
                            }
                        } else if (Math.abs(dir.x) > Math.abs(dir.y)) {
                            // Moving Left or Right (X is dominant)
                            if (dir.x < 0) { // Left (West): Eyes shift to left side of face
                                eyeX1 = obj.x - 5; 
                                eyeX2 = obj.x - 2; 
                            } else { // Right (East): Eyes shift to right side of face
                                eyeX1 = obj.x + 2; 
                                eyeX2 = obj.x - 1; 
                            }
                        }
                        
                        if (eyeDrawnSize > 0) {
                            this.ctx.fillStyle = '#000000';
                            this.ctx.fillRect(eyeX1, EYE_Y, eyeDrawnSize, eyeDrawnSize);
                            this.ctx.fillRect(eyeX2, EYE_Y, eyeDrawnSize, eyeDrawnSize);
                        }
                        // -------------------------------------------------------------------
                        this.drawHealth(obj._orig); 
                    }
                });
            }
        }

        this.ctx.fillStyle = '#fff';
        this.projectiles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, 6.28);
            this.ctx.fill();
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
        
        this.ctx.font = "bold 14px monospace";
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
}