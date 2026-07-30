export class Projectile {
    constructor(x, y, targetX, targetY, damage, speed, color, isPlayerOwner, type = 'stone', ownerId = null) {
        this.x = x; 
        this.y = y;
        this.damage = damage;
        this.color = color;
        this.active = true;
        this.owner = isPlayerOwner ? 'player' : 'enemy';
        this.ownerId = ownerId;
        this.fromLocal = false;
        this.grace = 0;
        this.life = 100;
        this.type = type;
        this.angle = Math.atan2(targetY - y, targetX - x);
        this.velocityX = Math.cos(this.angle) * speed;
        this.velocityY = Math.sin(this.angle) * speed;
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.life--;
        if (this.grace > 0) this.grace--;
        
        if (this.life <= 0) {
            this.active = false;
            return 'expired';
        }
        return 'active';
    }

    draw(ctx, cameraX, cameraY) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(this.x - cameraX, this.y - cameraY + 12, 4, 0, Math.PI * 2);
        ctx.fill();

        if (this.type === 'spear') {
            ctx.save();
            ctx.translate(this.x - cameraX, this.y - cameraY);
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color;
            ctx.fillRect(-10, -2, 20, 4);
            ctx.fillStyle = '#fff';
            ctx.fillRect(10, -2, 4, 4);
            ctx.restore();
        } else if (this.type === 'cannonball') {
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(this.x - cameraX, this.y - cameraY, 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x - cameraX, this.y - cameraY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}