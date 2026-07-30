import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS, WEAPONS } from '../config.js';

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
            
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            // Scale slightly in CSS to fit menu
            canvas.style.cssText = "width:30px; height:30px; margin:0 auto 5px auto; display:block;";
            
            canvas.dataset.tileId = bp.structure[0].id;
            if (bp.special) canvas.dataset.special = bp.special;

            let costStr = "Free";
            if (bp.cost) costStr = Object.entries(bp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            
            div.appendChild(canvas);
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'bp-name';
            nameDiv.innerText = bp.name;
            div.appendChild(nameDiv);

            const costDiv = document.createElement('div');
            costDiv.className = 'bp-req';
            costDiv.innerText = costStr;
            div.appendChild(costDiv);

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
            
            let iconHtml = '';
            if (wp.id === TILES.SPEAR_WOOD.id) iconHtml = `<div class="icon-spear tip-black" style="margin:0 auto 5px auto; transform:rotate(45deg) scale(1.5);"></div>`;
            else if (wp.id === TILES.SPEAR_IRON.id) iconHtml = `<div class="icon-spear tip-grey" style="margin:0 auto 5px auto; transform:rotate(45deg) scale(1.5);"></div>`;
            else if (wp.id === TILES.SWORD_WOOD.id) iconHtml = `<div class="icon-sword-css blade-black" style="margin:0 auto 5px auto; transform:scale(1.5);"></div>`;
            else if (wp.id === TILES.SWORD_IRON.id) iconHtml = `<div class="icon-sword-css blade-grey" style="margin:0 auto 5px auto; transform:scale(1.5);"></div>`;
            else iconHtml = `<div style="width:20px; height:20px; background:${wp.color}; margin:0 auto 5px auto;"></div>`;

            let costStr = Object.entries(wp.cost).map(([id, qty]) => `${qty} ${ID_TO_TILE[id].short}`).join(', ');
            
            div.innerHTML = `${iconHtml}<div class="bp-name">${wp.name}</div><div class="bp-req">${costStr}</div>`;
            div.onclick = () => {
                if (div.classList.contains('disabled')) return;
                if (wp.type === 'melee' && this.game.player.inventory[wp.id] > 0) {
                    this.game.showMessage("ALREADY OWNED", "#f00", 3000);
                    return;
                }
                if (!this.game.godMode) {
                    for (const [id, qty] of Object.entries(wp.cost)) this.game.player.inventory[id] -= qty;
                }
                this.game.player.inventory[wp.id] = (this.game.player.inventory[wp.id] || 0) + 1;
                if (wp.type === 'range') this.game.player.activeRange = wp.id;
                else if (wp.type === 'melee') this.game.player.activeMelee = wp.id;
                this.game.showMessage(`Crafted ${wp.name}!`, '#fff', 3000);
                this.update(); 
            };
            this.dom.wpnMenu.appendChild(div);
        });
    }

    renderBlueprintIcons() {
        const canvases = this.dom.bpMenu.querySelectorAll('canvas[data-tile-id]');
        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d');
            this.game.renderer.renderIcon(ctx, Number(canvas.dataset.tileId), canvas.dataset.special);
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
        const pNone = 'style="pointer-events:none"'; 

        const rangeId = this.game.player.activeRange;
        const rangeQty = this.game.player.inventory[rangeId] || 0;

        if (rangeId === TILES.GREY.id) { rIcon = `<div class="icon-boulder" ${pNone}></div>`; rName = 'Stone'; } 
        else if (rangeId === TILES.SPEAR_WOOD.id) { rIcon = `<div class="icon-spear tip-black" ${pNone}></div>`; rName = 'Ob.Spr'; } 
        else if (rangeId === TILES.SPEAR_IRON.id) { rIcon = `<div class="icon-spear tip-grey" ${pNone}></div>`; rName = 'Ir.Spr'; }

        rSlot.innerHTML = `${rIcon}<div class="short-name" ${pNone}>${rName}</div><div class="qty">${rangeQty}</div>`;

        const mSlot = document.getElementById('slot-melee');
        let mIcon = ''; let mName = '';
        if (this.game.player.activeMelee === 'hand') { mIcon = `<div class="icon-fist" ${pNone}>✊</div>`; mName = 'Hand'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_WOOD.id) { mIcon = `<div class="icon-sword-css blade-black" ${pNone}></div>`; mName = 'Ob.Swd'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_IRON.id) { mIcon = `<div class="icon-sword-css blade-grey" ${pNone}></div>`; mName = 'Ir.Swd'; }
        mSlot.innerHTML = `${mIcon}<div class="short-name" ${pNone}>${mName}</div>`;

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

        const hammerBtn = document.getElementById('hammer-btn');
        if (hammerBtn) {
            const bpMenuOpen = this.dom.bpMenu.style.display === 'grid';
            hammerBtn.classList.toggle('active', !!(this.game.activeBlueprint || bpMenuOpen));
        }
        
        const px = Math.floor(this.game.player.x/CONFIG.TILE_SIZE);
        const py = Math.floor(this.game.player.y/CONFIG.TILE_SIZE);
        this.dom.coords.innerText = `${px}, ${py}`;
        
        this.dom.roomId.innerText = this.game.network.roomId || "---";

        if (this.game.input.isMobile) {
            const inBoat = this.game.player.inBoat;
            const bsL = document.getElementById('btn-broadside-l');
            const bsR = document.getElementById('btn-broadside-r');
            if (bsL) bsL.style.display = inBoat ? 'flex' : 'none';
            if (bsR) bsR.style.display = inBoat ? 'flex' : 'none';
        }
    }

}