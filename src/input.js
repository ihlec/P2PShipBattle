export default class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.mouse = { x: 0, y: 0, left: false, right: false, clickedLeft: false, clickedRight: false };
        this.wheel = 0;

        window.addEventListener('keydown', e => {
            this.keys[e.key.toLowerCase()] = true;
            if(e.key.toLowerCase() === 'escape') document.getElementById('blueprint-menu').style.display = 'none';
            if(e.key.toLowerCase() === 'b') this.game.toggleBlueprints();
        });
        window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        window.addEventListener('mousedown', e => {
            if(e.target.tagName !== 'CANVAS') return;
            if(e.button === 0) { this.mouse.left = true; this.mouse.clickedLeft = true; }
            if(e.button === 2) { this.mouse.right = true; this.mouse.clickedRight = true; }
        });
        window.addEventListener('mouseup', e => { this.mouse.left = false; this.mouse.right = false; });
        window.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('wheel', e => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    }

    flush() {
        this.mouse.clickedLeft = false;
        this.mouse.clickedRight = false;
        this.wheel = 0;
    }
}