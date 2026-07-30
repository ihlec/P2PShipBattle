import { CONFIG, TILES, ID_TO_TILE } from '../config.js';
import Utils from '../utils.js';

const GATHERABLE_TILES = new Set([
    TILES.TREE.id, TILES.MOUNTAIN.id, TILES.STONE_BLOCK.id,
    TILES.CROP_SEED.id, TILES.CROP_GROWING.id, TILES.CROP_READY.id
]);

const TILE_CATEGORY = {
    [TILES.TREE.id]: 'tree',
    [TILES.MOUNTAIN.id]: 'mountain',
    [TILES.STONE_BLOCK.id]: 'stone',
    [TILES.CROP_SEED.id]: 'crop',
    [TILES.CROP_GROWING.id]: 'crop',
    [TILES.CROP_READY.id]: 'crop',
};

function getResourceDrop(tileId) {
    if (tileId === TILES.TREE.id) {
        return Math.random() < 0.2
            ? { id: TILES.GREENS.id, qty: 1 }
            : { id: TILES.WOOD.id, qty: 3 };
    }
    if (tileId === TILES.MOUNTAIN.id) {
        const r = Math.random();
        if (r < 0.15) return { id: TILES.BLACK.id, qty: 1 };
        if (r < 0.35) return { id: TILES.IRON.id, qty: 1 };
        return { id: TILES.GREY.id, qty: 1 };
    }
    if (tileId === TILES.STONE_BLOCK.id) return { id: TILES.GREY.id, qty: 3 };
    if (tileId === TILES.CROP_READY.id) return { id: TILES.GREENS.id, qty: 2 };
    if (tileId === TILES.CROP_GROWING.id) return { id: TILES.GREENS.id, qty: 1 };
    if (tileId === TILES.CROP_SEED.id) return { id: TILES.GREENS.id, qty: 1 };
    return { id: tileId, qty: 1 };
}

