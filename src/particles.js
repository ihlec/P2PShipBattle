import { CONFIG } from './config.js';

export class Particle {
    constructor(x, y, color, dx, dy, life) {
        this.x = x; this.y = y; this.color = color;
        this.dx = dx; this.dy = dy; 
        this.life = life; this.maxLife = life;
    }
    update() { this.x += this.dx; this.y += this.dy; this.life--; }
    draw(ctx, camX, camY) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - camX, this.y - camY, 4, 4);
        ctx.globalAlpha = 1.0;
    }
}

export class WakeParticle {
    constructor(x, y, angle) {
        this.x = x; 
        this.y = y;
        this.life = 60 + Math.random() * 40;
        this.maxLife = this.life;
        this.size = Math.random() * 10 + 5;
        this.dx = Math.cos(angle) * 0.5;
        this.dy = Math.sin(angle) * 0.5;
    }
    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.size += 0.2; 
        this.life--;
    }
    draw(ctx, camX, camY) {
        ctx.globalAlpha = (this.life / this.maxLife) * 0.4;
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

export class WindParticle {
    constructor(screenWidth, screenHeight) {
        this.x = Math.random() * screenWidth;
        this.y = Math.random() * screenHeight;
        this.speed = (CONFIG.WIND.SPEED_BASE * 4) + Math.random() * (CONFIG.WIND.SPEED_VARIATION * 2);
        this.length = 10 + Math.random() * 20; 
        this.thickness = Math.random() > 0.5 ? 1 : 2;
    }

    update(screenWidth, screenHeight, angle, camDx, camDy) {
        const dx = Math.cos(angle) * this.speed;
        const dy = Math.sin(angle) * this.speed;
        this.x += dx - camDx;
        this.y += dy - camDy;
        const buffer = 50;
        const totalW = screenWidth + buffer * 2;
        const totalH = screenHeight + buffer * 2;
        if (this.x < -buffer) this.x += totalW;
        if (this.x > screenWidth + buffer) this.x -= totalW;
        if (this.y < -buffer) this.y += totalH;
        if (this.y > screenHeight + buffer) this.y -= totalH;
    }

    draw(ctx, angle) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        ctx.fillStyle = CONFIG.WIND.COLOR;
        ctx.fillRect(0, 0, this.length, this.thickness);
        ctx.restore();
    }
}