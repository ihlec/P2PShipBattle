export default class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.mouse = { 
            x: 0, 
            y: 0, 
            leftDown: false, 
            rightDown: false, 
            clickedLeft: false, 
            clickedRight: false 
        };
        this.wheel = 0;

        window.addEventListener('keydown', e => {
            // [FIX] Ignore input if typing in a text field
            if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            this.keys[e.key.toLowerCase()] = true;
            
            if(e.key.toLowerCase() === 'escape') {
                // [FIX] Correctly cancel blueprint
                this.game.activeBlueprint = null;
                this.game.player.selectedTile = null;
                this.game.ui.update();

                const bpMenu = document.getElementById('blueprint-menu');
                if (bpMenu) bpMenu.style.display = 'none';
            }
            
            if(e.key.toLowerCase() === 'b') this.game.ui.toggleBlueprints(); 
        });
        
        window.addEventListener('keyup', e => {
             if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
             this.keys[e.key.toLowerCase()] = false;
        });
        
        window.addEventListener('mousemove', e => { 
            this.mouse.x = e.clientX; 
            this.mouse.y = e.clientY; 
        });
        
        window.addEventListener('mousedown', e => {
            if(e.target.tagName !== 'CANVAS') return;
            if(e.button === 0) { this.mouse.leftDown = true; this.mouse.clickedLeft = true; }
            if(e.button === 2) { this.mouse.rightDown = true; this.mouse.clickedRight = true; }
        });
        
        window.addEventListener('mouseup', e => { 
            if(e.button === 0) this.mouse.leftDown = false; 
            if(e.button === 2) this.mouse.rightDown = false; 
        });
        
        window.addEventListener('contextmenu', e => e.preventDefault());
        
        window.addEventListener('wheel', e => { 
            this.wheel += e.deltaY; 
            e.preventDefault(); 
        }, { passive: false });
    }

    flush() {
        this.mouse.clickedLeft = false;
        this.mouse.clickedRight = false;
        this.wheel = 0;
    }
}