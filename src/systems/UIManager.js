import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS, WEAPONS } from '../config.js';
import Utils from '../utils.js';

export default class UIManager {
    constructor(game) {
        this.game = game;
        this.dom = {
            coords: document.getElementById('coords'),
            invBar: document.getElementById('inventory-bar'),
            wpnBar: document.getElementById('weapon-bar'),
            bpMenu: document.getElementById('blueprint-menu'),
            wpnMenu: document.getElementById('weapon-menu'),
            activeBp: document.getElementById('active-bp-display'),
            activeWp: document.getElementById('active-weapon-display'),
            bpName: document.getElementById('current-bp-name'),
            wpName: document.getElementById('current-weapon-name'),
            roomId: document.getElementById('room-id-disp')
        };
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        const materials = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS, TILES.WOOL];
        this.dom.invBar.innerHTML = '';
        
        materials.forEach((t) => {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.id = `slot-${t.id}`;
            slot.innerHTML = `<div class="slot-color" style="background:${t.color}"></div><div class="short-name">${t.short}</div><div class="qty" id="qty-${t.id}">0</div>`;
            slot.onclick = () => {
                if (this.game.player.selectedTile === t.id) { 
                    this.game.player.selectedTile = null; 
                } else { 
                    this.game.player.selectedTile = t.id; 
                    this.game.activeBlueprint = null; 
                }
                this.update();
            };
            this.dom.invBar.appendChild(slot);
        });

        this.dom.wpnBar.innerHTML = '';
        const rangeSlot = document.createElement('div');
        rangeSlot.className = 'slot';
        rangeSlot.id = 'slot-range';
        rangeSlot.onclick = () => this.game.cycleRangeWeapon();
        this.dom.wpnBar.appendChild(rangeSlot);

        const meleeSlot = document.createElement('div');
        meleeSlot.className = 'slot';
        meleeSlot.id = 'slot-melee';
        meleeSlot.innerHTML = `<div class="icon-sword">🗡️</div><div class="short-name" id="name-melee">Hand</div>`;
        meleeSlot.onclick = () => this.game.cycleMeleeWeapon();
        this.dom.wpnBar.appendChild(meleeSlot);

