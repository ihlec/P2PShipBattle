import Game from './core/Game.js';

window.onload = () => {
    const hostBtn = document.getElementById('btn-host');
    const loadHostBtn = document.getElementById('btn-load-host');
    const joinBtn = document.getElementById('btn-join');
    const roomInput = document.getElementById('room-input');
    const nameInput = document.getElementById('name-input');
    const menu = document.getElementById('main-menu');

    // Default Name
    nameInput.value = "Player" + Math.floor(Math.random()*100);

    const generateRoomId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

    if (hostBtn) {
        // Host New Game
        hostBtn.onclick = () => {
            const roomId = generateRoomId();
            const playerName = nameInput.value || "Host";
            nameInput.blur(); // [FIX] Remove focus so WASD works
            menu.style.display = 'none';
            // Null indicates no save data to load
            window.game = new Game(roomId, true, playerName, null); 
            alert(`Room Created! Share Code: ${roomId}`);
        };

        // Load Saved Game
        loadHostBtn.onclick = () => {
            const saveString = localStorage.getItem('pixelWarfareSave');
            if (!saveString) return alert("No Save Found!");
            
            const roomId = generateRoomId();
            const playerName = nameInput.value || "Host";
            nameInput.blur(); // [FIX] Remove focus so WASD works
            const saveData = JSON.parse(saveString);
            
            menu.style.display = 'none';
            window.game = new Game(roomId, true, playerName, saveData);
            alert(`Game Loaded! Share Code: ${roomId}`);
        };

        // Join Game
        joinBtn.onclick = () => {
            const roomId = roomInput.value.toUpperCase();
            const playerName = nameInput.value || "Guest";
            if (roomId.length < 2) return alert("Invalid Room ID");
            
            nameInput.blur(); // [FIX] Remove focus
            roomInput.blur(); // [FIX] Remove focus
            menu.style.display = 'none';
            window.game = new Game(roomId, false, playerName, null);
        };
    }
};