import { joinRoom } from 'https://cdn.skypack.dev/trystero@0.15.1';
import { Entity } from '../entities/Entity.js';
import { Sheep } from '../entities/Npc.js';
import { Boat } from '../entities/Boat.js';
import { CONFIG, TILES, ID_TO_TILE } from '../config.js'; 
import Utils from '../utils.js';

export default class Network {
    constructor(game, roomId, isHost, playerName) {
        this.game = game;
        this.roomId = roomId;
        this.isHost = isHost;
        this.playerName = playerName;
        this.lastEntitySyncTime = 0;
        
        const config = { 
            appId: 'pixel-warfare-v2',
            trackerUrls: [
                'wss://tracker.openwebtorrent.com',
                'wss://tracker.btorrent.xyz',
                'wss://tracker.webtorrent.dev',
                'wss://tracker.files.fm:7073/announce' 
            ]
        };
        this.room = joinRoom(config, roomId);

        // Actions
        const [sendInit, getInit] = this.room.makeAction('init');
        const [sendWorld, getWorld] = this.room.makeAction('world');
        const [sendPlayer, getPlayer] = this.room.makeAction('player');
        const [sendTileReq, getTileReq] = this.room.makeAction('tileReq');
        const [sendTileUpd, getTileUpd] = this.room.makeAction('tileUpd');
        const [sendDamage, getDamage] = this.room.makeAction('damage');
        const [sendEntities, getEntities] = this.room.makeAction('ents');
        const [sendEntityRequest, getEntityRequest] = this.room.makeAction('entReq');
        const [sendEntityHit, getEntityHit] = this.room.makeAction('entHit');

        this.actions = { 
            sendInit, sendWorld, sendPlayer, sendTileReq, sendTileUpd, 
            sendDamage, sendEntities, sendEntityRequest, sendEntityHit 
        };

        this.setupListeners(getInit, getWorld, getPlayer, getTileReq, getTileUpd, getDamage, getEntities, getEntityRequest, getEntityHit);
    }

    setupListeners(getInit, getWorld, getPlayer, getTileReq, getTileUpd, getDamage, getEntities, getEntityRequest, getEntityHit) {
        this.room.onPeerJoin(peerId => {
            console.log(`Peer joined: ${peerId}`);
            if (this.isHost) {
                this.actions.sendWorld({
                    seed: this.game.world.seed,
                    modified: this.game.world.modifiedTiles,
                    time: this.game.world.time,
                    spawnX: Math.floor(this.game.spawnPoint.x),
                    spawnY: Math.floor(this.game.spawnPoint.y)
                }, peerId);
            }
            this.actions.sendInit({ name: this.playerName }, peerId);
        });

        this.room.onPeerLeave(peerId => {
            console.log(`Peer left: ${peerId}`);
            delete this.game.peers[peerId];
        });

        getInit((data, peerId) => {
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
                this.game.world.importData({
                    seed: data.seed,
                    modifiedTiles: data.modified,
                    time: data.time
                });
                if (data.spawnX && data.spawnY) {
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

        // --- Restored Logic for Entity Sync ---

        getEntities((data) => {
            if (!this.isHost) {
                this.syncList(data.n, this.game.npcs, 'npc');
                this.syncList(data.a, this.game.animals, 'sheep');
                this.syncList(data.b, this.game.boats, 'boat');
            }
        });

        getTileReq((data, peerId) => {
            if (this.isHost) {
                if (data.type === 'build') {
                    // Simple validation could go here
                    this.game.world.setTile(data.x, data.y, data.id);
                    this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                } else if (data.type === 'damage') {
                    this.game.applyDamageToTile(data.x, data.y, data.dmg);
                } else if (data.type === 'remove') {
                    // Tree removal request
                    this.game.requestRemove(data.x, data.y, data.id);
                }
            }
        });

        getEntityRequest((data, peerId) => {
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
                    if (c) c.ammo += 5;
                } else if (data.act === 'pickup') {
                    // Basic loot claim logic
                    const lIdx = this.game.loot.findIndex(l => l.uid === data.id);
                    if (lIdx !== -1) {
                         // We could strictly track who picked it up, 
                         // but for now we just remove it to prevent duplicates
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
        
        getEntityHit((data) => {
            if (this.isHost) {
                // Find entity in all lists
                const target = [...this.game.npcs, ...this.game.animals, ...this.game.boats].find(e => e.id === data.id);
                if (target) {
                    target.hp -= data.dmg;
                    this.game.spawnParticles(target.x, target.y, '#f00', 5);
                }
            }
        });
    }

    syncList(sourceList, targetArray, type) {
        if (!sourceList) return;
        
        // 1. Update or Create
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
                if (s.bs && t.boatStats) t.boatStats.targetHeading = s.bs.h;
            }
        });

        // 2. Remove missing
        for (let i = targetArray.length - 1; i >= 0; i--) {
            if (!sourceList.find(s => s.i === targetArray[i].id)) {
                targetArray.splice(i, 1);
            }
        }
    }

    update(deltaTime) {
        if (Math.random() < 0.3) { 
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
        
        // Entity Sync for Host
        if (this.isHost) {
             const now = Date.now();
             if (now - this.lastEntitySyncTime > 50) { 
                 this.lastEntitySyncTime = now;
                 const n = this.game.npcs.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp }));
                 const a = this.game.animals.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, f: e.fed?1:0, w: e.hasWool?1:0 }));
                 const b = this.game.boats.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, o: e.owner, bs: { h: Number(e.boatStats.heading.toFixed(2)) } }));
                 
                 this.actions.sendEntities({ n, a, b });
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