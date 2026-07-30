import { CONFIG, TILES, ID_TO_TILE, SHIP_SPECS } from '../config.js';
import Utils from '../utils.js';

export default class Renderer {
    constructor(game, canvas) {
        this.game = game;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.shadowCanvas = document.createElement('canvas');
        this.shadowCtx = this.shadowCanvas.getContext('2d');
        
        this.lightSprite = document.createElement('canvas');
        this.preRenderLight();

        this.resize();
    }

    preRenderLight() {
        const size = 512;
        const center = size / 2;
        this.lightSprite.width = size;
        this.lightSprite.height = size;
        const ctx = this.lightSprite.getContext('2d');
        
        const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
        grad.addColorStop(0, "rgba(255, 255, 255, 1)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center, center, center, 0, Math.PI * 2);
        ctx.fill();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.shadowCanvas.width = this.canvas.width;
        this.shadowCanvas.height = this.canvas.height;
    }

    draw() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.game.zoom, this.game.zoom);
        this.ctx.translate(-this.game.camera.x, -this.game.camera.y);

        const startCol = Math.floor(this.game.camera.x / CONFIG.TILE_SIZE);
        const endCol = startCol + (this.canvas.width / this.game.zoom / CONFIG.TILE_SIZE) + 1;
        const startRow = Math.floor(this.game.camera.y / CONFIG.TILE_SIZE);
        const endRow = startRow + (this.canvas.height / this.game.zoom / CONFIG.TILE_SIZE) + 1;

        const rowBuckets = {};
        const addToBucket = (obj, type) => {
            const r = Math.floor(obj.y / CONFIG.TILE_SIZE);
            if (!rowBuckets[r]) rowBuckets[r] = [];
            rowBuckets[r].push({ ...obj, _type: type, _orig: obj });
        };

        this.game.npcs.forEach(n => addToBucket(n, 'npc'));
        this.game.animals.forEach(n => addToBucket(n, 'sheep')); 
        this.game.boats.forEach(n => addToBucket(n, 'boat')); 
        this.game.workers.forEach(w => addToBucket(w, 'worker'));
        addToBucket(this.game.player, 'player');
        this.game.loot.forEach(l => addToBucket(l, 'loot'));
        Object.values(this.game.peers).forEach(p => addToBucket(p, 'peer'));

        for (let r = startRow - 2; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const id = this.game.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;

                if ((!tile.solid || tile.isWater) && id !== TILES.TREE.id && id !== TILES.WOOD_WALL_OPEN.id && id !== TILES.TORCH.id && id !== TILES.CROP_SEED.id && id !== TILES.CROP_GROWING.id && id !== TILES.CROP_READY.id && id !== TILES.ROAD.id) {
                    const tx = c * CONFIG.TILE_SIZE;
                    const ty = r * CONFIG.TILE_SIZE;
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    
                    if (id === TILES.GRASS.id || id === TILES.SAND.id) {
                        const noise = Utils.noise(c, r, this.game.world.seed);
                        if (noise > 0.7) {
                            this.ctx.fillStyle = 'rgba(0,0,0,0.05)';
                            this.ctx.fillRect(tx + 8, ty + 8, 4, 4);
                            this.ctx.fillRect(tx + 20, ty + 18, 3, 3);
                        }
                    }
                }
                
                if (id === TILES.WOOD_WALL_OPEN.id || id === TILES.WOOD_WALL.id || id === TILES.TORCH.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     const biome = Utils.getBiome(c, r, this.game.world.seed);
                     const bgTile = ID_TO_TILE[biome];
                     this.ctx.fillStyle = bgTile ? bgTile.color : '#000';
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }

                if (id === TILES.TREE.id || id === TILES.MOUNTAIN.id || id === TILES.CROP_SEED.id || id === TILES.CROP_GROWING.id || id === TILES.CROP_READY.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     this.ctx.fillStyle = TILES.GRASS.color; 
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
            }
        }

