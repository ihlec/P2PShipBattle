import { CONFIG } from '../config.js';

class Particle {
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

class WindParticle {
    constructor(screenWidth, screenHeight) {
        this.x = Math.random() * screenWidth;
        this.y = Math.random() * screenHeight;
        this.speed = (CONFIG.WIND.SPEED_BASE * 4) + Math.random() * (CONFIG.WIND.SPEED_VARIATION * 2);
        this.length = 10 + Math.random() * 20; 
        this.thickness = Math.random() > 0.5 ? 1 : 2;
    }

    update(screenWidth, screenHeight, angle, cam, zoom) {
        const dx = Math.cos(angle) * this.speed;
        const dy = Math.sin(angle) * this.speed;
        
        // Adjust for camera movement to give parallax feel
        // Note: Ideally wind is world space, but for screen effect we loop it
        this.x += dx;
        this.y += dy;
        
        const buffer = 50;
        if (this.x < -buffer) this.x += screenWidth + buffer;
        if (this.x > screenWidth + buffer) this.x -= screenWidth + buffer;
        if (this.y < -buffer) this.y += screenHeight + buffer;
        if (this.y > screenHeight + buffer) this.y -= screenHeight + buffer;
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

export default class ParticleSystem {
    constructor() {
        this.particles = [];
        this.texts = [];
        this.windParticles = [];
    }

    initWind(width, height) {
        this.windParticles = Array.from({ length: CONFIG.WIND.PARTICLE_COUNT }, () => new WindParticle(width, height));
    }

    spawnExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 30 + Math.random() * 20));
        }
    }

    spawnFloatingText(x, y, txt, col) {
        this.texts.push({ x, y, txt, col, life: 60, dy: -1 });
    }

    update(width, height, windAngle, camera, zoom) {
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.life > 0);
        
        this.texts.forEach(t => { t.y += t.dy; t.life--; });
        this.texts = this.texts.filter(t => t.life > 0);
        
        this.windParticles.forEach(p => p.update(width, height, windAngle, camera, zoom));
    }

    draw(ctx) {
        // Particles are drawn in world space (renderer handles camera translate)
        // Except we passed 0,0 in renderer logic, so we draw normally if context is transformed
        this.particles.forEach(p => {
            // Note: Renderer calls this while context is already translated
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
            ctx.globalAlpha = 1.0;
        });
    }
}