import { joinRoom } from 'https://cdn.skypack.dev/trystero@0.15.1';
import { Entity } from '../entities/Entity.js';
import { Sheep } from '../entities/Npc.js';
import { Boat } from '../entities/Boat.js';
import { Projectile } from '../entities/Projectile.js'; 
import { CONFIG, TILES, ID_TO_TILE } from '../config.js'; 
import Utils from '../utils.js';

export default class Network {
    constructor(game, roomId, isHost, playerName) {
        this.game = game;
        this.roomId = roomId;
        this.isHost = isHost;
        this.playerName = playerName;
        
        this.lastEntitySyncTime = 0;
        this.lastPlayerSyncTime = 0; // [NEW] Timer for player sync
        this.hostId = null; 
        
        const config = { 
            appId: 'pixel-warfare-v2',
            trackerUrls: [
                'wss://tracker.webtorrent.dev', 
                'wss://tracker.openwebtorrent.com'
            ]
        };
        this.room = joinRoom(config, roomId);
        
        this.selfId = this.room.selfId;

        // Actions
        const [sendInit, getInit] = this.room.makeAction('init');
        const [sendWorld, getWorld] = this.room.makeAction('world');
        const [sendPlayer, getPlayer] = this.room.makeAction('player');
        const [sendTileReq, getTileReq] = this.room.makeAction('tileReq');
        const [sendTileUpd, getTileUpd] = this.room.makeAction('tileUpd');
        const [sendDamage, getDamage] = this.room.makeAction('damage');
        const [sendEntities, getEntities] = this.room.makeAction('ents');
        const [sendEntReq, getEntReq] = this.room.makeAction('entReq');
        const [sendEntHit, getEntHit] = this.room.makeAction('entHit');
        
        const [sendShoot, getShoot] = this.room.makeAction('shoot');
        const [sendCannon, getCannon] = this.room.makeAction('cannon');

        this.actions = { 
            sendInit, sendWorld, sendPlayer, sendTileReq, sendTileUpd, 
            sendDamage, sendEntities, sendEntReq, sendEntHit,
            sendShoot, sendCannon
        };

        this.setupListeners(
            getInit, getWorld, getPlayer, getTileReq, getTileUpd, 
            getDamage, getEntities, getEntReq, getEntHit,
            getShoot, getCannon
        );
    }