        for (let r = startRow - 2; r <= endRow; r++) { 
            for (let c = startCol; c <= endCol; c++) {
                const id = this.game.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;
                
                const tx = c * CONFIG.TILE_SIZE;
                const ty = r * CONFIG.TILE_SIZE;

                if (id === TILES.GREY.id) {
                    const biome = Utils.getBiome(c, r, this.game.world.seed);
                    const isOverWater = (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id);
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    if (isOverWater) {
                        this.drawBridgeWalls(tx, ty, c, r);
                    }
                }
                else if (id === TILES.ROAD.id) this.drawRoad(tx, ty, c, r);
                else if (id === TILES.WALL.id) this.drawStoneWall(tx, ty, tile.color, c, r);
                else if (id === TILES.WOOD_WALL.id || id === TILES.WOOD_WALL_OPEN.id) this.drawWoodFence(tx, ty, c, r, id === TILES.WOOD_WALL_OPEN.id);
                else if (id === TILES.WOOD_RAIL.id) {
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    this.ctx.fillRect(tx+4, ty+4, CONFIG.TILE_SIZE-8, CONFIG.TILE_SIZE-8);
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx+8, ty+8, CONFIG.TILE_SIZE-16, CONFIG.TILE_SIZE-16);
                }
                else if (tile.isTower) this.drawTower(tx, ty, tile.color, c, r, id);
                else if (id === TILES.STONE_BLOCK.id) this.drawBoulder(tx, ty, c, r);
                else if (id === TILES.TREE.id) this.drawTree(tx, ty, c, r, rowBuckets);
                else if (id === TILES.MOUNTAIN.id) {
                    this.ctx.fillStyle = Utils.hsl(0, 0, 60, c, r, this.game.world.seed, 0, 15);
                    this.ctx.fillRect(tx, ty - 8, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE + 8); 
                    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty - 8, 4, CONFIG.TILE_SIZE + 8);
                    this.ctx.fillStyle = '#eee'; 
                    this.ctx.fillRect(tx + 4, ty - 8, CONFIG.TILE_SIZE - 8, 8);
                }
                else if (id === TILES.CROP_SEED.id || id === TILES.CROP_GROWING.id || id === TILES.CROP_READY.id) {
                    this.drawCrop(tx, ty, id);
                }
                else if (id === TILES.TORCH.id) {
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(tx + 14, ty + 10, 4, 12); 
                    this.ctx.fillStyle = '#ffaa00';
                    const flicker = Math.random() * 2;
                    this.ctx.beginPath();
                    this.ctx.arc(tx + 16, ty + 8, 4 + flicker, 0, Math.PI*2);
                    this.ctx.fill();
                }
                else if (id === TILES.FURNACE.id) {
                    this.drawFurnace(tx, ty);
                }
                else if (tile.solid && !tile.isWater && !tile.isTower && id !== TILES.WALL.id && id !== TILES.WOOD_WALL.id && id !== TILES.WOOD_RAIL.id && id !== TILES.GREY.id && id !== TILES.FURNACE.id) {
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty, 4, CONFIG.TILE_SIZE); 
                    this.ctx.fillRect(tx, ty + CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE, 4); 
                }

                if (tile.hp) {
                    const tileKey = `${c},${r}`;
                    const tileData = this.game.world.tileData[tileKey];
                    if (tileData && tileData.dmg > 0) {
                        const max = tile.hp;
                        const w = 24; const h = 4;
                        const bx = tx + 4; const by = ty - 12;
                        this.ctx.fillStyle = '#000';
                        this.ctx.fillRect(bx-1, by-1, w+2, h+2);
                        this.ctx.fillStyle = '#f00';
                        this.ctx.fillRect(bx, by, w, h);
                        this.ctx.fillStyle = '#0f0';
                        this.ctx.fillRect(bx, by, w * ((max - tileData.dmg) / max), h);
                    }
                }

                if (this.game.harvestTargetTile && this.game.harvestTargetTile.gx === c && this.game.harvestTargetTile.gy === r) {
                    this.drawHarvestTargetHighlight(tx, ty);
                }
            }

            if (rowBuckets[r]) {
                rowBuckets[r].forEach(obj => {
                    if (obj._type === 'boat') {
                        const stats = obj._orig.boatStats || { heading: 0 };
                        this.drawBoat(obj.x, obj.y, stats.heading, obj._orig.owner, obj._orig.hp, obj._orig.maxHp, obj._orig, obj._orig.subtype);
                    } else if (obj._type === 'loot') {
                        const gx = Math.floor(obj.x / CONFIG.TILE_SIZE);
                        const gy = Math.floor(obj.y / CONFIG.TILE_SIZE);
                        const tileId = this.game.world.getTile(gx, gy);
                        const isWater = (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id);
                        const bob = Math.sin((Date.now()/200) + obj.bob) * 3;

                        if (isWater) {
                            this.ctx.save();
                            this.ctx.translate(obj.x, obj.y + bob);
                            this.ctx.rotate(Math.sin((Date.now()/500) + obj.bob) * 0.2);
                            this.ctx.fillStyle = '#CD853F'; 
                            this.ctx.fillRect(-8, -8, 16, 16);
                            this.ctx.strokeStyle = '#5C3317';
                            this.ctx.lineWidth = 2;
                            this.ctx.strokeRect(-8, -8, 16, 16);
                            this.ctx.beginPath();
                            this.ctx.moveTo(-8,-8); this.ctx.lineTo(8,8);
                            this.ctx.moveTo(8,-8); this.ctx.lineTo(-8,8);
                            this.ctx.stroke();
                            this.ctx.restore();
                        } else {
                            if (ID_TO_TILE[obj.id]) {
                                const lx = obj.x - 6;
                                const ly = obj.y - 6 + bob;
                                const lw = 12;
                                this.ctx.fillStyle = ID_TO_TILE[obj.id].color;
                                this.ctx.fillRect(lx, ly, lw, lw);
                                this.ctx.strokeStyle = '#000';
                                this.ctx.lineWidth = 1;
                                this.ctx.strokeRect(lx, ly, lw, lw);
                            }
                        }

                    } else if (obj._type === 'sheep') {
                        this.drawSheep(obj._orig); 
                    } else if (obj._type === 'player' || obj._type === 'peer') { 
                        const isPlayer = obj._type === 'player';
                        if (obj._orig.inBoat) {
                            const heading = (obj._orig.boatStats && obj._orig.boatStats.heading !== undefined) ? obj._orig.boatStats.heading : 0;
                            // Assume Sloop if not specified for players currently
                            const subtype = obj._orig.subtype || 'sloop';
                            this.drawBoat(obj.x, obj.y, heading, 'player', obj._orig.hp, 100, obj._orig, subtype);
                            
                            this.ctx.save();
                            this.ctx.translate(obj.x, obj.y);
                            this.ctx.rotate(heading + Math.PI/2); 
                            this.ctx.fillStyle = isPlayer ? '#3498db' : '#2ecc71';
                            this.ctx.fillRect(-4, -4, 8, 8); 
                            this.ctx.restore();
                        } else {
                            this.drawCharacter(obj._orig, isPlayer); 
                            if (!isPlayer && obj._orig.name) {
                                this.ctx.fillStyle = '#2ecc71';
                                this.ctx.font = 'bold 10px monospace';
                                this.ctx.textAlign = 'center';
                                this.ctx.fillText(obj._orig.name, obj.x, obj.y - 25);
                                this.drawHealth(obj._orig);
                            }
                        }
                    } else if (obj._type === 'npc') {
                         this.drawCharacter(obj._orig, false, true); 
                    } else if (obj._type === 'worker') {
                         this.drawWorker(obj._orig);
                    } else {
                        this.drawCharacter(obj._orig, false); 
                    }
                });
            }
        }

        this.ctx.fillStyle = '#fff';
        this.game.projectiles.forEach(p => {
            if(p.draw) p.draw(this.ctx, 0, 0); 
        });

        this.game.particles.draw(this.ctx); 

        // Proximity hints on docked player boats
        if (!this.game.player.inBoat && !this.game.isRespawning) {
            const p = this.game.player;
            for (const b of this.game.boats) {
                if (b.owner !== 'player') continue;
                const dx = p.x - b.x, dy = p.y - b.y;
                if (dx * dx + dy * dy > 120 * 120) continue;

                this.ctx.font = 'bold 9px monospace';
                this.ctx.textAlign = 'center';
                const baseY = b.y + 28;

                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                this.ctx.fillRect(b.x - 60, baseY - 9, 120, 47);

                this.ctx.fillStyle = '#fff';
                this.ctx.fillText('Right-click: Board', b.x, baseY);
                this.ctx.fillStyle = '#aaa';
                this.ctx.fillText('Wood\u2192Repair', b.x, baseY + 11);
                this.ctx.fillText('Iron\u2192Hull  Wool\u2192Sails', b.x, baseY + 22);
                this.ctx.fillText('Gold\u2192Cannons', b.x, baseY + 33);
                break;
            }
        }

        if (!this.game.player.inBoat && !this.game.isRespawning) {
            const p = this.game.player;
            const pgx = Math.floor(p.x / CONFIG.TILE_SIZE);
            const pgy = Math.floor(p.y / CONFIG.TILE_SIZE);
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    if (this.game.world.getTile(pgx + dx, pgy + dy) === TILES.FURNACE.id) {
                        const fx = (pgx + dx) * CONFIG.TILE_SIZE + 16;
                        const fy = (pgy + dy) * CONFIG.TILE_SIZE + 16;
                        this.ctx.font = 'bold 9px monospace';
                        this.ctx.textAlign = 'center';
                        const baseY = fy - 20;
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(fx - 65, baseY - 9, 130, 36);
                        this.ctx.fillStyle = '#ffd700';
                        this.ctx.fillText('FURNACE', fx, baseY);
                        this.ctx.fillStyle = '#aaa';
                        this.ctx.fillText('Wood sel: 10Wod+5Stn\u21921Irn', fx, baseY + 11);
                        this.ctx.fillText('Stone sel: 100Wod+50Stn\u21921Gld', fx, baseY + 22);
                        dx = 99; dy = 99;
                    }
                }
            }
        }

        if (this.game.activeBlueprint) {
            const mx = (this.game.input.mouse.x / this.game.zoom) + this.game.camera.x;
            const my = (this.game.input.mouse.y / this.game.zoom) + this.game.camera.y;
            const gx = Math.floor(mx / CONFIG.TILE_SIZE);
            const gy = Math.floor(my / CONFIG.TILE_SIZE);
            
            this.ctx.globalAlpha = 0.5;
            this.game.activeBlueprint.structure.forEach(part => {
                const tile = ID_TO_TILE[part.id];
                this.ctx.fillStyle = tile.color;
                this.ctx.fillRect((gx + part.x) * CONFIG.TILE_SIZE, (gy + part.y) * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            });
            this.ctx.globalAlpha = 1.0;
            
            this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(this.game.player.x, this.game.player.y, CONFIG.BUILD_RANGE, 0, 6.28);
            this.ctx.stroke();
        }

        this.drawWorldPings();

        this.ctx.restore(); 

        this.renderLighting();

        if (this.game.particles.windParticles) {
            this.game.particles.windParticles.forEach(p => p.draw(this.ctx, this.game.world.wind.angle));
        }

        this.ctx.font = "bold 14px monospace";
        this.ctx.textAlign = 'left';
        this.ctx.save();
        this.ctx.scale(this.game.zoom, this.game.zoom);
        this.ctx.translate(-this.game.camera.x, -this.game.camera.y);
        
        if (this.game.particles.texts) {
            this.game.particles.texts.forEach(t => {
                this.ctx.fillStyle = t.col;
                this.ctx.fillText(t.txt, t.x, t.y);
            });
        }
        this.ctx.restore();
    }

    drawWorldPings() {
        const pings = this.game.pings;
        if (!pings || !pings.length) return;
        const now = Date.now();
        const max = CONFIG.MINIMAP.PING_MS;

        pings.forEach(ping => {
            const age = now - ping.t;
            if (age > max) return;
            const alpha = 1 - age / max;
            const pulse = 10 + Math.sin(now * 0.015) * 6;
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0.15, alpha);
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ping.x, ping.y, pulse, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(ping.x, ping.y - 18);
            this.ctx.lineTo(ping.x, ping.y - 4);
            this.ctx.stroke();
            this.ctx.fillStyle = '#ffd700';
            this.ctx.beginPath();
            this.ctx.arc(ping.x, ping.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 11px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ping.name || 'PING', ping.x, ping.y - 22);
            this.ctx.restore();
        });
    }

    drawHarvestTargetHighlight(tx, ty) {
        const t = Date.now();
        const pulse = 0.38 + Math.sin(t * 0.008) * 0.22;
        const ts = CONFIG.TILE_SIZE;
        this.ctx.save();

        this.ctx.fillStyle = `rgba(255, 210, 90, ${pulse * 0.28})`;
        this.ctx.fillRect(tx, ty, ts, ts);

        const dashOffset = (t * 0.04) % 18;
        this.ctx.strokeStyle = `rgba(255, 215, 0, ${pulse + 0.35})`;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 4]);
        this.ctx.lineDashOffset = -dashOffset;
        this.ctx.strokeRect(tx + 1.5, ty + 1.5, ts - 3, ts - 3);
        this.ctx.setLineDash([]);

        const cx = tx + ts / 2;
        const cy = ty + ts / 2;
        const hitFlash = Math.sin(t * 0.012) > 0.85;
        if (hitFlash) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            this.ctx.fillRect(tx, ty, ts, ts);
        }

        const cracks = 3;
        this.ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 + pulse * 0.12})`;
        this.ctx.lineWidth = 1;
        for (let i = 0; i < cracks; i++) {
            const sx = cx + Math.cos(i * 2.1 + 0.5) * 4;
            const sy = cy + Math.sin(i * 2.1 + 0.5) * 4;
            const ex = sx + Math.cos(i * 2.1) * (6 + pulse * 4);
            const ey = sy + Math.sin(i * 2.1) * (6 + pulse * 4);
            this.ctx.beginPath();
            this.ctx.moveTo(sx, sy);
            this.ctx.lineTo(ex, ey);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawBridgeWalls(tx, ty, c, r) {
        const ts = CONFIG.TILE_SIZE;
        const world = this.game.world;
        
        const isWater = (id) => id === TILES.WATER.id || id === TILES.DEEP_WATER.id;
        
        const n = world.getTile(c, r - 1);
        const s = world.getTile(c, r + 1);
        const w = world.getTile(c - 1, r);
        const e = world.getTile(c + 1, r);

        const woodDark = '#5C3317';
        const woodLight = '#8B4513';

        const drawRail = (x, y, w, h, isVertical) => {
            this.ctx.fillStyle = woodDark;
            this.ctx.fillRect(x, y, w, h);
            
            this.ctx.fillStyle = woodLight;
            if (isVertical) {
                this.ctx.fillRect(x + 1, y, w - 2, h);
            } else {
                this.ctx.fillRect(x, y + 1, w, h - 2);
            }
        };

        if (isWater(n)) drawRail(tx, ty, ts, 4, false);
        if (isWater(s)) drawRail(tx, ty + ts - 4, ts, 4, false);
        if (isWater(w)) drawRail(tx, ty, 4, ts, true);
        if (isWater(e)) drawRail(tx + ts - 4, ty, 4, ts, true);
        
        this.ctx.fillStyle = '#3E2723';
        if (isWater(n) || isWater(w)) this.ctx.fillRect(tx, ty, 4, 4);
        if (isWater(n) || isWater(e)) this.ctx.fillRect(tx + ts - 4, ty, 4, 4);
        if (isWater(s) || isWater(w)) this.ctx.fillRect(tx, ty + ts - 4, 4, 4);
        if (isWater(s) || isWater(e)) this.ctx.fillRect(tx + ts - 4, ty + ts - 4, 4, 4);
    }

    drawRoad(tx, ty, c, r) {
        const ts = CONFIG.TILE_SIZE;
        const seed = this.game.world.seed;
        const w = this.game.world;

        // Dirt mortar base
        this.ctx.fillStyle = '#5a4e3c';
        this.ctx.fillRect(tx, ty, ts, ts);

        // Cobblestones
        const layout = [
            { x: 1, y: 1, w: 14, h: 9 },
            { x: 17, y: 1, w: 14, h: 9 },
            { x: 1, y: 12, w: 9, h: 8 },
            { x: 12, y: 12, w: 19, h: 8 },
            { x: 1, y: 22, w: 19, h: 9 },
            { x: 22, y: 22, w: 9, h: 9 },
        ];

        for (let i = 0; i < layout.length; i++) {
            const s = layout[i];
            const n = Utils.noise(c * 6 + i, r * 6 + i * 7, seed);
            const v = 115 + Math.floor(n * 35);
            this.ctx.fillStyle = `rgb(${v + 8},${v + 4},${v - 6})`;
            this.ctx.fillRect(tx + s.x, ty + s.y, s.w, s.h);

            this.ctx.fillStyle = 'rgba(255,255,255,0.12)';
            this.ctx.fillRect(tx + s.x, ty + s.y, s.w, 1);
            this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
            this.ctx.fillRect(tx + s.x, ty + s.y + s.h - 1, s.w, 1);
        }

        // Dirt specks in mortar gaps
        const n1 = Utils.noise(c * 3, r * 5, seed);
        const n2 = Utils.noise(c * 5, r * 3, seed);
        this.ctx.fillStyle = '#4a3f30';
        this.ctx.fillRect(tx + 6 + Math.floor(n1 * 8), ty + 10, 2, 2);
        this.ctx.fillRect(tx + 18 + Math.floor(n2 * 6), ty + 20, 2, 2);

        const hasN = w.getTile(c, r - 1) === TILES.ROAD.id;
        const hasS = w.getTile(c, r + 1) === TILES.ROAD.id;
        const hasW = w.getTile(c - 1, r) === TILES.ROAD.id;
        const hasE = w.getTile(c + 1, r) === TILES.ROAD.id;

        const nv = Utils.noise(c * 7, r * 7, seed);
        const dark = '#1e5a22';
        const mid = 'rgba(45,110,50,0.6)';
        const light = 'rgba(58,138,58,0.4)';

        if (!hasN) {
            this.ctx.fillStyle = dark;
            this.ctx.fillRect(tx, ty, ts, 2);
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(tx + 4, ty, 10, 4);
            this.ctx.fillRect(tx + 20, ty, 8, 3);
            this.ctx.fillStyle = light;
            this.ctx.fillRect(tx + 6 + Math.floor(nv * 8), ty, 4, 5);
        }
        if (!hasS) {
            this.ctx.fillStyle = dark;
            this.ctx.fillRect(tx, ty + ts - 2, ts, 2);
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(tx + 8, ty + ts - 4, 12, 4);
            this.ctx.fillRect(tx + 2, ty + ts - 3, 6, 3);
            this.ctx.fillStyle = light;
            this.ctx.fillRect(tx + 18 + Math.floor(nv * 6), ty + ts - 5, 4, 5);
        }
        if (!hasW) {
            this.ctx.fillStyle = dark;
            this.ctx.fillRect(tx, ty, 2, ts);
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(tx, ty + 4, 4, 8);
            this.ctx.fillRect(tx, ty + 18, 3, 10);
            this.ctx.fillStyle = light;
            this.ctx.fillRect(tx, ty + 8 + Math.floor(nv * 6), 5, 4);
        }
        if (!hasE) {
            this.ctx.fillStyle = dark;
            this.ctx.fillRect(tx + ts - 2, ty, 2, ts);
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(tx + ts - 4, ty + 6, 4, 10);
            this.ctx.fillRect(tx + ts - 3, ty + 22, 3, 6);
            this.ctx.fillStyle = light;
            this.ctx.fillRect(tx + ts - 5, ty + 14 + Math.floor(nv * 4), 5, 4);
        }
    }

    drawStoneWall(tx, ty, color, c, r) { 
        const ts = CONFIG.TILE_SIZE; 
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(tx, ty, ts, ts);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(tx + 2, ty + 2, 12, 8);
        this.ctx.fillRect(tx + 16, ty + 2, 14, 8);
        this.ctx.fillRect(tx + 2, ty + 12, 8, 8);
        this.ctx.fillRect(tx + 12, ty + 12, 18, 8);
        this.ctx.fillRect(tx + 2, ty + 22, 18, 8);
        this.ctx.fillRect(tx + 22, ty + 22, 8, 8);
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        this.ctx.fillRect(tx, ty + ts - 4, ts, 4); 
    }

    drawWoodFence(tx, ty, c, r, isOpen) { 
        const ts = CONFIG.TILE_SIZE;
        this.ctx.fillStyle = '#5C3317';
        if (isOpen) {
            this.ctx.fillRect(tx, ty, 6, ts);
            this.ctx.fillRect(tx + ts - 6, ty, 6, ts);
        } else {
            this.ctx.fillRect(tx + 4, ty + 4, 6, ts - 4);
            this.ctx.fillRect(tx + 22, ty + 4, 6, ts - 4);
            this.ctx.fillRect(tx, ty + 8, ts, 4);
            this.ctx.fillRect(tx, ty + 20, ts, 4);
            this.ctx.fillStyle = '#3E2723';
            this.ctx.fillRect(tx + 3, ty + 2, 8, 2);
            this.ctx.fillRect(tx + 21, ty + 2, 8, 2);
        } 
    }

    drawTower(tx, ty, color, c, r, id) { 
        const ts = CONFIG.TILE_SIZE;
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(tx, ty - 8, ts, ts + 8);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(tx, ty, ts, ts);
        this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
        this.ctx.fillRect(tx + 4, ty + 8, ts - 8, 2);
        this.ctx.fillRect(tx + 4, ty + 20, ts - 8, 2);
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(tx + ts / 2 - 2, ty + 10, 4, 12);
        const topY = ty - 12;
        this.ctx.fillStyle = (id === TILES.TOWER_BASE_GOLD.id ? '#FDD835' : (id === TILES.TOWER_BASE_IRON.id ? '#555' : '#888'));
        this.ctx.fillRect(tx - 2, topY, ts + 4, ts);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(tx - 2, topY - 4, 6, 6);
        this.ctx.fillRect(tx + ts - 4, topY - 4, 6, 6);
        this.ctx.fillRect(tx - 2, topY + ts - 4, 6, 6);
        this.ctx.fillRect(tx + ts - 4, topY + ts - 4, 6, 6);
        this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        this.ctx.strokeRect(tx - 2, topY, ts + 4, ts);
        
        const cannon = this.game.cannons && this.game.cannons.find(can => can.key === `${c},${r}`);
        if (cannon) {
            this.ctx.fillStyle = cannon.ammo > 0 ? '#0ff' : '#f00';
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(cannon.ammo, tx + 10, ty + 20);
        } 
    }

    drawFurnace(tx, ty) {
        const ts = CONFIG.TILE_SIZE;
        this.ctx.fillStyle = '#5C3317';
        this.ctx.fillRect(tx, ty, ts, ts);
        this.ctx.fillStyle = '#8B4500';
        this.ctx.fillRect(tx + 2, ty + 2, ts - 4, ts - 4);
        this.ctx.fillStyle = '#6B3500';
        this.ctx.fillRect(tx + 4, ty + 4, ts - 8, 6);
        this.ctx.fillRect(tx + 4, ty + ts - 10, ts - 8, 6);
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(tx + 8, ty + 12, ts - 16, 10);
        const flicker = Math.sin(Date.now() * 0.008) * 2;
        this.ctx.fillStyle = '#ff4400';
        this.ctx.fillRect(tx + 10, ty + 14 + flicker, 4, 6);
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.fillRect(tx + 16, ty + 15 + flicker, 3, 5);
        this.ctx.fillStyle = '#ff6600';
        this.ctx.fillRect(tx + 21, ty + 14 - flicker, 3, 6);
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(tx + ts - 4, ty, 4, ts);
        this.ctx.fillRect(tx, ty + ts - 4, ts, 4);
    }

    drawBoulder(tx, ty, c, r) { 
        this.ctx.fillStyle = TILES.GRASS.color;
        this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        const shapeR = Utils.noise(c, r, this.game.world.seed + 777);
        const baseColor = Utils.hsl(0, 0, 55, c, r, this.game.world.seed, 0, 10);
        this.ctx.fillStyle = baseColor;
        if (shapeR < 0.33) {
            this.ctx.fillRect(tx + 4, ty + 4, 24, 24);
            this.ctx.fillRect(tx + 2, ty + 8, 4, 16);
            this.ctx.fillRect(tx + 26, ty + 8, 4, 16);
            this.ctx.fillRect(tx + 8, ty + 2, 16, 4);
            this.ctx.fillRect(tx + 8, ty + 26, 16, 4);
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.fillRect(tx + 8, ty + 6, 8, 4);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fillRect(tx + 8, ty + 22, 16, 6);
        } else if (shapeR < 0.66) {
            this.ctx.fillRect(tx + 2, ty + 12, 28, 18);
            this.ctx.fillRect(tx + 6, ty + 8, 20, 4);
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.fillRect(tx + 6, ty + 8, 20, 2);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fillRect(tx + 22, ty + 12, 8, 18);
        } else {
            this.ctx.fillRect(tx + 2, ty + 14, 12, 14);
            this.ctx.fillRect(tx + 12, ty + 6, 18, 22);
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.fillRect(tx + 14, ty + 6, 10, 4);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fillRect(tx + 8, ty + 20, 6, 8);
        } 
    }

    drawCrop(tx, ty, id) {
        const ts = CONFIG.TILE_SIZE;
        const cx = tx + ts / 2;
        const cy = ty + ts / 2;
        if (id === TILES.CROP_SEED.id) {
            this.ctx.fillStyle = '#5c3a1e';
            this.ctx.fillRect(cx - 1, cy + 2, 2, 8);
            this.ctx.fillStyle = '#2d6e1e';
            this.ctx.fillRect(cx - 4, cy - 3, 8, 6);
        } else if (id === TILES.CROP_GROWING.id) {
            this.ctx.fillStyle = '#5c3a1e';
            this.ctx.fillRect(cx - 1, cy - 2, 2, 14);
            this.ctx.fillStyle = '#3d8e2e';
            this.ctx.fillRect(cx - 8, cy - 4, 8, 5);
            this.ctx.fillRect(cx, cy - 2, 8, 5);
            this.ctx.fillRect(cx - 3, cy - 8, 6, 6);
        } else if (id === TILES.CROP_READY.id) {
            this.ctx.fillStyle = '#5c3a1e';
            this.ctx.fillRect(cx - 1, cy - 4, 2, 16);
            this.ctx.fillStyle = '#4a9c3f';
            this.ctx.fillRect(cx - 10, cy - 5, 10, 7);
            this.ctx.fillRect(cx, cy - 3, 10, 7);
            this.ctx.fillStyle = '#daa520';
            this.ctx.fillRect(cx - 6, cy - 12, 12, 8);
            this.ctx.fillStyle = '#c89418';
            this.ctx.fillRect(cx - 3, cy - 10, 2, 3);
            this.ctx.fillRect(cx + 1, cy - 10, 2, 3);
        }
    }

    drawTree(tx, ty, c, r, rowBuckets) { 
        let isOccluding = false;
        if (rowBuckets && rowBuckets[r] && rowBuckets[r].some(e => Math.floor(e.x / CONFIG.TILE_SIZE) === c)) {
            isOccluding = true;
        }
        
        this.ctx.globalAlpha = isOccluding ? 0.4 : 1.0;
        this.ctx.fillStyle = '#3E2723';
        this.ctx.fillRect(tx + 12, ty - 8, 8, 24);
        const leafColor = Utils.hsl(120, 50, 30, c, r, this.game.world.seed, 10, 5);
        this.ctx.fillStyle = leafColor;
        const shapeR = Utils.noise(c, r, this.game.world.seed + 555);
        
        if (shapeR < 0.33) {
            this.ctx.fillRect(tx, ty - 24, 32, 24);
            this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
            this.ctx.fillRect(tx + 4, ty - 20, 24, 16);
        } else if (shapeR < 0.66) {
            this.ctx.fillRect(tx + 2, ty - 16, 28, 16);
            this.ctx.fillRect(tx + 6, ty - 30, 20, 14);
            this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
            this.ctx.fillRect(tx + 8, ty - 26, 16, 22);
        } else {
            this.ctx.fillRect(tx - 2, ty - 20, 36, 20);
            this.ctx.fillRect(tx + 6, ty - 26, 20, 6);
            this.ctx.fillStyle = 'rgba(0, 60, 0, 0.3)';
            this.ctx.fillRect(tx + 4, ty - 16, 24, 12);
        }
        this.ctx.globalAlpha = 1.0; 
    }

    renderIcon(targetCtx, id, special) {
        const origCtx = this.ctx;
        this.ctx = targetCtx;
        const ts = CONFIG.TILE_SIZE;
        const tile = ID_TO_TILE[id];

        if (special === 'bridge') {
            this.ctx.fillStyle = tile.color;
            this.ctx.fillRect(0, 0, ts, ts);
            const woodDark = '#5C3317';
            const woodLight = '#8B4513';
            this.ctx.fillStyle = woodDark;
            this.ctx.fillRect(0, 0, ts, 4);
            this.ctx.fillRect(0, ts - 4, ts, 4);
            this.ctx.fillRect(0, 0, 4, ts);
            this.ctx.fillRect(ts - 4, 0, 4, ts);
            this.ctx.fillStyle = woodLight;
            this.ctx.fillRect(0, 1, ts, 2);
            this.ctx.fillRect(0, ts - 3, ts, 2);
            this.ctx.fillRect(1, 0, 2, ts);
            this.ctx.fillRect(ts - 3, 0, 2, ts);
            this.ctx.fillStyle = '#3E2723';
            this.ctx.fillRect(0, 0, 4, 4);
            this.ctx.fillRect(ts - 4, 0, 4, 4);
            this.ctx.fillRect(0, ts - 4, 4, 4);
            this.ctx.fillRect(ts - 4, ts - 4, 4, 4);
        } else if (id === TILES.WALL.id) {
            this.drawStoneWall(0, 0, tile.color, 0, 0);
        } else if (id === TILES.WOOD_WALL.id || id === TILES.WOOD_WALL_OPEN.id) {
            this.drawWoodFence(0, 0, 0, 0, id === TILES.WOOD_WALL_OPEN.id);
        } else if (id === TILES.ROAD.id) {
            this.drawRoad(0, 0, 0, 0);
        } else if (id === TILES.WOOD_RAIL.id) {
            this.ctx.fillStyle = tile.color;
            this.ctx.fillRect(0, 0, ts, ts);
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(4, 4, ts - 8, ts - 8);
            this.ctx.fillStyle = tile.color;
            this.ctx.fillRect(8, 8, ts - 16, ts - 16);
        } else if (tile.isTower) {
            this.drawTower(0, 0, tile.color, 0, 0, id);
        } else if (id === TILES.TORCH.id) {
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(0, 0, ts, ts);
            this.ctx.fillStyle = '#555';
            this.ctx.fillRect(14, 10, 4, 12);
            this.ctx.fillStyle = '#ffaa00';
            this.ctx.fillRect(10, 2, 12, 10);
            this.ctx.fillStyle = '#ffcc33';
            this.ctx.fillRect(12, 4, 8, 6);
        } else if (id === TILES.CROP_SEED.id || id === TILES.CROP_GROWING.id || id === TILES.CROP_READY.id) {
            this.ctx.fillStyle = TILES.GRASS.color;
            this.ctx.fillRect(0, 0, ts, ts);
            this.drawCrop(0, 0, id);
        } else if (id === TILES.STONE_BLOCK.id) {
            this.drawBoulder(0, 0, 0, 0);
        } else if (id === TILES.BOAT.id || id === TILES.GALLEON.id) {
            const subtype = id === TILES.GALLEON.id ? 'galleon' : 'sloop';
            const specs = SHIP_SPECS[subtype];
            const layout = specs.layout;
            const rows = layout.length;
            const cols = layout[0].length;
            const cellW = ts / cols;
            const cellH = ts / rows;

            this.ctx.fillStyle = '#1a5c8a';
            this.ctx.fillRect(0, 0, ts, ts);

            // Hull outline
            this.ctx.fillStyle = '#3E2723';
            const pad = 1;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (layout[r][c] === 0) continue;
                    const x = Math.floor(c * cellW);
                    const y = Math.floor(r * cellH);
                    const w = Math.ceil(cellW);
                    const h = Math.ceil(cellH);
                    this.ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
                }
            }

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const type = layout[r][c];
                    if (type === 0) continue;
                    const t = ID_TO_TILE[type];
                    if (!t) continue;
                    const x = Math.floor(c * cellW);
                    const y = Math.floor(r * cellH);
                    const w = Math.ceil(cellW);
                    const h = Math.ceil(cellH);

                    this.ctx.fillStyle = t.color;
                    this.ctx.fillRect(x, y, w, h);

                    if (type === 40) {
                        this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
                        this.ctx.fillRect(x, y + Math.floor(h / 2), w, 1);
                    } else if (type === 42) {
                        this.ctx.fillStyle = '#3E2723';
                        this.ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
                        this.ctx.fillStyle = '#eee';
                        this.ctx.fillRect(x, y + Math.floor(h / 2) - 1, w, 2);
                    } else if (type === 43) {
                        this.ctx.fillStyle = '#111';
                        const cx = x + Math.floor(w / 2);
                        const cy = y + Math.floor(h / 2);
                        this.ctx.fillRect(cx - 1, cy - 1, 3, 3);
                    } else if (type === 44) {
                        this.ctx.fillStyle = '#3E2723';
                        this.ctx.fillRect(x + Math.floor(w / 2), y, 1, h);
                    }
                }
            }
        } else if (id === TILES.FURNACE.id) {
            this.drawFurnace(0, 0);
        } else if (id === TILES.WORKER.id) {
            this.ctx.fillStyle = '#2d6e32';
            this.ctx.fillRect(0, 0, ts, ts);
            this.ctx.fillStyle = '#d4a574';
            this.ctx.fillRect(12, 4, 8, 8);
            this.ctx.fillStyle = '#8B6914';
            this.ctx.fillRect(11, 2, 10, 4);
            this.ctx.fillStyle = '#c4a35a';
            this.ctx.fillRect(10, 12, 12, 10);
            this.ctx.fillStyle = '#8B7355';
            this.ctx.fillRect(10, 22, 12, 4);
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(12, 26, 4, 4);
            this.ctx.fillRect(16, 26, 4, 4);
            this.ctx.fillStyle = '#777';
            this.ctx.fillRect(22, 8, 3, 12);
            this.ctx.fillRect(22, 6, 5, 3);
        } else if (id === TILES.GREY.id) {
            this.ctx.fillStyle = tile.color;
            this.ctx.fillRect(0, 0, ts, ts);
        } else {
            this.ctx.fillStyle = tile.color;
            this.ctx.fillRect(0, 0, ts, ts);
            this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(0, 0, ts, ts);
        }

        this.ctx = origCtx;
    }

    drawHealth(e) { 
        if (e.hp >= e.maxHp || e.hp <= 0) return; 
        const w = 24, h = 4;
        const x = e.x - w / 2, y = e.y - CONFIG.TILE_SIZE / 2 - 8;
        this.ctx.fillStyle = '#300';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = '#0f0';
        this.ctx.fillRect(x, y, w * (Math.max(0, e.hp) / e.maxHp), h); 
    }

    drawBoat(x, y, heading, owner, hp, maxHp, boatData, subtype = 'sloop') { 
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(heading + Math.PI / 2);
        
        const specs = SHIP_SPECS[subtype] || SHIP_SPECS['sloop'];
        const layout = specs.layout;
        const rows = layout.length; 
        const cols = layout[0].length; 
        const ts = 16;
        const width = cols * ts;
        const height = rows * ts;
        const startX = -width / 2;
        const startY = -height / 2;

        this.ctx.fillStyle = '#3E2723'; 
        this.ctx.beginPath();
        this.ctx.moveTo(0, startY);
        this.ctx.quadraticCurveTo(width / 2 + 4, startY + height / 3, width / 2, startY + height - 8);
        this.ctx.quadraticCurveTo(width / 2, startY + height, 0, startY + height);
        this.ctx.quadraticCurveTo(-width / 2, startY + height, -width / 2, startY + height - 8);
        this.ctx.quadraticCurveTo(-width / 2 - 4, startY + height / 3, 0, startY);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke(); 

        this.ctx.fillStyle = '#5D4037';
        this.ctx.beginPath();
        this.ctx.moveTo(0, startY + 6);
        this.ctx.quadraticCurveTo(width / 2 - 2, startY + height / 3, width / 2 - 4, startY + height - 10);
        this.ctx.quadraticCurveTo(width / 2 - 4, startY + height - 4, 0, startY + height - 4);
        this.ctx.quadraticCurveTo(-width / 2 + 4, startY + height - 4, -width / 2 + 4, startY + height - 10);
        this.ctx.quadraticCurveTo(-width / 2 + 2, startY + height / 3, 0, startY + 6);
        this.ctx.fill();

        const hpPct = hp / maxHp;
        if (hpPct < 0.5) {
             const time = Date.now();
             for(let i=0; i<5; i++) {
                 const cycleDuration = 1000;
                 const offset = i * (cycleDuration / 5);
                 const t = (time + offset) % cycleDuration;
                 const pct = t / cycleDuration;
                 
                 const driftY = pct * 15; 
                 const driftX = Math.sin(t * 0.005) * 5;
                 const size = 4 + pct * 6;
                 const alpha = (1 - pct) * 0.6;

                 this.ctx.fillStyle = `rgba(100,100,100,${alpha})`;
                 this.ctx.beginPath();
                 this.ctx.arc(driftX, driftY, size, 0, Math.PI*2);
                 this.ctx.fill();
             }
             
             if (hpPct < 0.25) {
                const flicker = (Math.random() > 0.5) ? '#ff4400' : '#ffaa00';
                this.ctx.fillStyle = flicker;
                this.ctx.beginPath();
                this.ctx.arc(0, 5, 4 + Math.random()*2, 0, Math.PI*2);
                this.ctx.fill();
             }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const type = layout[r][c];
                const dx = startX + c * ts;
                const dy = startY + r * ts;
                
                if (type === 40 || type === 43 || type === 42) { 
                     this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
                     this.ctx.fillRect(dx, dy, 1, ts); 
                     this.ctx.fillRect(dx + ts/2, dy, 1, ts);
                     this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
                     this.ctx.fillRect(dx + 2, dy + 2, 1, 1);
                     this.ctx.fillRect(dx + ts - 2, dy + ts - 2, 1, 1);
                }

                if (type === 44) { 
                     this.ctx.fillStyle = '#5C3317';
                     this.ctx.beginPath();
                     this.ctx.moveTo(dx + ts/2, dy + ts);
                     this.ctx.lineTo(dx + ts/2, dy - 8); 
                     this.ctx.strokeStyle = '#3E2723';
                     this.ctx.lineWidth = 2;
                     this.ctx.stroke();
                } else if (type === 42) { 
                    this.ctx.fillStyle = '#3E2723';
                    this.ctx.fillRect(dx + 4, dy + 4, ts - 8, ts - 8);
                    this.drawSail(dx + ts/2, dy + ts/2, heading, owner);
                } else if (type === 43) {
                    const isLeft = (c < cols/2);
                    const side = isLeft ? -1 : 1;
                    this.drawCannon(dx + ts/2, dy + ts/2, side);
                }
            }
        }
        
        if (boatData && boatData.boatStats) {
             const stats = boatData.boatStats;
             const maxCd = specs.broadsideCooldown;
             const drawBar = (pct, xOff) => {
                 if (pct >= 0.99) return; // Full
                 const h = height;
                 const w = 4;
                 const fillH = h * pct;
                 this.ctx.fillStyle = '#333';
                 this.ctx.fillRect(xOff, -h/2, w, h);
                 this.ctx.fillStyle = '#ff0';
                 this.ctx.fillRect(xOff, -h/2 + (h-fillH), w, fillH);
             };
             if (stats.cooldownLeft > 0) drawBar(1 - (stats.cooldownLeft/maxCd), -width/2 - 8);
             if (stats.cooldownRight > 0) drawBar(1 - (stats.cooldownRight/maxCd), width/2 + 4);
        }

        this.ctx.restore();

        const totalMaxHp = boatData ? (SHIP_SPECS[subtype] || SHIP_SPECS['sloop']).hp + ((boatData.hullLevel || 0) * 50) : maxHp;
        this.drawHealth({ x, y, hp, maxHp: totalMaxHp });

        const hl = boatData ? (boatData.hullLevel || 0) : 0;
        const sl = boatData ? (boatData.sailLevel || 0) : 0;
        const cl = boatData ? (boatData.cannonLevel || 0) : 0;
        if (hl + sl + cl > 0) {
            let px = x - 12;
            const py = y - CONFIG.TILE_SIZE / 2 - 14;
            for (let i = 0; i < hl; i++) { this.ctx.fillStyle = '#aaa'; this.ctx.fillRect(px, py, 3, 3); px += 4; }
            for (let i = 0; i < sl; i++) { this.ctx.fillStyle = '#fff'; this.ctx.fillRect(px, py, 3, 3); px += 4; }
            for (let i = 0; i < cl; i++) { this.ctx.fillStyle = '#ffd700'; this.ctx.fillRect(px, py, 3, 3); px += 4; }
        }
    }

    drawCannon(cx, cy, side) { 
        this.ctx.save();
        this.ctx.translate(cx, cy);
        if (side === -1) this.ctx.rotate(-Math.PI/2);
        else this.ctx.rotate(Math.PI/2);
        
        this.ctx.fillStyle = '#3E2723';
        this.ctx.fillRect(-3, -3, 6, 6);
        
        this.ctx.fillStyle = '#111';
        this.ctx.beginPath();
        this.ctx.moveTo(-2, -2);
        this.ctx.lineTo(2, -2);
        this.ctx.lineTo(3, 8); 
        this.ctx.lineTo(-3, 8);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    drawSail(mastX, mastY, heading, owner) {
        this.ctx.save();
        this.ctx.translate(mastX, mastY);
        
        let windAngle = this.game.world.wind.angle;
        let boatAngle = heading + Math.PI/2;
        let relWind = windAngle - boatAngle;
        
        while (relWind <= -Math.PI) relWind += Math.PI*2;
        while (relWind > Math.PI) relWind -= Math.PI*2;

        let sailAngle = relWind * 0.8; 
        sailAngle = Math.max(-Math.PI/2, Math.min(Math.PI/2, sailAngle));

        this.ctx.rotate(sailAngle);
        
        this.ctx.fillStyle = '#5D4037'; 
        this.ctx.fillRect(-24, -2, 48, 4);
        
        const fullness = 10 + Math.sin(Date.now() / 200) * 2; 
        this.ctx.fillStyle = owner === 'enemy' ? '#222' : '#eee'; 
        this.ctx.beginPath();
        this.ctx.moveTo(-22, 0);
        this.ctx.quadraticCurveTo(0, -fullness - 20, 22, 0); 
        this.ctx.lineTo(22, 2);
        this.ctx.quadraticCurveTo(0, -fullness - 18, -22, 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#3E2723';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawSheep(obj) { 
        const isMoving = obj.moveTimer > 0 || (obj.isMoving);
        const tick = Date.now() * 0.015;
        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 2 : 0;
        
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(obj.x, obj.y + 6, 8, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        const bodyY = obj.y - 10 - bounceY;

        const legOffset1 = isMoving ? Math.sin(tick)*3 : 0;
        const legOffset2 = isMoving ? Math.sin(tick+Math.PI)*3 : 0;
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(obj.x - 6 + legOffset1, obj.y + 2, 3, 6);
        this.ctx.fillRect(obj.x + 3 + legOffset2, obj.y + 2, 3, 6);

        this.ctx.fillStyle = obj.fed ? '#ffcccc' : (obj.hasWool ? '#eeeeee' : '#aaaaaa');
        this.ctx.fillRect(obj.x - 10, bodyY, 20, 14);
        
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(obj.x + 8, bodyY - 2, 8, 8);
        
        this.drawHealth(obj); 
    }

    drawCharacter(obj, isPlayer, isEnemy = false) { 
        const isDead = obj.hp <= 0;

        this.ctx.save();
        if (isDead) {
            this.ctx.globalAlpha = 0.4;
        }

        let colorShirt, colorPants, colorSkin;

        if (isDead) {
            colorShirt = '#555555'; colorPants = '#333333'; colorSkin = '#777777';
        } else if (isEnemy) {
            const npcType = obj.npcType || 'raider';
            if (npcType === 'archer') {
                colorShirt = '#2d4a1e'; colorPants = '#1a3010'; colorSkin = '#2a2a22';
            } else if (npcType === 'brute') {
                colorShirt = '#4a1010'; colorPants = '#2a0808'; colorSkin = '#332222';
            } else {
                colorShirt = '#000000'; colorPants = '#111111'; colorSkin = '#222222';
            }
        } else {
            colorShirt = isPlayer ? '#3498db' : '#2ecc71';
            colorPants = isPlayer ? '#8B4513' : '#1e8449';
            colorSkin = isPlayer ? '#ffcc99' : '#e0b090';
        }

        let colorHelmet;
        if (isDead) colorHelmet = '#444';
        else if (isEnemy && obj.npcType === 'archer') colorHelmet = '#1a3010';
        else if (isEnemy && obj.npcType === 'brute') colorHelmet = '#2a0808';
        else if (isEnemy) colorHelmet = '#333';
        else colorHelmet = '#8B6F43';
        const isMoving = obj.isMoving;
        const tick = isMoving ? (obj.moveTime * 0.015) : (Date.now() * 0.005);
        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 1.5 : Math.sin(tick) * 0.5;
        
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(obj.x, obj.y + 12, 6, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        const BODY_W = (isEnemy && obj.npcType === 'brute') ? 20 : 16;
        const BODY_X = obj.x - BODY_W / 2;
        const torsoY = obj.y - 8 - bounceY;

        const stride = 4;
        const leg1Offset = isMoving ? Math.sin(tick) * stride : 0;
        const leg2Offset = isMoving ? Math.sin(tick + Math.PI) * stride : 0;
        this.ctx.fillStyle = '#333'; 
        this.ctx.fillRect(BODY_X + 2, obj.y + 10 + leg1Offset, 4, 4);
        this.ctx.fillRect(BODY_X + BODY_W - 6, obj.y + 10 + leg2Offset, 4, 4);
        
        this.ctx.fillStyle = colorPants;
        this.ctx.fillRect(BODY_X, obj.y + 4 - bounceY, BODY_W, 6);
        this.ctx.fillStyle = colorShirt;
        this.ctx.fillRect(BODY_X, torsoY, BODY_W, 15);
        
        const armSwing = 5;
        const arm1Offset = isMoving ? Math.sin(tick + Math.PI) * armSwing : 0;
        const arm2Offset = isMoving ? Math.sin(tick) * armSwing : 0;
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - 12, torsoY + 4 + arm1Offset, 4, 4);
        this.ctx.fillRect(obj.x + 8, torsoY + 4 + arm2Offset, 4, 4);
        
        const HEAD_SIZE = (isEnemy && obj.npcType === 'brute') ? 14 : 12;
        const HEAD_Y = torsoY - 14;
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - HEAD_SIZE / 2, HEAD_Y, HEAD_SIZE, HEAD_SIZE);
        this.ctx.fillStyle = colorHelmet;
        this.ctx.fillRect(obj.x - (HEAD_SIZE / 2 + 1), HEAD_Y - 4, HEAD_SIZE + 2, 6);
        
        const heldId = obj.activeMelee;
        const harvesting = isPlayer && this.game.harvestTargetTile && heldId === 'hand';
        if (harvesting && !isDead) {
            const toolSwing = Math.sin(Date.now() * 0.012) * 8;
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 2;
            const handX = obj.x + 10;
            const handY = torsoY + 4 + arm2Offset;
            this.ctx.beginPath();
            this.ctx.moveTo(handX, handY);
            this.ctx.lineTo(handX + 6 + toolSwing, handY - 12);
            this.ctx.stroke();
            this.ctx.fillStyle = '#777';
            this.ctx.fillRect(handX + 4 + toolSwing, handY - 14, 5, 4);
        }

        if ((heldId === TILES.SPEAR_WOOD.id || heldId === TILES.SPEAR_IRON.id) && !isDead) {
            this.ctx.strokeStyle = heldId === TILES.SPEAR_IRON.id ? '#aaa' : '#5C3317';
            this.ctx.lineWidth = 2;
            const spHandX = obj.x + 10;
            const spHandY = torsoY + 4 + arm2Offset;
            this.ctx.beginPath();
            this.ctx.moveTo(spHandX - 2, spHandY + 8);
            this.ctx.lineTo(spHandX + 8, spHandY - 16);
            this.ctx.stroke();
            this.ctx.fillStyle = '#888';
            this.ctx.fillRect(spHandX + 7, spHandY - 18, 3, 5);
        } else if ((heldId === TILES.SWORD_WOOD.id || heldId === TILES.SWORD_IRON.id) && !isDead) {
            this.ctx.strokeStyle = heldId === TILES.SWORD_IRON.id ? '#aaa' : '#5C3317';
            this.ctx.lineWidth = 3;
            const handX = obj.x + 10;
            const handY = torsoY + 6 + arm2Offset;
            this.ctx.beginPath();
            this.ctx.moveTo(handX, handY);
            this.ctx.lineTo(handX + 10, handY - 10);
            this.ctx.stroke();
        }

        const dir = obj.direction || { x: 0, y: 1 };
        let eyeX1 = obj.x - 5;
        let eyeX2 = obj.x + 2;
        if (dir.x > 0) { eyeX1 += 2; eyeX2 += 2; }
        if (dir.x < 0) { eyeX1 -= 2; eyeX2 -= 2; }
        
        if (dir.y >= -0.1 && !isDead) {
            this.ctx.fillStyle = isEnemy ? '#ff0000' : '#000000';
            this.ctx.fillRect(eyeX1, HEAD_Y + 4, 3, 3);
            this.ctx.fillRect(eyeX2, HEAD_Y + 4, 3, 3);
        }
        
        this.ctx.restore(); 
        this.drawHealth(obj); 
    }

    drawWorker(obj) {
        if (obj.hp <= 0) return;

        this.ctx.save();

        const colorShirt = '#c4a35a';
        const colorPants = '#8B7355';
        const colorSkin = '#d4a574';
        const colorHelmet = '#8B6914';

        const isMoving = obj.isMoving;
        const tick = isMoving ? (obj.moveTime * 0.015) : (Date.now() * 0.005);
        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 1.5 : Math.sin(tick) * 0.5;

        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(obj.x, obj.y + 12, 6, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        const BODY_W = 16;
        const BODY_X = obj.x - BODY_W / 2;
        const torsoY = obj.y - 8 - bounceY;

        const stride = 4;
        const leg1Offset = isMoving ? Math.sin(tick) * stride : 0;
        const leg2Offset = isMoving ? Math.sin(tick + Math.PI) * stride : 0;
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(BODY_X + 2, obj.y + 10 + leg1Offset, 4, 4);
        this.ctx.fillRect(BODY_X + BODY_W - 6, obj.y + 10 + leg2Offset, 4, 4);

        this.ctx.fillStyle = colorPants;
        this.ctx.fillRect(BODY_X, obj.y + 4 - bounceY, BODY_W, 6);
        this.ctx.fillStyle = colorShirt;
        this.ctx.fillRect(BODY_X, torsoY, BODY_W, 15);

        const armSwing = 5;
        const arm1Offset = isMoving ? Math.sin(tick + Math.PI) * armSwing : 0;
        const arm2Offset = isMoving ? Math.sin(tick) * armSwing : 0;
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - 12, torsoY + 4 + arm1Offset, 4, 4);
        this.ctx.fillRect(obj.x + 8, torsoY + 4 + arm2Offset, 4, 4);

        const HEAD_SIZE = 12;
        const HEAD_Y = torsoY - 14;
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - HEAD_SIZE / 2, HEAD_Y, HEAD_SIZE, HEAD_SIZE);
        this.ctx.fillStyle = colorHelmet;
        this.ctx.fillRect(obj.x - (HEAD_SIZE / 2 + 1), HEAD_Y - 4, HEAD_SIZE + 2, 6);

        if (obj.state === 'gathering') {
            const toolSwing = Math.sin(Date.now() * 0.01) * 8;
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 2;
            const handX = obj.x + 10;
            const handY = torsoY + 4 + arm2Offset;
            this.ctx.beginPath();
            this.ctx.moveTo(handX, handY);
            this.ctx.lineTo(handX + 6 + toolSwing, handY - 12);
            this.ctx.stroke();
            this.ctx.fillStyle = '#777';
            this.ctx.fillRect(handX + 4 + toolSwing, handY - 14, 5, 4);
        }

        const dir = obj.direction || { x: 0, y: 1 };
        let eyeX1 = obj.x - 5;
        let eyeX2 = obj.x + 2;
        if (dir.x > 0) { eyeX1 += 2; eyeX2 += 2; }
        if (dir.x < 0) { eyeX1 -= 2; eyeX2 -= 2; }

        if (dir.y >= -0.1) {
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(eyeX1, HEAD_Y + 4, 3, 3);
            this.ctx.fillRect(eyeX2, HEAD_Y + 4, 3, 3);
        }

        if (this.game.selectedWorker === obj) {
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.strokeRect(obj.x - 12, obj.y - 28, 24, 44);
            this.ctx.setLineDash([]);
        }

        this.ctx.restore();
        this.drawHealth(obj);
    }

    renderLighting() { 
        const ambient = this.game.world.getAmbientLight();
        if (ambient <= 0.05) return;
        
        this.shadowCtx.clearRect(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
        this.shadowCtx.globalCompositeOperation = 'source-over';
        this.shadowCtx.fillStyle = `rgba(0, 0, 0, ${ambient})`;
        this.shadowCtx.fillRect(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
        this.shadowCtx.globalCompositeOperation = 'destination-out';
        
        const toScreen = (wx, wy) => ({ x: (wx - this.game.camera.x) * this.game.zoom, y: (wy - this.game.camera.y) * this.game.zoom });
        
        const drawLight = (wx, wy, radius) => {
            const pos = toScreen(wx, wy);
            const r = radius * this.game.zoom;
            this.shadowCtx.drawImage(this.lightSprite, pos.x - r, pos.y - r, r * 2, r * 2);
        };

        drawLight(this.game.player.x, this.game.player.y, 150);
        Object.values(this.game.peers).forEach(p => {
             drawLight(p.x, p.y, 150);
        });
        this.game.boats.forEach(b => drawLight(b.x, b.y, 120));
        
        const startCol = Math.floor(this.game.camera.x / CONFIG.TILE_SIZE);
        const endCol = startCol + (this.canvas.width / this.game.zoom / CONFIG.TILE_SIZE) + 1;
        const startRow = Math.floor(this.game.camera.y / CONFIG.TILE_SIZE);
        const endRow = startRow + (this.canvas.height / this.game.zoom / CONFIG.TILE_SIZE) + 1;
        
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const id = this.game.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (tile && tile.light) {
                    drawLight(c * CONFIG.TILE_SIZE + 16, r * CONFIG.TILE_SIZE + 16, tile.light);
                }
            }
        }
        
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.drawImage(this.shadowCanvas, 0, 0);
        this.ctx.restore(); 
    }

}