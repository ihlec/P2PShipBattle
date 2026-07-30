export default class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.mouse = { 
            x: 0, 
            y: 0, 
            leftDown: false, 
            rightDown: false, 
            clickedLeft: false, 
            clickedRight: false 
        };
        this.wheel = 0;

        this.isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);

        this.setupKeyboard();
        this.setupMouse();

        if (this.isMobile) {
            this.mouse.x = window.innerWidth / 2;
            this.mouse.y = window.innerHeight / 2;
            this.joystickTouch = null;
            this.actionTouch = null;
            this.pinchState = null;
            this._touchDoubleAttackActive = false;
            this.setupTouch();
        }
    }

    isHarvestInteractionHeld() {
        if (this.mouse.rightDown) return true;
        if (!this.isMobile || !this.actionTouch) return false;
        if (this.game.player.selectedTile || this.game.activeBlueprint) return false;
        if (this._touchDoubleAttackActive) return false;
        return true;
    }

    setupKeyboard() {
        window.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            this.keys[e.key.toLowerCase()] = true;

            if (e.key.toLowerCase() === 'escape') {
                this.game.activeBlueprint = null;
                this.game.player.selectedTile = null;
                this.game.closeFloatingMenus();
                this.game.ui.update();
            }

            if (e.key.toLowerCase() === 'b') this.game.ui.toggleBlueprints();
            if (e.key.toLowerCase() === 'g') this.game.giveResources();
            if (e.key.toLowerCase() === 'p') {
                const mx = (this.mouse.x / this.game.zoom) + this.game.camera.x;
                const my = (this.mouse.y / this.game.zoom) + this.game.camera.y;
                this.game.placePing(mx, my);
            }
        });

        window.addEventListener('keyup', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    setupMouse() {
        let leftRepeat = null;
        let rightRepeat = null;
        const REPEAT_MS = 500;

        window.addEventListener('mousemove', e => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mousedown', e => {
            if (e.target.id !== 'gameCanvas') return;
            if (e.button === 0) {
                this.mouse.leftDown = true;
                this.mouse.clickedLeft = true;
                if (leftRepeat) clearInterval(leftRepeat);
                leftRepeat = setInterval(() => { this.mouse.clickedLeft = true; }, REPEAT_MS);
            }
            if (e.button === 2) {
                this.mouse.rightDown = true;
                this.mouse.clickedRight = true;
                if (rightRepeat) clearInterval(rightRepeat);
                rightRepeat = setInterval(() => { this.mouse.clickedRight = true; }, REPEAT_MS);
            }
        });

        window.addEventListener('mouseup', e => {
            if (e.button === 0) { this.mouse.leftDown = false; if (leftRepeat) { clearInterval(leftRepeat); leftRepeat = null; } }
            if (e.button === 2) { this.mouse.rightDown = false; if (rightRepeat) { clearInterval(rightRepeat); rightRepeat = null; } }
        });

        window.addEventListener('contextmenu', e => e.preventDefault());

        window.addEventListener('wheel', e => {
            this.wheel += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    setupTouch() {
        const touchUI = document.getElementById('touch-controls');
        if (touchUI) touchUI.style.display = 'block';

        const hintEl = document.querySelector('.stat-box small');
        if (hintEl) hintEl.textContent = 'Tap: Use | Double-tap: Attack or cancel build | Hold: Repeat';

        const joystickBase = document.getElementById('joystick-base');
        const joystickThumb = document.getElementById('joystick-thumb');

        const JOYSTICK_ZONE = 0.35;
        const JOYSTICK_RADIUS = 50;
        const DEAD_ZONE = 12;
        const MOVE_THRESHOLD = 15;
        const DOUBLE_TAP_MS = 260;
        const REPEAT_MS = 500;
        const TAP_MAX_DURATION = 400;
        const HOLD_DELAY = 400;

        let lastTapTime = 0;
        let repeatTimer = null;
        let pendingTapTimer = null;
        let holdTimer = null;
        let isAttackMode = false;
        const setAttackMode = (v) => {
            isAttackMode = v;
            this._touchDoubleAttackActive = v;
        };

        const clearRepeat = () => {
            if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
        };
        const clearPending = () => {
            if (pendingTapTimer) { clearTimeout(pendingTapTimer); pendingTapTimer = null; }
        };
        const clearHold = () => {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        };
        const hasSelection = () => !!(this.game.player.selectedTile || this.game.activeBlueprint);

        const isUI = (el) => {
            if (!el) return false;
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
            return !!(el.closest('.slot') || el.closest('.floating-menu') ||
                el.closest('#main-menu') || el.closest('.stat-box') ||
                el.closest('#action-bar') || el.closest('#mobile-action-row') ||
                el.closest('.touch-broadside-btn'));
        };

        window.addEventListener('touchstart', (e) => {
            if (isUI(e.target)) return;
            e.preventDefault();

            if (e.touches.length === 2) {
                const zoneMin = window.innerWidth * JOYSTICK_ZONE;
                const bothInActionZone = e.touches[0].clientX >= zoneMin && e.touches[1].clientX >= zoneMin;
                if (!bothInActionZone) return;

                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.pinchState = {
                    initialDist: Math.sqrt(dx * dx + dy * dy),
                    initialZoom: this.game.zoom,
                    active: false
                };
                this.actionTouch = null;
                clearRepeat();
                clearPending();
                clearHold();
                return;
            }

            for (const touch of e.changedTouches) {
                const x = touch.clientX;
                const y = touch.clientY;
                const isLeftZone = x < window.innerWidth * JOYSTICK_ZONE;

                if (isLeftZone && !this.joystickTouch) {
                    this.joystickTouch = {
                        id: touch.identifier,
                        originX: x, originY: y,
                        currentX: x, currentY: y
                    };
                    joystickBase.style.display = 'block';
                    joystickBase.style.left = (x - 50) + 'px';
                    joystickBase.style.top = (y - 50) + 'px';
                    joystickThumb.style.display = 'block';
                    joystickThumb.style.left = (x - 22) + 'px';
                    joystickThumb.style.top = (y - 22) + 'px';
                } else if (!this.actionTouch) {
                    const now = Date.now();
                    const isDoubleTap = pendingTapTimer && (now - lastTapTime) < DOUBLE_TAP_MS;

                    this.actionTouch = {
                        id: touch.identifier,
                        startX: x, startY: y,
                        startTime: now,
                        moved: false
                    };
                    this.mouse.x = x;
                    this.mouse.y = y;

                    if (isDoubleTap) {
                        clearPending();
                        clearHold();
                        if (this.game.activeBlueprint || this.game.player.selectedTile) {
                            setAttackMode(false);
                            this.game.exitPlacementMode();
                        } else {
                            setAttackMode(true);
                            this.mouse.clickedLeft = true;
                            clearRepeat();
                            repeatTimer = setInterval(() => {
                                this.mouse.clickedLeft = true;
                            }, REPEAT_MS);
                        }
                    } else {
                        setAttackMode(false);
                        clearHold();
                        holdTimer = setTimeout(() => {
                            holdTimer = null;
                            const key = hasSelection() ? 'clickedLeft' : 'clickedRight';
                            this.mouse[key] = true;
                            clearRepeat();
                            repeatTimer = setInterval(() => {
                                this.mouse[key] = true;
                            }, REPEAT_MS);
                        }, HOLD_DELAY);
                    }
                }
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (isUI(e.target) && !this.joystickTouch && !this.actionTouch && !this.pinchState) return;
            e.preventDefault();

            if (this.pinchState && e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (!this.pinchState.active) {
                    if (Math.abs(dist - this.pinchState.initialDist) < 40) return;
                    this.pinchState.active = true;
                }
                const scale = dist / this.pinchState.initialDist;
                this.game.zoom = Math.max(0.3, Math.min(3, this.pinchState.initialZoom * scale));
                return;
            }

            for (const touch of e.changedTouches) {
                if (this.joystickTouch && touch.identifier === this.joystickTouch.id) {
                    const dx = touch.clientX - this.joystickTouch.originX;
                    const dy = touch.clientY - this.joystickTouch.originY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    let clampedX = dx, clampedY = dy;
                    if (dist > JOYSTICK_RADIUS) {
                        clampedX = (dx / dist) * JOYSTICK_RADIUS;
                        clampedY = (dy / dist) * JOYSTICK_RADIUS;
                    }

                    joystickThumb.style.left = (this.joystickTouch.originX + clampedX - 22) + 'px';
                    joystickThumb.style.top = (this.joystickTouch.originY + clampedY - 22) + 'px';

                    this.keys['w'] = dy < -DEAD_ZONE;
                    this.keys['s'] = dy > DEAD_ZONE;
                    this.keys['a'] = dx < -DEAD_ZONE;
                    this.keys['d'] = dx > DEAD_ZONE;
                }

                if (this.actionTouch && touch.identifier === this.actionTouch.id) {
                    const dx = touch.clientX - this.actionTouch.startX;
                    const dy = touch.clientY - this.actionTouch.startY;
                    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
                        this.actionTouch.moved = true;
                    }
                    this.mouse.x = touch.clientX;
                    this.mouse.y = touch.clientY;
                }
            }
        }, { passive: false });

        const handleTouchEnd = (e) => {
            for (const touch of e.changedTouches) {
                if (this.joystickTouch && touch.identifier === this.joystickTouch.id) {
                    this.joystickTouch = null;
                    this.keys['w'] = false;
                    this.keys['a'] = false;
                    this.keys['s'] = false;
                    this.keys['d'] = false;
                    joystickBase.style.display = 'none';
                    joystickThumb.style.display = 'none';
                }

                if (this.actionTouch && touch.identifier === this.actionTouch.id) {
                    clearRepeat();
                    clearHold();
                    const duration = Date.now() - this.actionTouch.startTime;

                    if (!isAttackMode && !this.actionTouch.moved && duration < TAP_MAX_DURATION) {
                        lastTapTime = Date.now();
                        const tapX = this.mouse.x;
                        const tapY = this.mouse.y;
                        clearPending();
                        pendingTapTimer = setTimeout(() => {
                            this.mouse.x = tapX;
                            this.mouse.y = tapY;
                            this.mouse[hasSelection() ? 'clickedLeft' : 'clickedRight'] = true;
                            pendingTapTimer = null;
                        }, DOUBLE_TAP_MS);
                    }
                    this.actionTouch = null;
                }
            }

            if (e.touches.length < 2) {
                this.pinchState = null;
            }
        };

        window.addEventListener('touchend', handleTouchEnd, { passive: false });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        const broadsideL = document.getElementById('btn-broadside-l');
        const broadsideR = document.getElementById('btn-broadside-r');

        if (broadsideL) {
            broadsideL.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys['q'] = true; });
            broadsideL.addEventListener('touchend', (e) => { e.preventDefault(); this.keys['q'] = false; });
            broadsideL.addEventListener('touchcancel', () => { this.keys['q'] = false; });
        }
        if (broadsideR) {
            broadsideR.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys['e'] = true; });
            broadsideR.addEventListener('touchend', (e) => { e.preventDefault(); this.keys['e'] = false; });
            broadsideR.addEventListener('touchcancel', () => { this.keys['e'] = false; });
        }
    }

    initMobileLayout() {
        if (!this.isMobile) return;

        const actionBar = document.getElementById('action-bar');
        const weaponBar = document.getElementById('weapon-bar');
        if (!actionBar || !weaponBar) return;

        const row = document.createElement('div');
        row.id = 'mobile-action-row';

        const hammerBtn = document.getElementById('hammer-btn');
        const weaponMenuBtn = document.getElementById('weapon-btn');
        if (hammerBtn) row.appendChild(hammerBtn);
        if (weaponMenuBtn) row.appendChild(weaponMenuBtn);

        while (weaponBar.firstChild) {
            row.appendChild(weaponBar.firstChild);
        }

        document.body.appendChild(row);
        actionBar.style.display = 'none';
        weaponBar.style.display = 'none';
    }

    flush() {
        this.mouse.clickedLeft = false;
        this.mouse.clickedRight = false;
        this.wheel = 0;
    }
}
