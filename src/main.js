import Game from './game.js';

window.onload = () => {
    // Check if the menu elements exist (they should be in index.html)
    const hostBtn = document.getElementById('btn-host');
    const joinBtn = document.getElementById('btn-join');
    const roomInput = document.getElementById('room-input');
    const menu = document.getElementById('main-menu');

    if (hostBtn && joinBtn && roomInput && menu) {
        hostBtn.onclick = () => {
            // Generate a random 4-char room ID
            const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
            menu.style.display = 'none';
            // Start game as Host
            window.game = new Game(roomId, true);
            alert(`Room Created! Share Code: ${roomId}`);
        };

        joinBtn.onclick = () => {
            const roomId = roomInput.value.toUpperCase();
            if (roomId.length < 2) return alert("Invalid Room ID");
            menu.style.display = 'none';
            // Start game as Client
            window.game = new Game(roomId, false);
        };
    } else {
        // Fallback if UI fails to load
        console.error("Menu elements not found");
        new Game("TEST", true);
    }
};