    setupListeners(getInit, getWorld, getPlayer, getTileReq, getTileUpd, getDamage, getEntities, getEntReq, getEntHit, getShoot, getCannon) {
        this.room.onPeerJoin(peerId => {
            console.log(`Peer joined: ${peerId}`);
            this.actions.sendInit({ name: this.playerName }, peerId);
            if (this.isHost) {
                this.broadcastWorldState(peerId);
            }
        });

        this.room.onPeerLeave(peerId => {
            console.log(`Peer left: ${peerId}`);
            delete this.game.peers[peerId];

            if (!this.isHost && peerId === this.hostId) {
                this.game.showMessage("CONNECTION LOST", "#f00");
            }
        });

        getInit((data, peerId) => {
            if (this.isHost) {
                this.broadcastWorldState(peerId);
            }
            if (!this.game.peers[peerId]) {
                this.game.peers[peerId] = { 
                    id: peerId, type: 'peer',
                    name: data.name || "Unknown",
                    x: 0, y: 0, targetX: 0, targetY: 0,
                    hp: 100, maxHp: 100,
                    activeMelee: 'hand', inBoat: false,
                    isMoving: false, moveTime: 0, direction: {x:0, y:1}
                };
            }
        });

        getWorld((data, peerId) => {
            if (!this.isHost) {
                console.log("Received World Data");
                this.hostId = peerId;

                this.game.world.importData({
                    seed: data.seed,
                    modifiedTiles: data.modified,
                    tileData: data.tileData, 
                    time: data.time
                });
                
                if (data.spawnX && data.spawnY && this.game.player.x === 0 && this.game.player.y === 0) {
                    const offsetX = (Math.random() - 0.5) * 128;
                    const offsetY = (Math.random() - 0.5) * 128;
                    this.game.player.x = data.spawnX + offsetX;
                    this.game.player.y = data.spawnY + offsetY;
                    this.game.spawnPoint = { x: data.spawnX, y: data.spawnY };
                }
                this.game.recalculateCannons();
            }
        });

        getPlayer((data, peerId) => {
            const peer = this.game.peers[peerId];
            if (peer) {
                peer.targetX = data.x; peer.targetY = data.y;
                peer.activeMelee = data.w; peer.inBoat = data.b;
                peer.hp = data.hp; peer.isMoving = data.mv;
                if(data.mv) peer.moveTime += 16; 
                if (peer.x === 0 && peer.y === 0) { peer.x = data.x; peer.y = data.y; }
                if (data.bh !== undefined && peer.boatStats) {
                    peer.boatStats.targetHeading = data.bh;
                } else if (data.bh !== undefined) {
                    peer.boatStats = { heading: data.bh, targetHeading: data.bh };
                }
            } else {
                this.game.peers[peerId] = { 
                    id: peerId, type: 'peer', name: "Player",
                    x: data.x, y: data.y, targetX: data.x, targetY: data.y,
                    hp: data.hp, maxHp: 100,
                    activeMelee: data.w, inBoat: data.b,
                    isMoving: data.mv, moveTime: 0, direction: {x:0, y:1}
                };
                if (data.bh !== undefined) {
                    this.game.peers[peerId].boatStats = { heading: data.bh, targetHeading: data.bh };
                }
            }
        });

        getTileUpd((data, peerId) => {
            if (data.action === 'set') {
                this.game.world.setTile(data.x, data.y, data.id);
                this.game.spawnParticles(data.x * 32 + 16, data.y * 32 + 16, '#fff', 5);
                this.game.recalculateCannons();
            } else if (data.action === 'hit') { 
                this.game.world.hitTile(data.x, data.y, data.id); 
                const tx = data.x * CONFIG.TILE_SIZE + 16;
                const ty = data.y * CONFIG.TILE_SIZE + 16;
                this.game.spawnParticles(tx, ty, '#777', 3);
            }
        });

        getEntities((data) => {
            if (!this.isHost) {
                this.syncList(data.n, this.game.npcs, 'npc');
                this.syncList(data.a, this.game.animals, 'sheep');
                this.syncList(data.b, this.game.boats, 'boat');
                this.syncLoot(data.l);
                
                if (data.t !== undefined) {
                    this.game.world.time = data.t;
                }
            }
        });

        getTileReq((data, peerId) => {
            if (this.isHost) {
                if (data.type === 'build') {
                    const gx = data.x;
                    const gy = data.y;
                    const id = data.id;
                    const current = this.game.world.getTile(gx, gy);

                    const baseTerrains = [TILES.GRASS.id, TILES.SAND.id, TILES.WATER.id, TILES.DEEP_WATER.id];
                    if (!baseTerrains.includes(current) && current !== id) return;

                    const isWater = (current === TILES.WATER.id || current === TILES.DEEP_WATER.id);
                    if (isWater) {
                        const allowedOnWater = [TILES.GREY.id, TILES.WOOD_RAIL.id];
                        if (!allowedOnWater.includes(id)) return;
                    }
                    
                    if (ID_TO_TILE[id].solid && this.game.isTileOccupied(gx, gy)) return;

                    this.game.world.setTile(gx, gy, id);
                    this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
                    
                    this.game.recalculateCannons();

                } else if (data.type === 'damage') {
                    this.game.applyDamageToTile(data.x, data.y, data.dmg);
                } else if (data.type === 'remove') {
                    this.requestRemove(data.x, data.y, data.id);
                }
            }
        });

        getEntReq((data, peerId) => {
            if (this.isHost) {
                if (data.act === 'spawnBoat') {
                    const b = new Boat(data.x, data.y);
                    this.game.boats.push(b);
                } else if (data.act === 'enterBoat') {
                    const idx = this.game.boats.findIndex(b => b.id === data.id);
                    if (idx !== -1) this.game.boats.splice(idx, 1);
                } else if (data.act === 'shear') {
                    const s = this.game.animals.find(a => a.id === data.id);
                    if (s && s.hasWool) {
                        s.hasWool = false; 
                        s.woolTimer = CONFIG.WOOL_REGROW_TIME;
                        this.game.spawnLoot(s.x, s.y, 'sheep');
                    }
                } else if (data.act === 'refill') {
                    const c = this.game.cannons.find(can => can.key === data.id);
                    if (c) {
                        c.ammo += 5;
                        this.game.spawnText(c.x, c.y, "+5 AMMO", "#00ffff");
                        this.actions.sendCannon({ key: c.key, act: 'upd', ammo: c.ammo });
                    }
                } else if (data.act === 'pickup') {
                    const lIdx = this.game.loot.findIndex(l => l.uid === data.id);
                    if (lIdx !== -1) {
                         this.game.loot.splice(lIdx, 1);
                    }
                }
            }
        });

        getDamage((dmg) => {
             if (this.game.player && !this.game.godMode) {
                 this.game.player.hp -= dmg;
                 this.game.spawnParticles(this.game.player.x, this.game.player.y, '#f00', 5);
                 this.game.spawnText(this.game.player.x, this.game.player.y, `-${dmg}`, "#f00");
             }
        });
        
        getEntHit((data) => {
            if (this.isHost) {
                const target = [...this.game.npcs, ...this.game.animals, ...this.game.boats].find(e => e.id === data.id);
                if (target) {
                    target.hp -= data.dmg;
                    this.game.spawnParticles(target.x, target.y, '#f00', 5);
                }
            }
        });

        getShoot((data, peerId) => {
            if (peerId === this.selfId) return;

            const p = new Projectile(data.x, data.y, data.tx, data.ty, data.dmg, data.spd, data.col, false, data.type, peerId);
            p.life = data.life;
            this.game.projectiles.push(p);
        });

        getCannon((data) => {
            const cannon = this.game.cannons.find(c => c.key === data.key);
            if (!cannon) return;

            if (data.act === 'shoot') {
                cannon.ammo = data.ammo;
                cannon.cooldown = 60; 
                if (data.tx && data.ty) {
                    const proj = new Projectile(cannon.x, cannon.y - 20, data.tx, data.ty, cannon.damage, 10, '#000', true, 'cannonball');
                    this.game.projectiles.push(proj);
                    this.game.spawnParticles(cannon.x, cannon.y - 10, '#888', 3);
                }
            } else if (data.act === 'upd') {
                cannon.ammo = data.ammo;
                if(data.cd) cannon.cooldown = data.cd;
                this.game.spawnText(cannon.x, cannon.y, "+5 AMMO", "#00ffff");
            }
        });
    }

