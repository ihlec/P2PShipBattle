import { CONFIG, TILES, ID_TO_TILE } from '../config.js';

export default class Minimap {
    constructor(game) {
        this.game = game;
        this.wrap = document.getElementById('minimap-wrap');
        this.canvas = document.getElementById('minimap');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.lastPingTime = 0;

        if (!this.canvas || !this.ctx) return;

        const size = CONFIG.MINIMAP.SIZE;
        this.canvas.width = size;
        this.canvas.height = size;

        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (e.changedTouches[0]) this.onClick(e.changedTouches[0]);
        }, { passive: false });
    }

    onClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const world = this.screenToWorld(mx, my);
        if (world) this.game.placePing(world.x, world.y);
    }

    screenToWorld(sx, sy) {
        if (!this.game.player) return null;
        const size = CONFIG.MINIMAP.SIZE;
        const range = CONFIG.MINIMAP.RANGE_TILES;
        const ts = CONFIG.TILE_SIZE;
        const px = this.game.player.x;
        const py = this.game.player.y;
        const half = range * ts;
        const u = sx / size;
        const v = sy / size;
        return {
            x: px - half + u * half * 2,
            y: py - half + v * half * 2
        };
    }

    worldToScreen(wx, wy) {
        const size = CONFIG.MINIMAP.SIZE;
        const range = CONFIG.MINIMAP.RANGE_TILES;
        const ts = CONFIG.TILE_SIZE;
        const px = this.game.player.x;
        const py = this.game.player.y;
        const half = range * ts;
        return {
            x: ((wx - (px - half)) / (half * 2)) * size,
            y: ((wy - (py - half)) / (half * 2)) * size
        };
    }

    draw() {
        if (!this.ctx || !this.game.player) return;
        if (!this.game.network.isHost && !this.game.network.worldReceived) {
            if (this.wrap) this.wrap.style.display = 'none';
            return;
        }
        if (this.wrap) this.wrap.style.display = 'block';

        const ctx = this.ctx;
        const size = CONFIG.MINIMAP.SIZE;
        const range = CONFIG.MINIMAP.RANGE_TILES;
        const ts = CONFIG.TILE_SIZE;
        const px = this.game.player.x;
        const py = this.game.player.y;
        const centerGx = Math.floor(px / ts);
        const centerGy = Math.floor(py / ts);
        const pxPerTile = size / (range * 2);

        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, size, size);

        const step = 2;
        const cell = Math.ceil(pxPerTile * step) + 0.5;
        for (let dy = -range; dy < range; dy += step) {
            for (let dx = -range; dx < range; dx += step) {
                const gx = centerGx + dx;
                const gy = centerGy + dy;
                const id = this.game.world.getTile(gx, gy);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;

                let color = tile.color;
                if (id === TILES.TREE.id) color = '#1e4d22';
                else if (id === TILES.MOUNTAIN.id) color = '#777';
                else if (tile.isTower) color = '#ffaa00';
                else if (id === TILES.WALL.id || id === TILES.WOOD_WALL.id) color = '#aaa';
                else if (id === TILES.GREY.id || id === TILES.ROAD.id) color = '#8a7a5a';

                ctx.fillStyle = color;
                const sx = (dx + range) * pxPerTile;
                const sy = (dy + range) * pxPerTile;
                ctx.fillRect(sx, sy, cell, cell);
            }
        }

        // Enemy boats / NPCs
        this.game.npcs.forEach(n => {
            if (n.hp <= 0) return;
            this.drawDot(n.x, n.y, '#f44', 2.5);
        });
        this.game.boats.forEach(b => {
            if (b.hp <= 0) return;
            this.drawDot(b.x, b.y, b.owner === 'enemy' ? '#c00' : '#8B4513', 3);
        });

        Object.values(this.game.peers).forEach(p => {
            this.drawDot(p.x, p.y, '#2ecc71', 3.5);
        });

        // Local player
        this.drawDot(px, py, '#3498db', 4);
        const you = this.worldToScreen(px, py);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(you.x, you.y, 5, 0, Math.PI * 2);
        ctx.stroke();

        // Pings
        const now = Date.now();
        (this.game.pings || []).forEach(ping => {
            const age = now - ping.t;
            if (age > CONFIG.MINIMAP.PING_MS) return;
            const pos = this.worldToScreen(ping.x, ping.y);
            if (pos.x < -8 || pos.y < -8 || pos.x > size + 8 || pos.y > size + 8) return;
            const pulse = 0.5 + Math.sin(now * 0.012) * 0.5;
            const r = 4 + pulse * 4;
            ctx.strokeStyle = `rgba(255, 215, 0, ${0.9 - age / CONFIG.MINIMAP.PING_MS * 0.7})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1;
        ctx.strokeRect(3, 3, size - 6, size - 6);
    }

    drawDot(wx, wy, color, r) {
        const pos = this.worldToScreen(wx, wy);
        const size = CONFIG.MINIMAP.SIZE;
        if (pos.x < 0 || pos.y < 0 || pos.x > size || pos.y > size) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
