import { joinRoom } from 'https://cdn.skypack.dev/trystero@0.15.1';
import { Entity, Sheep, Boat } from './entities.js';
import { CONFIG, TILES } from './config.js'; 

export default class Network {
    constructor(game, roomId, isHost, playerName) {
        this.game = game;
        this.roomId = roomId;
        this.isHost = isHost;
        this.playerName = playerName;
        this.lastEntSync = 0;
        
        // [FIXED] Explicitly list reliable WebRTC trackers to avoid connection failures
        const config = { 
            appId: 'pixel-warfare-v2',
            trackerUrls: [
                'wss://tracker.openwebtorrent.com',
                'wss://tracker.btorrent.xyz',
                'wss://tracker.webtorrent.dev',
                'wss://tracker.files.fm:7073/announce' // Keeping original but prioritizing others
            ]
        };
        this.room = joinRoom(config, roomId);

        // --- ACTIONS ---
        const [sendInit, getInit] = this.room.makeAction('init');
        const [sendWorld, getWorld] = this.room.makeAction('world');
        const [sendPlayer, getPlayer] = this.room.makeAction('player');
        const [sendTileReq, getTileReq] = this.room.makeAction('tileReq');
        const [sendTileUpd, getTileUpd] = this.room.makeAction('tileUpd');
        const [sendDamage, getDamage] = this.room.makeAction('damage');
        const [sendEnts, getEnts] = this.room.makeAction('ents');
        const [sendEntReq, getEntReq] = this.room.makeAction('entReq');
        const [sendEntHit, getEntHit] = this.room.makeAction('entHit');

        this.actions = { 
            sendInit, sendWorld, sendPlayer, sendTileReq, sendTileUpd, 
            sendDamage, sendEnts, sendEntReq, sendEntHit 
        };

        // --- EVENTS ---
        this.room.onPeerJoin(peerId => {
            console.log(`Peer joined: ${peerId}`);
            if (this.isHost) {
                // [CHANGED] Send the host's fixed spawn point, not current player location
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
                
                if (data.spawnX && data.spawnY) {
                    // Update player position (with slight offset to prevent stacking)
                    const offsetX = (Math.random() - 0.5) * 128;
                    const offsetY = (Math.random() - 0.5) * 128;
                    this.game.player.x = data.spawnX + offsetX;
                    this.game.player.y = data.spawnY + offsetY;

                    // [CHANGED] Update local spawnPoint so respawn() uses the correct location
                    this.game.spawnPoint = { x: data.spawnX, y: data.spawnY };
                }
                this.game.recalcCannons();
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
                
                // [FIX] Boat rotation interpolation for peers
                if (data.bh !== undefined && p.boatStats) {
                    p.boatStats.targetHeading = data.bh;
                } else if (data.bh !== undefined) {
                    p.boatStats = { heading: data.bh, targetHeading: data.bh };
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

        getTileReq((data, peerId) => {
            if (this.isHost) {
                if (data.type === 'build') {
                    if (this.game.tryBuild(data.x, data.y, data.id, false, false, true)) {
                        this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                        this.game.recalcCannons(); 
                    }
                } else if (data.type === 'remove') {
                     const currentId = this.game.world.getTile(data.x, data.y);
                     this.game.spawnTileLoot(data.x, data.y, currentId);
                     
                     this.game.world.setTile(data.x, data.y, data.id); 
                     this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                     this.game.recalcCannons();
                }
            }
        });

        getTileUpd((data, peerId) => {
            if (data.action === 'set') {
                this.game.world.setTile(data.x, data.y, data.id);
                this.game.spawnParticles(data.x * 32 + 16, data.y * 32 + 16, '#fff', 5);
                this.game.recalcCannons();
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
                this.syncList(this.game.boats, data.b, 'boat'); // This will now correctly remove the boat if the host removed it
                this.syncList(this.game.loot, data.l, 'loot'); 
                
                if (data.c) {
                    data.c.forEach(remoteCannon => {
                        const localCannon = this.game.cannons.find(c => c.key === remoteCannon.k);
                        if (localCannon) {
                            localCannon.ammo = remoteCannon.a;
                        }
                    });
                }
            }
        });

        getEntReq((data, peerId) => {
            if (this.isHost) {
                if (data.act === 'shear') {
                    const sheep = this.game.animals.find(s => s.id === data.id);
                    if (sheep && sheep.hasWool) {
                        sheep.hasWool = false;
                        sheep.woolTimer = 36000;
                        this.game.loot.push({
                            uid: Math.random().toString(36).substr(2,9),
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
                    const idx = this.game.loot.findIndex(l => l.uid === data.id);
                    if (idx !== -1) this.game.loot.splice(idx, 1);
                } else if (data.act === 'refill') {
                    const cannon = this.game.cannons.find(c => c.key === data.id);
                    if (cannon) {
                        cannon.ammo += 5;
                        this.game.spawnParticles(cannon.x, cannon.y, '#00ffff', 5);
                    }
                } else if (data.act === 'spawnBoat') {
                    // Triggered when client BUILDS or EXITS a boat
                    this.game.boats.push(new Boat(data.x, data.y));
                    this.game.spawnParticles(data.x, data.y, '#8B4513', 8);
                } else if (data.act === 'enterBoat') {
                    // [NEW] Triggered when client ENTERS a boat
                    // Host removes the boat entity so it stops syncing to others
                    const idx = this.game.boats.findIndex(b => b.id === data.id);
                    if (idx !== -1) {
                        this.game.boats.splice(idx, 1);
                        // Optional: Could send a confirmation, but syncList handles cleanup on next tick
                    }
                }
            }
        });

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
            const isLoot = (type === 'loot');
            let entity = localList.find(e => (isLoot ? e.uid : e.id) === d.i);
            
            if (!entity) {
                if (type === 'sheep') entity = new Sheep(d.x, d.y);
                else if (type === 'boat') entity = new Boat(d.x, d.y, d.o);
                else if (type === 'loot') entity = { uid: d.i, x: d.x, y: d.y, id: d.t, qty: d.q, bob: Math.random()*100 };
                else entity = new Entity(d.x, d.y, 'npc');
                
                if (!isLoot) {
                    entity.id = d.i;
                    entity.targetX = d.x;
                    entity.targetY = d.y;
                }
                localList.push(entity);
            }
            
            if (isLoot) return; 

            // Update Targets
            entity.targetX = d.x;
            entity.targetY = d.y;
            
            if (Math.abs(d.x - entity.x) > 100 || Math.abs(d.y - entity.y) > 100) {
                entity.x = d.x;
                entity.y = d.y;
            }
            
            entity.hp = d.h;
            
            if (type === 'sheep') {
                entity.fed = d.f;
                entity.hasWool = d.w;
                entity.isMoving = (Math.abs(entity.targetX - entity.x) > 1 || Math.abs(entity.targetY - entity.y) > 1);
            } else if (type === 'boat') {
                if (d.bs) entity.boatStats.targetHeading = d.bs.h;
                if (d.o) entity.owner = d.o; 
            } else if (type === 'npc') {
                entity.isMoving = (Math.abs(entity.targetX - entity.x) > 1 || Math.abs(entity.targetY - entity.y) > 1);
            }
        });

        // [FIXED] Aggressive cleanup: If the server didn't send it, DELETE IT.
        for (let i = localList.length - 1; i >= 0; i--) {
            const currentId = (type === 'loot') ? localList[i].uid : localList[i].id;
            if (currentId && !incomingIds.has(currentId)) {
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
                mv: this.game.player.isMoving,
                bh: this.game.player.inBoat ? Number(this.game.player.boatStats.heading.toFixed(2)) : 0
            });
        }

        if (this.isHost) {
             const now = Date.now();
             if (now - this.lastEntSync > 50) { 
                 this.lastEntSync = now;
                 
                 const n = this.game.npcs.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp }));
                 const a = this.game.animals.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, f: e.fed?1:0, w: e.hasWool?1:0 }));
                 const b = this.game.boats.map(e => ({ i: e.id, x: Number(e.x.toFixed(1)), y: Number(e.y.toFixed(1)), h: e.hp, o: e.owner, bs: { h: Number(e.boatStats.heading.toFixed(2)) } }));
                 const l = this.game.loot.map(e => ({ i: e.uid, x: Math.round(e.x), y: Math.round(e.y), t: e.id, q: e.qty }));
                 
                 const c = this.game.cannons.map(t => ({ k: t.key, a: t.ammo }));

                 this.actions.sendEnts({ n, a, b, l, c });
             }
        }
    }

    requestBuild(gx, gy, id) {
        if (this.isHost) this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
        else this.actions.sendTileReq({ x: gx, y: gy, id: id, type: 'build' });
    }

    requestRemove(gx, gy, restoreId) {
        if (this.isHost) {
            const currentId = this.game.world.getTile(gx, gy);
            this.game.spawnTileLoot(gx, gy, currentId);
            
            this.game.world.setTile(gx, gy, restoreId);
            this.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });
            
            this.game.recalcCannons();
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