import { CONFIG } from '../config.js';

class Particle {
    constructor(x, y, color, dx, dy, life, size = 4, gravity = 0) {
        this.x = x; this.y = y; this.color = color;
        this.dx = dx; this.dy = dy; 
        this.life = life; this.maxLife = life;
        this.size = size; this.gravity = gravity;
    }
    update() { this.x += this.dx; this.y += this.dy; this.dy += this.gravity; this.life--; }
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

    spawnHarvestBurst(x, y, color, intensity = 1) {
        const count = Math.round(12 * intensity);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.2 + Math.random() * 5;
            const size = Math.random() < 0.3 ? 5 : (2 + Math.random() * 3);
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, color,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1.5,
                50 + Math.random() * 35,
                size, 0.08
            ));
        }
        for (let i = 0; i < 3; i++) {
            this.particles.push(new Particle(
                x, y, '#fff',
                (Math.random() - 0.5) * 6, -2 - Math.random() * 3,
                12 + Math.random() * 8, 2, 0
            ));
        }
    }

    spawnMiningChips(x, y, color) {
        for (let i = 0; i < 2; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const speed = 1 + Math.random() * 2.5;
            const size = 1.5 + Math.random() * 2;
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16, color,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                20 + Math.random() * 15,
                size, 0.12
            ));
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
        this.particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1.0;
        });
    }
}