        this.initMenus();
    }

    initMenus() {
        this.dom.bpMenu.innerHTML = '';
        BLUEPRINTS.forEach((bp) => {
            const div = document.createElement('div');
            div.className = 'bp-item';
            let costStr = "Free";
            if (bp.cost) costStr = Object.entries(bp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            div.innerHTML = `<div class="bp-name">${bp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => { 
                if (div.classList.contains('disabled')) return;
                this.game.activeBlueprint = bp; 
                this.game.player.selectedTile = null; 
                this.toggleBlueprints(); 
                this.update(); 
            };
            this.dom.bpMenu.appendChild(div);
        });

        this.dom.wpnMenu.innerHTML = '';
        Object.values(WEAPONS).forEach((wp) => {
            const div = document.createElement('div');
            div.className = 'bp-item';
            div.id = `wp-btn-${wp.id}`;
            let costStr = Object.entries(wp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            div.innerHTML = `<div class="bp-name">${wp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => {
                if (div.classList.contains('disabled')) return;
                if (wp.type === 'melee' && this.game.player.inventory[wp.id] > 0) {
                    this.game.showMessage("ALREADY OWNED", "#f00");
                    return;
                }
                if (!this.game.godMode) {
                    for (const [id, qty] of Object.entries(wp.cost)) this.game.player.inventory[id] -= qty;
                }
                this.game.player.inventory[wp.id] = (this.game.player.inventory[wp.id] || 0) + 1;
                this.game.showMessage(`Crafted ${wp.name}!`, '#fff');
                this.toggleWeapons();
                this.update(); 
            };
            this.dom.wpnMenu.appendChild(div);
        });
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

    update() {
        // Inventory
        const materials = [TILES.GREY, TILES.BLACK, TILES.IRON, TILES.GOLD, TILES.WOOD, TILES.GREENS, TILES.WOOL];
        materials.forEach(t => {
            const slot = document.getElementById(`slot-${t.id}`);
            const qtyEl = document.getElementById(`qty-${t.id}`);
            if(slot && qtyEl) {
                qtyEl.innerText = this.game.player.inventory[t.id] || 0;
                slot.classList.toggle('active', !this.game.activeBlueprint && t.id === this.game.player.selectedTile);
            }
        });

        // Weapon Slots
        const rSlot = document.getElementById('slot-range');
        let rIcon = ''; let rName = '';
        const pNone = 'style="pointer-events:none"'; // Prevent inner elements from blocking clicks

        if (this.game.player.activeRange === TILES.GREY.id) { rIcon = `<div class="icon-boulder" ${pNone}></div>`; rName = 'Stone'; } 
        else if (this.game.player.activeRange === TILES.SPEAR_WOOD.id) { rIcon = `<div class="icon-spear tip-black" ${pNone}></div>`; rName = 'Ob.Spr'; } 
        else if (this.game.player.activeRange === TILES.SPEAR_IRON.id) { rIcon = `<div class="icon-spear tip-grey" ${pNone}></div>`; rName = 'Ir.Spr'; }
        rSlot.innerHTML = `${rIcon}<div class="short-name" ${pNone}>${rName}</div>`;

        const mSlot = document.getElementById('slot-melee');
        let mIcon = ''; let mName = '';
        if (this.game.player.activeMelee === 'hand') { mIcon = `<div class="icon-fist" ${pNone}>✊</div>`; mName = 'Hand'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_WOOD.id) { mIcon = `<div class="icon-sword-css blade-black" ${pNone}></div>`; mName = 'Ob.Swd'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_IRON.id) { mIcon = `<div class="icon-sword-css blade-grey" ${pNone}></div>`; mName = 'Ir.Swd'; }
        mSlot.innerHTML = `${mIcon}<div class="short-name" ${pNone}>${mName}</div>`;

        // Menus (Enable/Disable based on cost)
        const bpItems = this.dom.bpMenu.children;
        BLUEPRINTS.forEach((bp, i) => {
            const div = bpItems[i];
            let canAfford = true;
            if (bp.cost && !this.game.godMode) {
                for (const [id, qty] of Object.entries(bp.cost)) {
                    if ((this.game.player.inventory[id] || 0) < qty) { canAfford = false; break; }
                }
            }
            if (canAfford) div.classList.remove('disabled'); else div.classList.add('disabled');
        });

        Object.values(WEAPONS).forEach((wp, i) => {
            const div = document.getElementById(`wp-btn-${wp.id}`);
            if (!div) return;
            let canAfford = true;
            if (wp.cost && !this.game.godMode) {
                for (const [id, qty] of Object.entries(wp.cost)) {
                    if ((this.game.player.inventory[id] || 0) < qty) { canAfford = false; break; }
                }
            }
            let alreadyOwned = (wp.type === 'melee' && this.game.player.inventory[wp.id] > 0);
            if (canAfford && !alreadyOwned) div.classList.remove('disabled'); 
            else div.classList.add('disabled');
        });

        if(this.game.activeBlueprint) {
            this.dom.activeBp.style.display = 'block';
            this.dom.bpName.innerText = this.game.activeBlueprint.name;
        } else {
            this.dom.activeBp.style.display = 'none';
        }
        
        // HUD text (Reduced)
        const px = Math.floor(this.game.player.x/CONFIG.TILE_SIZE);
        const py = Math.floor(this.game.player.y/CONFIG.TILE_SIZE);
        this.dom.coords.innerText = `${px}, ${py}`;
        
        // Room ID
        this.dom.roomId.innerText = this.game.network.roomId || "---";
    }

    spawnLoot(x, y, type) {
        let dropId = TILES.GREY.id;
        let qty = 1;
        
        if (type === 'sheep') { 
            dropId = TILES.WOOL.id; qty = 2; 
        } else if (type === 'tree' || type === TILES.TREE.id) {
            dropId = TILES.WOOD.id; qty = 3;
            if (Math.random() < 0.2) {
                this.game.loot.push({ 
                    uid: Math.random().toString(36).substr(2, 9), 
                    x: x + 10, y: y + 10, id: TILES.GREENS.id, qty: 1, 
                    bob: Math.random() * 100 
                });
            }
        }
        
        this.game.loot.push({ 
            uid: Math.random().toString(36).substr(2, 9), 
            x: x, y: y, id: dropId, qty: qty, 
            bob: Math.random() * 100 
        });
    }

    handleInteraction() {
        if (!this.game.input.mouse.clickedLeft && !this.game.input.mouse.clickedRight) return;
        
        const mx = (this.game.input.mouse.x / this.game.zoom) + this.game.camera.x;
        const my = (this.game.input.mouse.y / this.game.zoom) + this.game.camera.y;
        const gx = Math.floor(mx / CONFIG.TILE_SIZE);
        const gy = Math.floor(my / CONFIG.TILE_SIZE);
        
        if (Utils.distance(this.game.player, { x: mx, y: my }) > CONFIG.BUILD_RANGE) return;

        const isOccupied = (tx, ty) => {
            const tileRect = { l: tx * 32, r: (tx+1) * 32, t: ty * 32, b: (ty+1) * 32 };
            const all = [this.game.player, ...this.game.npcs, ...this.game.animals, ...this.game.boats, ...Object.values(this.game.peers)];
            return all.some(e => {
                return (e.x-8 < tileRect.r && e.x+8 > tileRect.l && e.y-8 < tileRect.b && e.y+8 > tileRect.t);
            });
        };

        if (this.game.input.mouse.clickedLeft) {
            const clickedTile = this.game.world.getTile(gx, gy);

            // Refill Cannon
            const cannon = this.game.cannons.find(c => { const [cx, cy] = c.key.split(',').map(Number); return gx === cx && gy === cy; });
            if (cannon && this.game.player.selectedTile === TILES.IRON.id) {
                if (this.game.player.inventory[TILES.IRON.id] > 0 || this.game.godMode) {
                    if (!this.game.godMode) this.game.player.inventory[TILES.IRON.id]--;
                    if (this.game.network.isHost) {
                        cannon.ammo += 5;
                        this.game.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
                    } else {
                        this.game.network.actions.sendEntReq({ id: cannon.key, act: 'refill' });
                    }
                    return;
                }
            }
            
            // Build / Shoot
            if (!this.game.activeBlueprint) {
                const sel = this.game.player.selectedTile;
                if (!sel) {
                    this.game.throwProjectile(mx, my);
                    return;
                }
                const tileDef = ID_TO_TILE[sel];
                if (tileDef.solid && isOccupied(gx, gy)) { this.game.spawnText(mx, my, "BLOCKED", "#f00"); return; }
                if (this.tryBuild(gx, gy, sel)) {
                    if (!this.game.godMode) this.game.player.inventory[sel]--;
                    this.recalculateCannons();
                }
                return;
            }
            
            // Blueprints
            if (this.game.activeBlueprint) {
                const costMap = this.game.activeBlueprint.cost || {};
                let affordable = true;
                for (let [id, qty] of Object.entries(costMap)) {
                     if ((this.game.player.inventory[id] || 0) < qty && !this.game.godMode) affordable = false;
                }
                
                if (affordable) {
                    if (this.game.activeBlueprint.special === 'boat') {
                        if (![TILES.WATER.id, TILES.DEEP_WATER.id].includes(this.game.world.getTile(gx, gy))) return;
                        if (!this.game.godMode) for (let [id, qty] of Object.entries(costMap)) this.game.player.inventory[id] -= qty;
                        
                        if (this.game.network.isHost) {
                             // Use class from Game scope or imported boat if needed, assuming Game handles it or importing Boat here?
                             // Better to let Game handle spawn.
                             // For now we assume Game imports Boat.
                             // Actually we need to make sure we spawn a boat.
                             // We can use a custom event or method on game.
                             // But since we are in UIManager, we need to be careful with imports.
                             // Let's defer to game.network logic or game spawn method.
                             // We'll push a generic object and let sync handle it or import Boat if we can.
                             // Assuming Boat is imported in Game.js, we can't 'new Boat' here easily without circular deps or import.
                             // SOLUTION: We will let Game.js handle the actual instantiation via a helper.
                             this.game.spawnBoat(gx*32+16, gy*32+16);
                        } else {
                             this.game.network.actions.sendEntReq({ act: 'spawnBoat', x: gx*32+16, y: gy*32+16 });
                        }
                    } else {
                        let built = false;
                        const isBridge = this.game.activeBlueprint.special === 'bridge';
                        this.game.activeBlueprint.structure.forEach(part => {
                             if(this.tryBuild(gx + part.x, gy + part.y, part.id, false, isBridge)) built = true;
                        });
                        
                        if (built) {
                            if (!this.game.godMode) for (let [id, qty] of Object.entries(costMap)) this.game.player.inventory[id] -= qty;
                            this.recalculateCannons();
                        }
                    }
                } else {
                    this.game.spawnText(mx, my, "TOO EXPENSIVE", "#f00");
                }
            }

        } else if (this.game.input.mouse.clickedRight) {
            
            // Cancel Blueprint
            if (this.game.activeBlueprint) {
                this.game.activeBlueprint = null;
                this.update();
                return;
            }

            // Board/Unboard
            if (this.game.player.inBoat) {
                const clickedTile = this.game.world.getTile(gx, gy);
                const allowed = [TILES.GRASS.id, TILES.SAND.id, TILES.GREY.id, TILES.WOOD_RAIL.id];
                if (allowed.includes(clickedTile) && Utils.distance(this.game.player, {x:mx, y:my}) < 100) {
                     this.game.spawnBoat(this.game.player.x, this.game.player.y, this.game.player.hp);
                     this.game.player.hp = this.game.player.storedHp || 100;
                     this.game.player.inBoat = false;
                     this.game.player.x = gx*32+16; 
                     this.game.player.y = gy*32+16;
                     return;
                }
            } else {
                const boatIdx = this.game.boats.findIndex(b => Utils.distance(b, {x:mx, y:my}) < 32);
                if (boatIdx !== -1 && Utils.distance(this.game.player, this.game.boats[boatIdx]) < 100) {
                     const boat = this.game.boats[boatIdx];
                     this.game.player.storedHp = this.game.player.hp;
                     this.game.player.hp = boat.hp;
                     this.game.player.inBoat = true;
                     this.game.player.x = boat.x; 
                     this.game.player.y = boat.y;
                     this.game.player.boatStats = boat.boatStats;
                     
                     if (this.game.network.isHost) this.game.boats.splice(boatIdx, 1);
                     else {
                         this.game.network.actions.sendEntReq({ act: 'enterBoat', id: boat.id });
                         this.game.boats.splice(boatIdx, 1); 
                     }
                     return;
                }
            }

            // [FIXED] Shear Sheep
            const clickedSheep = this.game.animals.find(s => Utils.distance(s, { x: mx, y: my }) < 24);
            if (clickedSheep && clickedSheep.hasWool) {
                if (this.game.network.isHost) {
                    clickedSheep.hasWool = false;
                    clickedSheep.woolTimer = CONFIG.WOOL_REGROW_TIME;
                    this.spawnLoot(clickedSheep.x, clickedSheep.y, 'sheep');
                    this.game.spawnParticles(clickedSheep.x, clickedSheep.y, '#eee', 5);
                } else {
                    this.game.network.actions.sendEntReq({ id: clickedSheep.id, act: 'shear' });
                }
                return;
            }
            
            // Remove/Attack Tile
            const tileId = this.game.world.getTile(gx, gy);
            const tileDef = ID_TO_TILE[tileId];
            
            if (tileId === TILES.TREE.id || tileDef.hp || [TILES.GREY.id, TILES.WOOD.id, TILES.WOOD_RAIL.id].includes(tileId)) {
                this.applyDamageToTile(gx, gy, 20); 
            }
        }
    }

    tryBuild(gx, gy, id, allowRailOverwrite = false, isBridge = false, force = false) {
        if (!this.game.network.isHost && !force) {
            this.game.network.requestBuild(gx, gy, id);
            return false;
        }

        const current = this.game.world.getTile(gx, gy);
        if (current === id) return false;
        
        if ((current === TILES.WATER.id || current === TILES.DEEP_WATER.id) && !isBridge) return false;

        this.game.world.setTile(gx, gy, id);
        if (this.game.network.isHost && !force) this.game.network.broadcastBuild(gx, gy, id);
        return true;
    }

    applyDamageToTile(gx, gy, damage) {
        const tileId = this.game.world.getTile(gx, gy);
        const tileDef = ID_TO_TILE[tileId];

        if (!tileDef || (!tileDef.hp && tileId !== TILES.TREE.id)) return;
        
        if (tileId === TILES.TREE.id) {
             this.game.network.requestRemove(gx, gy, TILES.GRASS.id);
             // [FIXED] Pass 'tree' type to spawnLoot
             this.spawnLoot(gx * CONFIG.TILE_SIZE + 16, gy * CONFIG.TILE_SIZE + 16, 'tree');
             this.game.spawnParticles(gx * CONFIG.TILE_SIZE + 16, gy * CONFIG.TILE_SIZE + 16, TILES.WOOD.color, 8);
             return;
        }

        const tx = gx * CONFIG.TILE_SIZE + 16;
        const ty = gy * CONFIG.TILE_SIZE + 16;
        
        if (this.game.network.isHost) {
            const totalDmg = this.game.world.hitTile(gx, gy, damage);
            
            this.game.spawnParticles(tx, ty, '#777', 3);
            this.game.spawnText(tx, ty, `-${damage}`, '#fff');
            
            if (totalDmg >= tileDef.hp) {
                const biome = Utils.getBiome(gx, gy, this.game.world.seed);
                let restoreId = TILES.GRASS.id;
                if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
                if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;
                
                this.game.network.requestRemove(gx, gy, restoreId);
                this.game.spawnParticles(tx, ty, '#555', 10);
                this.recalculateCannons();
            } else {
                this.game.network.broadcastTileHit(gx, gy, damage);
            }
        } else {
            this.game.network.actions.sendTileReq({ 
                x: gx, 
                y: gy, 
                dmg: damage, 
                type: 'damage' 
            });
        }
    }

    recalculateCannons() {
        if (!this.game.player) return;

        const range = 30;
        const activeCannons = new Map();
        const viewers = [this.game.player, ...Object.values(this.game.peers)];

        viewers.forEach(p => {
            if (!p) return; 
            const px = Math.floor(p.x / CONFIG.TILE_SIZE);
            const py = Math.floor(p.y / CONFIG.TILE_SIZE);
            for (let y = py - range; y < py + range; y++) {
                for (let x = px - range; x < px + range; x++) {
                    const key = `${x},${y}`;
                    if (activeCannons.has(key)) continue;
                    const id = this.game.world.getTile(x, y);
                    const tile = ID_TO_TILE[id];
                    if (tile && tile.isTower) {
                         activeCannons.set(key, { key, x: x*32+16, y: y*32+16, damage: tile.cannonDamage||20, cooldown: 0, ammo: 10, range: 300 });
                    }
                }
            }
        });
        this.game.cannons = Array.from(activeCannons.values());
    }
}