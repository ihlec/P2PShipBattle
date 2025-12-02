import { CONFIG, TILES, ID_TO_TILE, BLUEPRINTS, WEAPONS } from './config.js';
import Utils from './utils.js';

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
        if (this.game.player.activeRange === TILES.GREY.id) { rIcon = `<div class="icon-boulder"></div>`; rName = 'Stone'; } 
        else if (this.game.player.activeRange === TILES.SPEAR_WOOD.id) { rIcon = `<div class="icon-spear tip-black"></div>`; rName = 'Ob.Spr'; } 
        else if (this.game.player.activeRange === TILES.SPEAR_IRON.id) { rIcon = `<div class="icon-spear tip-grey"></div>`; rName = 'Ir.Spr'; }
        rSlot.innerHTML = `${rIcon}<div class="short-name">${rName}</div>`;

        const mSlot = document.getElementById('slot-melee');
        let mIcon = ''; let mName = '';
        if (this.game.player.activeMelee === 'hand') { mIcon = `<div class="icon-fist">✊</div>`; mName = 'Hand'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_WOOD.id) { mIcon = `<div class="icon-sword-css blade-black"></div>`; mName = 'Ob.Swd'; } 
        else if (this.game.player.activeMelee === TILES.SWORD_IRON.id) { mIcon = `<div class="icon-sword-css blade-grey"></div>`; mName = 'Ir.Swd'; }
        mSlot.innerHTML = `${mIcon}<div class="short-name">${mName}</div>`;

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
        this.dom.roomId.innerText = this.game.network.roomId;
    }
}