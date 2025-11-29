import Game from './game.js';

window.onload = () => {
    const hostBtn = document.getElementById('btn-host');
    const loadHostBtn = document.getElementById('btn-load-host');
    const joinBtn = document.getElementById('btn-join');
    const roomInput = document.getElementById('room-input');
    const nameInput = document.getElementById('name-input');
    const menu = document.getElementById('main-menu');

    // Default Name
    nameInput.value = "Player" + Math.floor(Math.random()*100);

    const getRoomId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

    if (hostBtn) {
        // 1. HOST NEW
        hostBtn.onclick = () => {
            const roomId = getRoomId();
            const name = nameInput.value || "Host";
            menu.style.display = 'none';
            window.game = new Game(roomId, true, name, null); // Null = No save data
            alert(`Room Created! Share Code: ${roomId}`);
        };

        // 2. HOST LOAD
        loadHostBtn.onclick = () => {
            const json = localStorage.getItem('pixelWarfareSave');
            if (!json) return alert("No Save Found!");
            
            const roomId = getRoomId();
            const name = nameInput.value || "Host";
            const saveData = JSON.parse(json);
            
            menu.style.display = 'none';
            window.game = new Game(roomId, true, name, saveData);
            alert(`Game Loaded! Share Code: ${roomId}`);
        };

        // 3. JOIN
        joinBtn.onclick = () => {
            const roomId = roomInput.value.toUpperCase();
            const name = nameInput.value || "Guest";
            if (roomId.length < 2) return alert("Invalid Room ID");
            
            menu.style.display = 'none';
            window.game = new Game(roomId, false, name, null);
        };
    }
};