    broadcastWorldState(targetPeerId = null) {
        if (!this.game.world) return;
        const payload = {
            seed: this.game.world.seed,
            modified: this.game.world.modifiedTiles,
            tileData: this.game.world.tileData, 
            time: this.game.world.time,
            spawnX: Math.floor(this.game.spawnPoint.x),
            spawnY: Math.floor(this.game.spawnPoint.y)
        };
        this.actions.sendWorld(payload, targetPeerId);
    }

    syncList(sourceList, targetArray, type) {
        if (!sourceList) return;
        sourceList.forEach(s => {
            let t = targetArray.find(e => e.id === s.i);
            if (!t) {
                if (type === 'npc') { t = new Entity(s.x, s.y, 'npc'); t.id = s.i; targetArray.push(t); }
                else if (type === 'sheep') { t = new Sheep(s.x, s.y); t.id = s.i; targetArray.push(t); }
                else if (type === 'boat') { t = new Boat(s.x, s.y, s.o); t.id = s.i; targetArray.push(t); }
            }
            if (t) {
                t.targetX = s.x; t.targetY = s.y; t.hp = s.h;
                if (s.f !== undefined) t.fed = s.f;
                if (s.w !== undefined) t.hasWool = s.w;
                if (s.bs && t.boatStats) {
                    t.boatStats.targetHeading = s.bs.h;
                    t.boatStats.heading = s.bs.h; 
                }
            }
        });
        for (let i = targetArray.length - 1; i >= 0; i--) {
            if (!sourceList.find(s => s.i === targetArray[i].id)) {
                targetArray.splice(i, 1);
            }
        }
    }

