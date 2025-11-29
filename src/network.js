import { joinRoom } from 'https://cdn.skypack.dev/trystero@0.15.1';

export default class Network {
    constructor(game, roomId, isHost) {
        this.game = game;
        this.roomId = roomId;
        this.isHost = isHost;
        
        const config = { appId: 'pixel-warfare-v2' };
        this.room = joinRoom(config, roomId);

        // --- ACTIONS ---
        const [sendInit, getInit] = this.room.makeAction('init');
        const [sendWorld, getWorld] = this.room.makeAction('world');
        const [sendPlayer, getPlayer] = this.room.makeAction('player');
        const [sendTileReq, getTileReq] = this.room.makeAction('tileReq');
        const [sendTileUpd, getTileUpd] = this.room.makeAction('tileUpd');
        const [sendDamage, getDamage] = this.room.makeAction('damage');

        this.actions = { sendInit, sendWorld, sendPlayer, sendTileReq, sendTileUpd, sendDamage };

        this.room.onPeerJoin(peerId => {
            console.log(`Peer joined: ${peerId}`);
            if (this.isHost) {
                // [MODIFIED] Send Host Position as Spawn Point
                this.actions.sendWorld({
                    seed: this.game.world.seed,
                    modified: this.game.world.modifiedTiles,
                    time: this.game.world.time,
                    spawnX: Math.floor(this.game.player.x),
                    spawnY: Math.floor(this.game.player.y)
                }, peerId);
            }
            this.actions.sendInit({ name: 'Player' }, peerId);
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
                    x: 0, y: 0, hp: 100, maxHp: 100,
                    activeMelee: 'hand', inBoat: false,
                    isMoving: false, moveTime: 0, direction: {x:0, y:1}
                };
            }
        });

        // [MODIFIED] Receive World + Spawn Proximity
        getWorld((data, peerId) => {
            if (!this.isHost) {
                console.log("Received World Data");
                this.game.world.importData({
                    seed: data.seed,
                    modifiedTiles: data.modified,
                    time: data.time
                });
                this.game.dom.seed.innerText = data.seed;
                
                // Teleport to Host's location + random offset
                if (data.spawnX && data.spawnY) {
                    const offsetX = (Math.random() - 0.5) * 128;
                    const offsetY = (Math.random() - 0.5) * 128;
                    this.game.player.x = data.spawnX + offsetX;
                    this.game.player.y = data.spawnY + offsetY;
                    console.log(`Spawned near host at ${Math.floor(this.game.player.x)}, ${Math.floor(this.game.player.y)}`);
                }
            }
        });

        getPlayer((data, peerId) => {
            const p = this.game.peers[peerId];
            if (p) {
                p.x = data.x; p.y = data.y;
                p.activeMelee = data.w; p.inBoat = data.b;
                p.hp = data.hp; p.isMoving = data.mv;
                if(data.mv) p.moveTime += 16; 
            } else {
                this.game.peers[peerId] = { 
                    id: peerId, type: 'peer',
                    x: data.x, y: data.y, hp: data.hp, maxHp: 100,
                    activeMelee: data.w, inBoat: data.b,
                    isMoving: data.mv, moveTime: 0, direction: {x:0, y:1}
                };
            }
        });

        // [MODIFIED] Handle Remove Requests
        getTileReq((data, peerId) => {
            if (this.isHost) {
                if (data.type === 'build') {
                    if (this.game.tryBuild(data.x, data.y, data.id, false, false, true)) {
                        this.actions.sendTileUpd({ x: data.x, y: data.y, id: data.id, action: 'set' });
                    }
                } else if (data.type === 'remove') {
                     // Host updates their world
                     this.game.world.setTile(data.x, data.y, data.id); // data.id here is the 'restoreId' (e.g. Grass)
                     // Host broadcasts the change
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
    }

    requestBuild(gx, gy, id) {
        if (this.isHost) {
            this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
        } else {
            this.actions.sendTileReq({ x: gx, y: gy, id: id, type: 'build' });
        }
    }

    // [MODIFIED] Request Remove now takes a restoreId (what to replace the tile with)
    requestRemove(gx, gy, restoreId) {
        if (this.isHost) {
            this.game.world.setTile(gx, gy, restoreId);
            this.actions.sendTileUpd({ x: gx, y: gy, id: restoreId, action: 'set' });
        } else {
            this.actions.sendTileReq({ x: gx, y: gy, id: restoreId, type: 'remove' });
        }
    }

    broadcastBuild(gx, gy, id) {
        if (this.isHost) {
            this.actions.sendTileUpd({ x: gx, y: gy, id: id, action: 'set' });
        }
    }

    sendHit(peerId, damage) {
        this.actions.sendDamage(damage, peerId);
    }
}