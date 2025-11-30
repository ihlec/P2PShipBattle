import { joinRoom } from 'https://cdn.skypack.dev/trystero@0.15.1';
import { Entity, Sheep, Boat } from './entities.js';
import { CONFIG, TILES } from './config.js'; // Import needed for Loot Logic if handled here, but mostly passed to game

export default class Network {
    constructor(game, roomId, isHost, playerName) {
        this.game = game;
        this.roomId = roomId;
        this.isHost = isHost;
        this.playerName = playerName;
        this.lastEntSync = 0;
        
        const config = { appId: 'pixel-warfare-v2' };
        this.room = joinRoom(config, roomId);

        // --- ACTIONS ---
        const [sendInit, getInit] = this.room.makeAction('init');
        const [sendWorld, getWorld] = this.room.makeAction('world');
        const [sendPlayer, getPlayer] = this.room.makeAction('player');
        const [sendTileReq, getTileReq] = this.room.makeAction('tileReq');
        const [sendTileUpd, getTileUpd] = this.room.makeAction('tileUpd');
        const [sendDamage, getDamage] = this.room.makeAction('damage');
        const [sendEnts, getEnts] = this.room.makeAction('ents');
        const [sendEntReq, getEntReq] = this.room.makeAction('entReq'); // [NEW] Interactions
        const [sendEntHit, getEntHit] = this.room.makeAction('entHit'); // [NEW] PvE Damage

        this.actions = { 
            sendInit, sendWorld, sendPlayer, sendTileReq, sendTileUpd, 
            sendDamage, sendEnts, sendEntReq, sendEntHit 
        };

        // --- EVENTS ---
        this.room.onPeerJoin(peerId => {
            console.log(`Peer joined: ${peerId}`);
            if (this.isHost) {
                this.actions.sendWorld({
                    seed: this.game.world.seed,
                    modified: this.game.world.modifiedTiles,
                    time: this.game.world.time,
                    spawnX: Math.floor(this.game.player.x),
                    spawnY: Math.floor(this.game.player.y)
                }, peerId);
            }
            this.actions.sendInit({ name: this.playerName }, peerId);
        });

        this.room.onPeerLeave(peerId => {
            console.log(`Peer left: ${peerId}`);
            delete this.game.peers[peerId];
        });

        // --- HANDLERS ---
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
                this.game.dom.seed.innerText = data.seed;
                if (data.spawnX && data.spawnY) {
                    const offsetX = (Math.random() - 0.5) * 128;
                    const offsetY = (Math.random() - 0.5) * 128;
                    this.game.player.x = data.spawnX + offsetX;
                    this.game.player.y = data.spawnY + offsetY;
                }
            }
        });

        getPlayer((data, peerId) => {
            const p = this.game.peers[peerId];
            if (p) {
                p.targetX = data.x; p.targetY = data.y;
                p.activeMelee = data.w; p.inBoat = data.b;
                p.hp = data.hp; p.isMoving = data.mv;
                if(data.mv) p.moveTime += 16; 
                if (p.x === 0 && p.y === 0) { p.x = data.x; p.y = data.y; }
            } else {
                this.game.peers[peerId] = { 
                    id: peerId, type: 'peer', name: "Player",
                    x: data.x, y: data.y, targetX: data.x, targetY: data.y,
                    hp: data.hp, maxHp: 100,
                    activeMelee: data.w, inBoat: data.b,
                    isMoving: data.mv, moveTime: 0, direction: {x:0, y:1}
                };
            }
        });

        getTileReq((data, peerId) => {
            if (this.isHost) {
                if (data.type === 'build') {
                    if (this.game.tryBuild(data.x, data.y, data.id, false, false, true)) {
                        this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                    }
                } else if (data.type === 'remove') {
                     this.game.world.setTile(data.x, data.y, data.id); 
                     this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                }
            }
        });

        getTileUpd((data, peerId) => {
            if (data.action === 'set') {
                this.game.world.setTile(data.x, data.y, data.id);
                this.game.spawnParticles(data.x * 32 + 16, data.y * 32 + 16, '#fff', 5);
            }
        });

        getDamage((amount, peerId) => {
            if (!this.game.godMode) {
                this.game.player.hp -= amount;
                this.game.spawnText(this.game.player.x, this.game.player.y, `-${amount}`, '#f00');
                this.game.spawnParticles(this.game.player.x, this.game.player.y, '#f00', 5);
            }
        });

        getEnts((data) => {
            if (!this.isHost) {
                this.syncList(this.game.npcs, data.n, 'npc');
                this.syncList(this.game.animals, data.a, 'sheep');
                this.syncList(this.game.boats, data.b, 'boat');
                this.syncList(this.game.loot, data.l, 'loot'); // Sync Loot
            }
        });

        // [NEW] Host handles interaction requests
        getEntReq((data, peerId) => {
            if (this.isHost) {
                if (data.act === 'shear') {
                    const sheep = this.game.animals.find(s => s.id === data.id);
                    if (sheep && sheep.hasWool) {
                        sheep.hasWool = false;
                        sheep.woolTimer = 36000;
                        this.game.loot.push({
                            id: Math.random().toString(36).substr(2,9),
                            x: sheep.x, y: sheep.y, 
                            id: TILES.WOOL.id, qty: 1, bob: Math.random()*100
                        });
                        this.game.spawnParticles(sheep.x, sheep.y, '#eee', 5);
                    }
                } else if (data.act === 'feed') {
                    const sheep = this.game.animals.find(s => s.id === data.id);
                    if (sheep && !sheep.fed) {
                        sheep.fed = true;
                        this.game.spawnParticles(sheep.x, sheep.y, '#ff00ff', 5);
                    }
                } else if (data.act === 'pickup') {
                    const idx = this.game.loot.findIndex(l => l.id === data.id);
                    if (idx !== -1) this.game.loot.splice(idx, 1);
                }
            }
        });

        // [NEW] Host handles PvE damage
        getEntHit((data, peerId) => {
            if (this.isHost) {
                const targets = [...this.game.npcs, ...this.game.animals, ...this.game.boats];
                const target = targets.find(e => e.id === data.id);
                if (target) {
                    target.hp -= data.dmg;
                    this.game.spawnParticles(target.x, target.y, '#f00', 5);
                }
            }
        });
    }

    syncList(localList, dataList, type) {
        if (!dataList) return;
        const incomingIds = new Set(dataList.map(e => e.i));

        dataList.forEach(d => {
            let entity = localList.find(e => e.id === d.i);
            if (!entity) {
                if (type === 'sheep') entity = new Sheep(d.x, d.y);
                else if (type === 'boat') entity = new Boat(d.x, d.y, d.o);
                else if (type === 'loot') entity = { id: d.i, x: d.x, y: d.y, id: d.t, qty: d.q, bob: Math.random()*100 };
                else entity = new Entity(d.x, d.y, 'npc');
                
                if (type !== 'loot') entity.id = d.i;
                localList.push(entity);
            }
            
            if (type === 'loot') return; // Loot doesn't move/update once spawned

            const dx = d.x - entity.x;
            const dy = d.y - entity.y;
            
            if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
                entity.x = d.x; entity.y = d.y;
            } else {
                entity.x += dx * 0.2;
                entity.y += dy * 0.2;
            }
            
            entity.hp = d.h;
            
            if (type === 'sheep') {
                entity.fed = d.f;
                entity.hasWool = d.w;
                entity.isMoving = (Math.abs(dx) > 1 || Math.abs(dy) > 1);
            } else if (type === 'boat') {
                if (d.bs) entity.boatStats.heading = d.bs.h;
                if (d.o) entity.owner = d.o; 
            } else if (type === 'npc') {
                entity.isMoving = (Math.abs(dx) > 1 || Math.abs(dy) > 1);
            }
        });

        for (let i = localList.length - 1; i >= 0; i--) {
            if (localList[i].id && !incomingIds.has(localList[i].id)) {
                localList.splice(i, 1);
            }
        }
    }

    update(dt) {
        if (Math.random() < 0.3) { 
            this.actions.sendPlayer({
                x: Math.floor(this.game.player.x),
                y: Math.floor(this.game.player.y),
                w: this.game.player.activeMelee,
                b: this.game.player.inBoat,
                hp: Math.floor(this.game.player.hp),
                mv: this.game.player.isMoving
            });
        }

        if (this.isHost) {
             const now = Date.now();
             if (now - this.lastEntSync > 50) { 
                 this.lastEntSync = now;
                 
                 const n = this.game.npcs.map(e => ({ i: e.id, x: Math.round(e.x), y: Math.round(e.y), h: e.hp }));
                 const a = this.game.animals.map(e => ({ i: e.id, x: Math.round(e.x), y: Math.round(e.y), h: e.hp, f: e.fed?1:0, w: e.hasWool?1:0 }));
                 const b = this.game.boats.map(e => ({ i: e.id, x: Math.round(e.x), y: Math.round(e.y), h: e.hp, o: e.owner, bs: { h: Number(e.boatStats.heading.toFixed(2)) } }));
                 
                 // Sync Loot (t=type/tileId, q=qty)
                 const l = this.game.loot.map(e => ({ i: e.id, x: Math.round(e.x), y: Math.round(e.y), t: e.id, q: e.qty }));

                 this.actions.sendEnts({ n, a, b, l });
             }
        }
    }

    requestBuild(gx, gy, id) {
        if (this.isHost) this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
        else this.actions.sendTileReq({ x: gx, y: gy, id: id, type: 'build' });
    }

    requestRemove(gx, gy, restoreId) {
        if (this.isHost) {
            this.game.world.setTile(gx, gy, restoreId);
            this.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });
        } else {
            this.actions.sendTileReq({ x: gx, y: gy, id: restoreId, type: 'remove' });
        }
    }

    broadcastBuild(gx, gy, id) {
        if (this.isHost) this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
    }

    sendHit(peerId, damage) {
        this.actions.sendDamage(damage, peerId);
    }
}