    syncLoot(sourceList) {
        if (!sourceList) return;
        const targetArray = this.game.loot;
        sourceList.forEach(s => {
            let t = targetArray.find(e => e.uid === s.i);
            if (!t) {
                t = { uid: s.i, x: s.x, y: s.y, id: s.t, qty: s.q, bob: Math.random() * 100 };
                targetArray.push(t);
            } else {
                t.x = s.x; t.y = s.y;
            }
        });
        for (let i = targetArray.length - 1; i >= 0; i--) {
            if (!sourceList.find(s => s.i === targetArray[i].uid)) {
                targetArray.splice(i, 1);
            }
        }
    }

    update(deltaTime) {
        const now = Date.now();
        
        // [MODIFIED] Stable 50ms sync rate instead of random chance
        if (now - this.lastPlayerSyncTime > 50) { 
            this.lastPlayerSyncTime = now;
            this.actions.sendPlayer({
                x: Math.floor(this.game.player.x),
                y: Math.floor(this.game.player.y),
                w: this.game.player.activeMelee,
                b: this.game.player.inBoat,
                hp: Math.floor(this.game.player.hp),
                mv: this.game.player.isMoving,
                bh: this.game.player.inBoat ? Number(this.game.player.boatStats.heading.toFixed(2)) : 0
            });
        }
        
        if (this.isHost) {
             if (now - this.lastEntitySyncTime > 50) { 
                 this.lastEntitySyncTime = now;
                 const n = this.game.npcs.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp }));
                 const a = this.game.animals.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, f: e.fed?1:0, w: e.hasWool?1:0 }));
                 const b = this.game.boats.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, o: e.owner, bs: { h: Number(e.boatStats.heading.toFixed(2)) } }));
                 const l = this.game.loot.map(e => ({ i: e.uid, x: Math.floor(e.x), y: Math.floor(e.y), t: e.id, q: e.qty }));
                 
                 this.actions.sendEntities({ n, a, b, l, t: Number(this.game.world.time.toFixed(4)) });
             }
        }
    }
    
    requestBuild(gridX, gridY, id) {
        if (this.isHost) this.actions.sendTileUpd({ x: gridX, y: gridY, id: id, action: 'set' });
        else this.actions.sendTileReq({ x: gridX, y: gridY, id: id, type: 'build' });
    }

    requestRemove(gridX, gridY, restoreId) {
        if (this.isHost) {
            this.game.spawnLoot(gridX * CONFIG.TILE_SIZE + 16, gridY * CONFIG.TILE_SIZE + 16, this.game.world.getTile(gridX, gridY));
            this.game.world.setTile(gridX, gridY, restoreId);
            this.actions.sendTileUpd({ x: gridX, y: gridY, id: restoreId, action: 'set' });
            this.game.recalculateCannons();
        } else {
            this.actions.sendTileReq({ x: gridX, y: gridY, id: restoreId, type: 'remove' });
        }
    }

    broadcastTileHit(gridX, gridY, damage) {
        if (this.isHost) {
            this.actions.sendTileUpd({ x: gridX, y: gridY, id: damage, action: 'hit' });
        }
    }

    broadcastBuild(gridX, gridY, id) {
        if (this.isHost) this.actions.sendTileUpd({ x: gridX, y: gridY, id: id, action: 'set' });
    }

    sendHit(peerId, damage) {
        this.actions.sendDamage(damage, peerId);
    }
}