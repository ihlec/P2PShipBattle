import { CONFIG, TILES, ID_TO_TILE, SHIP_LAYOUT } from './config.js';
import Utils from './utils.js';

export default class Renderer {
    constructor(game, canvas) {
        this.game = game;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.shadowCanvas = document.createElement('canvas');
        this.shadowCtx = this.shadowCanvas.getContext('2d');
        
        this.resize();
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
        addToBucket(this.game.player, 'player');
        this.game.loot.forEach(l => addToBucket(l, 'loot'));
        
        // Add Peers
        Object.values(this.game.peers).forEach(p => {
            addToBucket(p, 'peer');
        });

        // --- PASS 1: GROUND ---
        for (let r = startRow - 2; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const id = this.game.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;

                if ((!tile.solid || tile.isWater) && id !== TILES.TREE.id && id !== TILES.WOOD_WALL_OPEN.id && id !== TILES.TORCH.id) {
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
                
                if (id === TILES.WOOD_WALL_OPEN.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     const biome = Utils.getBiome(c, r, this.game.world.seed);
                     const bgTile = ID_TO_TILE[biome];
                     this.ctx.fillStyle = bgTile ? bgTile.color : '#000';
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }

                if (id === TILES.TREE.id || id === TILES.MOUNTAIN.id || id === TILES.TORCH.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     this.ctx.fillStyle = TILES.GRASS.color; 
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
            }
        }

        // --- PASS 2: OBJECTS & BUILDINGS ---
        for (let r = startRow - 2; r <= endRow; r++) { 
            for (let c = startCol; c <= endCol; c++) {
                const id = this.game.world.getTile(c, r);
                const tile = ID_TO_TILE[id];
                if (!tile) continue;
                
                const tx = c * CONFIG.TILE_SIZE;
                const ty = r * CONFIG.TILE_SIZE;

                if (id === TILES.GREY.id) this.ctx.fillStyle = tile.color;
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
                else if (id === TILES.TORCH.id) {
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(tx + 14, ty + 10, 4, 12); 
                    this.ctx.fillStyle = '#ffaa00';
                    const flicker = Math.random() * 2;
                    this.ctx.beginPath();
                    this.ctx.arc(tx + 16, ty + 8, 4 + flicker, 0, Math.PI*2);
                    this.ctx.fill();
                }
                else if (tile.solid && !tile.isWater && id !== TILES.MOUNTAIN.id && id !== TILES.STONE_BLOCK.id && !tile.isTower && id !== TILES.WALL.id && id !== TILES.WOOD_WALL.id && id !== TILES.WOOD_RAIL.id && id !== TILES.GREY.id) {
                    this.ctx.fillStyle = tile.color;
                    this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.fillRect(tx + CONFIG.TILE_SIZE - 4, ty, 4, CONFIG.TILE_SIZE); 
                    this.ctx.fillRect(tx, ty + CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE, 4); 
                    this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.strokeRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }

                if (tile.hp) {
                    const dmg = this.game.world.getTileDamage(c, r);
                    if (dmg > 0) {
                        const max = tile.hp;
                        const w = 24; const h = 4;
                        const bx = tx + 4; const by = ty - 12;
                        this.ctx.fillStyle = '#000';
                        this.ctx.fillRect(bx-1, by-1, w+2, h+2);
                        this.ctx.fillStyle = '#f00';
                        this.ctx.fillRect(bx, by, w, h);
                        this.ctx.fillStyle = '#0f0';
                        this.ctx.fillRect(bx, by, w * ((max - dmg) / max), h);
                    }
                }
            }

            // --- ENTITIES ---
            if (rowBuckets[r]) {
                rowBuckets[r].forEach(obj => {
                    if (obj._type === 'boat') {
                        this.drawBoat(obj.x, obj.y, obj._orig.boatStats.heading, obj._orig.owner, obj._orig.hp, obj._orig.maxHp, obj._orig);
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
                            this.ctx.fillStyle = ID_TO_TILE[obj.id].color;
                            this.ctx.fillRect(obj.x - 6, obj.y - 6 + bob, 12, 12);
                            this.ctx.strokeRect(obj.x - 6, obj.y - 6 + bob, 12, 12);
                        }

                    } else if (obj._type === 'sheep') {
                        this.drawSheep(obj._orig); 
                    } else if (obj._type === 'player' || obj._type === 'peer') { 
                        const isPlayer = obj._type === 'player';
                        if (obj._orig.inBoat) {
                            // [FIXED] Draw boat for BOTH player and peers.
                            // We use obj._orig.boatStats.heading if available, otherwise 0.
                            const heading = (obj._orig.boatStats && obj._orig.boatStats.heading !== undefined) ? obj._orig.boatStats.heading : 0;
                            
                            this.drawBoat(obj.x, obj.y, heading, 'player', 100, 100, obj._orig);
                            
                            this.ctx.save();
                            this.ctx.translate(obj.x, obj.y);
                            this.ctx.rotate(heading + Math.PI/2); 
                            this.ctx.fillStyle = isPlayer ? '#3498db' : '#993333';
                            this.ctx.fillRect(-4, -4, 8, 8); 
                            this.ctx.restore();
                        } else {
                            this.drawCharacter(obj._orig, isPlayer); 
                            if (!isPlayer && obj._orig.name) {
                                this.ctx.fillStyle = '#fff';
                                this.ctx.font = 'bold 10px monospace';
                                this.ctx.textAlign = 'center';
                                this.ctx.fillText(obj._orig.name, obj.x, obj.y - 25);
                                this.drawHealth(obj._orig);
                            }
                        }
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

        this.game.particles.forEach(p => p.draw(this.ctx, this.game.camera.x, this.game.camera.y)); 

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
        
        this.ctx.restore(); 

        this.renderLighting();

        this.game.windParticles.forEach(p => p.draw(this.ctx, this.game.world.wind.angle));

        this.ctx.font = "bold 14px monospace";
        this.ctx.textAlign = 'left';
        this.ctx.save();
        this.ctx.scale(this.game.zoom, this.game.zoom);
        this.ctx.translate(-this.game.camera.x, -this.game.camera.y);
        this.game.texts.forEach(t => {
            this.ctx.fillStyle = t.col;
            this.ctx.fillText(t.txt, t.x, t.y);
        });
        this.ctx.restore();
    }

    drawStoneWall(tx, ty, color, c, r) { 
        const ts = CONFIG.TILE_SIZE; 
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(tx, ty, ts, ts);
        this.ctx.fillStyle = color;
        const seed = c * 1000 + r;
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
        this.ctx.fillStyle = TILES.GRASS.color;
        this.ctx.fillRect(tx, ty, ts, ts);
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
        const cannon = this.game.cannons.find(can => can.key === `${c},${r}`);
        if (cannon) {
            this.ctx.fillStyle = cannon.ammo > 0 ? '#0ff' : '#f00';
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(cannon.ammo, tx + 10, ty + 20);
        } 
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

    drawTree(tx, ty, c, r, rowBuckets) { 
        let isOccluding = false;
        for (let checkR = r - 2; checkR < r; checkR++) {
            if (rowBuckets[checkR] && rowBuckets[checkR].some(e => Math.floor(e.x / CONFIG.TILE_SIZE) === c)) isOccluding = true;
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

    drawHealth(e) { 
        if (e.hp >= e.maxHp) return;
        const w = 24, h = 4;
        const x = e.x - w / 2, y = e.y - CONFIG.TILE_SIZE / 2 - 8;
        this.ctx.fillStyle = '#300';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = '#0f0';
        this.ctx.fillRect(x, y, w * (Math.max(0, e.hp) / e.maxHp), h); 
    }

    drawBoat(x, y, heading, owner, hp, maxHp, boatData) { 
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(heading + Math.PI / 2);
        const rows = SHIP_LAYOUT.length;
        const cols = SHIP_LAYOUT[0].length;
        const ts = 16;
        const startX = -(cols * ts) / 2;
        const startY = -(rows * ts) / 2;
        this.ctx.fillStyle = '#3E2723';
        this.ctx.beginPath();
        this.ctx.moveTo(0, startY);
        this.ctx.lineTo(startX + cols * ts, startY + ts);
        this.ctx.lineTo(startX + cols * ts, startY + rows * ts);
        this.ctx.lineTo(startX, startY + rows * ts);
        this.ctx.lineTo(startX, startY + ts);
        this.ctx.closePath();
        this.ctx.fill();
        let mastX = 0;
        let mastY = 0;
        let hasMast = false;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const type = SHIP_LAYOUT[r][c];
                const dx = startX + c * ts;
                const dy = startY + r * ts;
                if (type !== 0 && type !== 44) {
                    this.ctx.fillStyle = TILES.SHIP_DECK.color;
                    this.ctx.fillRect(dx, dy, ts, ts);
                    this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    this.ctx.fillRect(dx, dy + 4, ts, 1);
                    this.ctx.fillRect(dx, dy + 8, ts, 1);
                    this.ctx.fillRect(dx, dy + 12, ts, 1);
                }
                if (type === 44) {
                    this.ctx.fillStyle = TILES.SHIP_DECK.color;
                    this.ctx.beginPath();
                    this.ctx.moveTo(dx + ts / 2, dy);
                    this.ctx.lineTo(dx + ts, dy + ts);
                    this.ctx.lineTo(dx, dy + ts);
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.strokeStyle = '#5C3317';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(dx + ts / 2, dy + ts);
                    this.ctx.lineTo(dx + ts / 2, dy - 15);
                    this.ctx.stroke();
                    if (boatData && boatData.isMoving && Math.random() < 0.3) {
                        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                        this.ctx.beginPath();
                        this.ctx.arc(dx + ts / 2, dy - 10, Math.random() * 5 + 2, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                } else if (type === 41) {
                    this.ctx.fillStyle = TILES.SHIP_RAIL.color;
                    if (c === 0) this.ctx.fillRect(dx, dy, 4, ts);
                    if (c === 2) this.ctx.fillRect(dx + ts - 4, dy, 4, ts);
                } else if (type === 45) {
                    this.ctx.fillStyle = '#4E342E';
                    this.ctx.fillRect(dx, dy, ts, ts);
                    if (r === rows - 1) {
                        this.ctx.fillStyle = '#FFD700';
                        this.ctx.fillRect(dx + 4, dy + ts - 4, ts - 8, 2);
                    }
                } else if (type === 42) {
                    this.ctx.fillStyle = TILES.SHIP_MAST.color;
                    this.ctx.beginPath();
                    this.ctx.arc(dx + ts / 2, dy + ts / 2, 5, 0, Math.PI * 2);
                    this.ctx.fill();
                    mastX = dx + ts / 2;
                    mastY = dy + ts / 2;
                    hasMast = true;
                } else if (type === 43) {
                    this.ctx.fillStyle = '#000';
                    this.ctx.beginPath();
                    this.ctx.arc(dx + ts / 2, dy + ts / 2, 4, 0, Math.PI * 2);
                    this.ctx.fill();
                    if (c === 0) this.ctx.fillRect(dx - 2, dy + ts / 2 - 2, 8, 4);
                    else this.ctx.fillRect(dx + 8, dy + ts / 2 - 2, 8, 4);
                }
            }
        }
        if (hasMast) {
            this.ctx.save();
            this.ctx.translate(mastX, mastY);
            let windAngle = this.game.world.wind.angle;
            let diff = windAngle - heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            let sailRot = Math.max(-1.0, Math.min(1.0, diff));
            this.ctx.rotate(sailRot);
            this.ctx.fillStyle = '#5D4037';
            this.ctx.fillRect(-32, -2, 64, 4);
            this.ctx.fillStyle = owner === 'enemy' ? '#111' : '#eee';
            this.ctx.beginPath();
            this.ctx.moveTo(-30, 0);
            this.ctx.quadraticCurveTo(0, -25, 30, 0);
            this.ctx.lineTo(30, 2);
            this.ctx.quadraticCurveTo(0, -23, -30, 2);
            this.ctx.fill();
            this.ctx.restore();
        }
        this.ctx.restore();
        this.drawHealth({ x, y, hp, maxHp }); 
    }

    drawSheep(obj) { 
        const isMoving = obj.moveTimer > 0;
        const tick = isMoving ? (Date.now() * 0.015) : (Date.now() * 0.005);
        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 2 : 0;
        const breathe = !isMoving ? Math.sin(tick) * 0.5 : 0;
        
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(obj.x, obj.y + 6, 8, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        const bodyY = obj.y - 10 - bounceY - breathe;

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

    drawCharacter(obj, isPlayer) { 
        const colorShirt = isPlayer ? '#3498db' : '#993333';
        const colorPants = isPlayer ? '#8B4513' : '#654321';
        const colorSkin = isPlayer ? '#ffcc99' : '#e0b090';
        const colorHelmet = '#8B6F43';
        const colorBoots = '#333333';
        const isMoving = obj.isMoving;
        const tick = isMoving ? (obj.moveTime * 0.015) : (Date.now() * 0.005);
        const bounceY = isMoving ? Math.abs(Math.sin(tick)) * 1.5 : Math.sin(tick) * 0.5;
        const stride = 4;
        const leg1Offset = isMoving ? Math.sin(tick) * stride : 0;
        const leg2Offset = isMoving ? Math.sin(tick + Math.PI) * stride : 0;
        const armSwing = 5;
        const arm1Offset = isMoving ? Math.sin(tick + Math.PI) * armSwing : 0;
        const arm2Offset = isMoving ? Math.sin(tick) * armSwing : 0;
        const BODY_W = 16;
        const BODY_X = obj.x - BODY_W / 2;
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(obj.x, obj.y + 12, 6, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = colorBoots;
        this.ctx.fillRect(BODY_X + 2, obj.y + 10 + leg1Offset, 4, 4);
        this.ctx.fillRect(BODY_X + BODY_W - 6, obj.y + 10 + leg2Offset, 4, 4);
        const torsoY = obj.y - 8 - bounceY;
        this.ctx.fillStyle = colorPants;
        this.ctx.fillRect(BODY_X, obj.y + 4 - bounceY, BODY_W, 6);
        this.ctx.fillStyle = colorShirt;
        this.ctx.fillRect(BODY_X, torsoY, BODY_W, 15);
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - 12, torsoY + 4 + arm1Offset, 4, 4);
        this.ctx.fillRect(obj.x + 8, torsoY + 4 + arm2Offset, 4, 4);
        const HEAD_SIZE = 12;
        const HEAD_Y = torsoY - 14;
        this.ctx.fillStyle = colorSkin;
        this.ctx.fillRect(obj.x - HEAD_SIZE / 2, HEAD_Y, HEAD_SIZE, HEAD_SIZE);
        this.ctx.fillStyle = colorHelmet;
        this.ctx.fillRect(obj.x - (HEAD_SIZE / 2 + 1), HEAD_Y - 4, HEAD_SIZE + 2, 6);
        const heldId = obj.activeMelee;
        if ((heldId === TILES.SWORD_WOOD.id || heldId === TILES.SWORD_IRON.id) && isPlayer) {
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
        if (dir.y >= 0) {
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(eyeX1, HEAD_Y + 4, 3, 3);
            this.ctx.fillRect(eyeX2, HEAD_Y + 4, 3, 3);
        }
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
            if (pos.x < -radius || pos.y < -radius || pos.x > this.canvas.width + radius || pos.y > this.canvas.height + radius) return;
            const grad = this.shadowCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * this.game.zoom);
            grad.addColorStop(0, "rgba(255, 255, 255, 1)");
            grad.addColorStop(0.5, "rgba(255, 255, 255, 0.8)");
            grad.addColorStop(1, "rgba(255, 255, 255, 0)");
            this.shadowCtx.fillStyle = grad;
            this.shadowCtx.beginPath();
            this.shadowCtx.arc(pos.x, pos.y, radius * this.game.zoom, 0, Math.PI * 2);
            this.shadowCtx.fill();
        };
        drawLight(this.game.player.x, this.game.player.y, 150);
        this.game.boats.forEach(b => drawLight(b.x, b.y, 120));
        this.game.projectiles.forEach(p => { if (p.type === 'cannonball') drawLight(p.x, p.y, 40); });
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