export class Worker {
    constructor(x, y) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.hp = CONFIG.WORKER.HP;
        this.maxHp = CONFIG.WORKER.HP;
        this.type = 'worker';
        this.state = 'idle';
        this.target = null;
        this.gatherTimer = 0;
        this.isMoving = false;
        this.moveTime = 0;
        this.direction = { x: 0, y: 1 };
    }

    assignTarget(target, game) {
        this.target = target;
        this.state = 'moving';
        this.gatherTimer = 0;
        if (game) {
            this.gatherKind = target.type === 'sheep'
                ? 'sheep'
                : TILE_CATEGORY[game.world.getTile(target.gx, target.gy)] || null;
        }
    }

    updateAI(dt, game) {
        if (this.hp <= 0) return;

        if (this.state === 'idle') {
            this.isMoving = false;
            return;
        }

        if (this.state === 'moving') {
            this.moveToTarget(dt, game);
            return;
        }

        if (this.state === 'gathering') {
            this.isMoving = false;
            this.gatherTimer += dt;

            if (this.gatherTimer >= CONFIG.WORKER.GATHER_INTERVAL) {
                this.gatherTimer = 0;

                if (this.target.type === 'tile') {
                    this.gatherTile(game);
                } else if (this.target.type === 'sheep') {
                    this.gatherSheep(game);
                }
            }
        }
    }

    moveToTarget(dt, game) {
        if (!this.target) {
            this.state = 'idle';
            this.isMoving = false;
            return;
        }

        let tx, ty;
        if (this.target.type === 'tile') {
            tx = this.target.gx * CONFIG.TILE_SIZE + 16;
            ty = this.target.gy * CONFIG.TILE_SIZE + 16;

            const tileId = game.world.getTile(this.target.gx, this.target.gy);
            if (!GATHERABLE_TILES.has(tileId)) {
                this.isMoving = false;
                this.state = 'idle';
                this.target = null;
                return;
            }
        } else if (this.target.type === 'sheep') {
            const sheep = game.animals.find(a => a.id === this.target.id);
            if (!sheep || sheep.hp <= 0) {
                this.isMoving = false;
                this.state = 'idle';
                this.target = null;
                return;
            }
            tx = sheep.x;
            ty = sheep.y;
        }

        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 40) {
            this.state = 'gathering';
            this.gatherTimer = CONFIG.WORKER.GATHER_INTERVAL * 0.5;
            this.isMoving = false;
            return;
        }

        const speed = CONFIG.WORKER.SPEED;
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;

        this.simpleMove(vx, vy, game.world);
        this.direction = { x: vx, y: vy };
        this.isMoving = true;
        this.moveTime += dt;
    }

    simpleMove(vx, vy, world) {
        const COLLISION_RADIUS = 8;

        const isValid = (x, y) => {
            const gx = Math.floor(x / CONFIG.TILE_SIZE);
            const gy = Math.floor(y / CONFIG.TILE_SIZE);
            const tileId = world.getTile(gx, gy);
            if (tileId === TILES.WATER.id || tileId === TILES.DEEP_WATER.id) return false;
            const def = ID_TO_TILE[tileId];
            return !def.solid;
        };

        const canMove = (nx, ny) =>
            isValid(nx - COLLISION_RADIUS, ny - COLLISION_RADIUS) &&
            isValid(nx + COLLISION_RADIUS, ny - COLLISION_RADIUS) &&
            isValid(nx - COLLISION_RADIUS, ny + COLLISION_RADIUS) &&
            isValid(nx + COLLISION_RADIUS, ny + COLLISION_RADIUS);

        if (canMove(this.x + vx, this.y + vy)) {
            this.x += vx;
            this.y += vy;
        } else if (Math.abs(vx) > 0.01 && canMove(this.x + vx, this.y)) {
            this.x += vx;
        } else if (Math.abs(vy) > 0.01 && canMove(this.x, this.y + vy)) {
            this.y += vy;
        }
    }

    gatherTile(game) {
        const { gx, gy } = this.target;
        const tileId = game.world.getTile(gx, gy);

        if (!GATHERABLE_TILES.has(tileId)) {
            this.seekNextTarget(game, 'tile');
            return;
        }

        const tx = gx * CONFIG.TILE_SIZE + 16;
        const ty = gy * CONFIG.TILE_SIZE + 16;

        if (tileId === TILES.TREE.id) {
            const drop = getResourceDrop(tileId);
            game.player.inventory[drop.id] = (game.player.inventory[drop.id] || 0) + drop.qty;

            const biome = Utils.getBiome(gx, gy, game.world.seed);
            const restoreId = biome === TILES.SAND.id ? TILES.SAND.id : TILES.GRASS.id;
            game.world.setTile(gx, gy, restoreId);
            game.network.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });

            game.spawnParticles(tx, ty, TILES.WOOD.color, 5);
            game.spawnText(this.x, this.y - 10, `+${drop.qty} ${ID_TO_TILE[drop.id].short}`, '#0f0');
            game.ui.update();
            this.seekNextTarget(game, 'tile');
            return;
        }

        if (tileId === TILES.CROP_READY.id || tileId === TILES.CROP_GROWING.id || tileId === TILES.CROP_SEED.id) {
            const drop = getResourceDrop(tileId);
            game.player.inventory[drop.id] = (game.player.inventory[drop.id] || 0) + drop.qty;

            const biome = Utils.getBiome(gx, gy, game.world.seed);
            const restoreId = biome === TILES.SAND.id ? TILES.SAND.id : TILES.GRASS.id;
            game.world.setTile(gx, gy, restoreId);
            game.network.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });
            game.crops = game.crops.filter(c => c.x !== gx || c.y !== gy);

            game.spawnParticles(tx, ty, '#4a8c3f', 5);
            game.spawnText(this.x, this.y - 10, `+${drop.qty} Grn`, '#0f0');
            game.ui.update();
            this.seekNextTarget(game, 'tile');
            return;
        }

        const tileDef = ID_TO_TILE[tileId];
        if (!tileDef || !tileDef.hp) {
            this.seekNextTarget(game, 'tile');
            return;
        }

        const damage = CONFIG.WORKER.GATHER_DAMAGE;
        const totalDmg = game.world.hitTile(gx, gy, damage);
        game.spawnParticles(tx, ty, tileDef.color, 3);
        game.spawnText(tx, ty, `-${damage}`, '#fff');

        if (totalDmg >= tileDef.hp) {
            const drop = getResourceDrop(tileId);
            game.player.inventory[drop.id] = (game.player.inventory[drop.id] || 0) + drop.qty;

            const biome = Utils.getBiome(gx, gy, game.world.seed);
            let restoreId = TILES.GRASS.id;
            if (biome === TILES.WATER.id || biome === TILES.DEEP_WATER.id) restoreId = biome;
            if (biome === TILES.SAND.id) restoreId = TILES.SAND.id;

            game.world.setTile(gx, gy, restoreId);
            game.network.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });
            game.recalculateCannons();

            game.spawnText(this.x, this.y - 10, `+${drop.qty} ${ID_TO_TILE[drop.id].short}`, '#0f0');
            game.ui.update();
            this.seekNextTarget(game, 'tile');
        } else {
            game.network.broadcastTileHit(gx, gy, damage);
        }
    }

    gatherSheep(game) {
        const sheep = game.animals.find(a => a.id === this.target.id);
        if (!sheep || sheep.hp <= 0 || !sheep.hasWool) {
            this.seekNextTarget(game, 'sheep');
            return;
        }

        sheep.hasWool = false;
        sheep.woolTimer = CONFIG.WOOL_REGROW_TIME;

        game.player.inventory[TILES.WOOL.id] = (game.player.inventory[TILES.WOOL.id] || 0) + 2;
        game.spawnParticles(sheep.x, sheep.y, '#eee', 5);
        game.spawnText(this.x, this.y - 10, '+2 Wol', '#0f0');
        game.ui.update();

        this.seekNextTarget(game, 'sheep');
    }

    seekNextTarget(game, lastType) {
        const R = Worker.SEARCH_RADIUS;

        if (lastType === 'sheep') {
            let best = null, bestDist = Infinity;
            game.animals.forEach(a => {
                if (a.hp > 0 && a.hasWool) {
                    const d = Math.sqrt((a.x - this.x) ** 2 + (a.y - this.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = a; }
                }
            });
            if (best) {
                this.assignTarget({ type: 'sheep', id: best.id });
                return;
            }
        } else {
            const cx = Math.floor(this.x / CONFIG.TILE_SIZE);
            const cy = Math.floor(this.y / CONFIG.TILE_SIZE);
            let bestKey = null, bestDist = Infinity;

            for (let dy = -R; dy <= R; dy++) {
                for (let dx = -R; dx <= R; dx++) {
                    const gx = cx + dx, gy = cy + dy;
                    const tid = game.world.getTile(gx, gy);
                    if (!GATHERABLE_TILES.has(tid)) continue;
                    if (this.gatherKind && TILE_CATEGORY[tid] !== this.gatherKind) continue;
                    const tx = gx * CONFIG.TILE_SIZE + 16;
                    const ty = gy * CONFIG.TILE_SIZE + 16;
                    const d = Math.sqrt((tx - this.x) ** 2 + (ty - this.y) ** 2);
                    if (d < bestDist) { bestDist = d; bestKey = { gx, gy }; }
                }
            }
            if (bestKey) {
                this.assignTarget({ type: 'tile', gx: bestKey.gx, gy: bestKey.gy });
                return;
            }
        }

        this.state = 'idle';
        this.target = null;
    }
}

Worker.isGatherable = (tileId) => GATHERABLE_TILES.has(tileId);

Worker.SEARCH_RADIUS = 8;
