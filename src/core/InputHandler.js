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
            this.keys[e.key.toLowerCase()] = true;
            if(e.key.toLowerCase() === 'escape') {
                const bpMenu = document.getElementById('blueprint-menu');
                if (bpMenu) bpMenu.style.display = 'none';
            }
            if(e.key.toLowerCase() === 'b') this.game.ui.toggleBlueprints(); 
        });
        
        window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);
        
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

    handleInteraction(game) {
        // ... (Interaction logic logic moved from original game.js handleInteraction) ...
        // Since this logic is complex and deeply tied to Game state, we keep the method hook
        // but the implementation logic resides in Game.js or here. 
        // For the sake of this refactor, we will rely on Game.js calling logic, 
        // but we expose the clean input state here.
    }

    flush() {
        this.mouse.clickedLeft = false;
        this.mouse.clickedRight = false;
        this.wheel = 0;
    }
}