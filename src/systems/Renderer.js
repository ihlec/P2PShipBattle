import { CONFIG, TILES, ID_TO_TILE, SHIP_LAYOUT } from '../config.js';
import Utils from '../utils.js';

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
        // 1. Clear Screen
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.game.zoom, this.game.zoom);
        this.ctx.translate(-this.game.camera.x, -this.game.camera.y);

        // 2. Culling Bounds
        const startCol = Math.floor(this.game.camera.x / CONFIG.TILE_SIZE);
        const endCol = startCol + (this.canvas.width / this.game.zoom / CONFIG.TILE_SIZE) + 1;
        const startRow = Math.floor(this.game.camera.y / CONFIG.TILE_SIZE);
        const endRow = startRow + (this.canvas.height / this.game.zoom / CONFIG.TILE_SIZE) + 1;

        // 3. Bucket Sort for Z-Indexing
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
        Object.values(this.game.peers).forEach(p => addToBucket(p, 'peer'));

        // --- PASS 1: GROUND LAYER ---
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
                
                if (id === TILES.WOOD_WALL_OPEN.id || id === TILES.WOOD_WALL.id || id === TILES.TORCH.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     const biome = Utils.getBiome(c, r, this.game.world.seed);
                     const bgTile = ID_TO_TILE[biome];
                     this.ctx.fillStyle = bgTile ? bgTile.color : '#000';
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }

                if (id === TILES.TREE.id || id === TILES.MOUNTAIN.id) {
                     const tx = c * CONFIG.TILE_SIZE;
                     const ty = r * CONFIG.TILE_SIZE;
                     this.ctx.fillStyle = TILES.GRASS.color; 
                     this.ctx.fillRect(tx, ty, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
            }
        }

        // --- PASS 2: OBJECTS & ENTITIES ---
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
                else if (id === TILES.TORCH.id) {
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(tx + 14, ty + 10, 4, 12); 
                    this.ctx.fillStyle = '#ffaa00';
                    const flicker = Math.random() * 2;
                    this.ctx.beginPath();
                    this.ctx.arc(tx + 16, ty + 8, 4 + flicker, 0, Math.PI*2);
                    this.ctx.fill();
                }
                else if (tile.solid && !tile.isWater && !tile.isTower && id !== TILES.WALL.id && id !== TILES.WOOD_WALL.id && id !== TILES.WOOD_RAIL.id && id !== TILES.GREY.id) {
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
            }

            if (rowBuckets[r]) {
                rowBuckets[r].forEach(obj => {
                    if (obj._type === 'boat') {
                        const stats = obj._orig.boatStats || { heading: 0 };
                        this.drawBoat(obj.x, obj.y, stats.heading, obj._orig.owner, obj._orig.hp, obj._orig.maxHp, obj._orig);
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
                            
                            // [FIX] Pass actual HP from entity (which is boat structure HP) instead of hardcoded 100
                            this.drawBoat(obj.x, obj.y, heading, 'player', obj._orig.hp, 100, obj._orig);
                            
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
                    } else if (obj._type === 'npc') {
                         this.drawCharacter(obj._orig, false, true); 
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
        const gridSize = 4;
        const stoneSize = ts / gridSize; 

        this.ctx.fillStyle = '#4a4a4a'; 
        this.ctx.fillRect(tx, ty, ts, ts);

        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const sx = tx + x * stoneSize + 1;
                const sy = ty + y * stoneSize + 1;
                const sw = stoneSize - 2; 
                const sh = stoneSize - 2;

                const noise = Utils.noise(c * 4 + x, r * 4 + y, this.game.world.seed);
                const shade = 100 + Math.floor(noise * 40); 
                
                this.ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
                this.ctx.fillRect(sx, sy, sw, sh);
                
                this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                this.ctx.fillRect(sx, sy, sw, 1);
                this.ctx.fillRect(sx, sy, 1, sh);
            }
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

        let mastX = 0, mastY = 0, hasMast = false;
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const type = SHIP_LAYOUT[r][c];
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
                    mastX = dx + ts / 2;
                    mastY = dy + ts / 2;
                    hasMast = true;
                }
            }
        }

        const cannonYPositions = [startY + ts * 1.8, startY + ts * 3, startY + ts * 4.2];
        
        this.ctx.fillStyle = '#111'; 
        const drawCannon = (cx, cy, side) => { 
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
        };

        cannonYPositions.forEach(cy => {
            drawCannon(startX + 4, cy, -1); 
            drawCannon(startX + width - 4, cy, 1); 
        });

        if (hasMast) {
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
        
        this.ctx.restore();
        this.drawHealth({ x, y, hp, maxHp }); 
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
        let colorShirt, colorPants, colorSkin;

        if (isEnemy) {
            colorShirt = '#000000'; colorPants = '#111111'; colorSkin = '#222222';
        } else {
            colorShirt = isPlayer ? '#3498db' : '#993333';
            colorPants = isPlayer ? '#8B4513' : '#654321';
            colorSkin = isPlayer ? '#ffcc99' : '#e0b090';
        }

        const colorHelmet = isEnemy ? '#333' : '#8B6F43';
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
        
        const heldId = obj.activeMelee;
        if ((heldId === TILES.SWORD_WOOD.id || heldId === TILES.SWORD_IRON.id)) {
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
        
        if (dir.y >= -0.1) {
            this.ctx.fillStyle = isEnemy ? '#ff0000' : '#000000';
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
            grad.addColorStop(1, "rgba(255, 255, 255, 0)");
            this.shadowCtx.fillStyle = grad;
            this.shadowCtx.beginPath();
            this.shadowCtx.arc(pos.x, pos.y, radius * this.game.zoom, 0, Math.PI * 2);
            this.shadowCtx.fill();
        };

        drawLight(this.game.player.x, this.game.player.y, 150);
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