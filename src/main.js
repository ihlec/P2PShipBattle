import Game from './core/Game.js';

window.onload = () => {
    const hostBtn = document.getElementById('btn-host');
    const loadHostBtn = document.getElementById('btn-load-host');
    const joinBtn = document.getElementById('btn-join');
    const roomInput = document.getElementById('room-input');
    const nameInput = document.getElementById('name-input');
    const menu = document.getElementById('main-menu');

    // [NEW] Cookie Helpers
    const setCookie = (name, value, days) => {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    };

    const getCookie = (name) => {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i=0;i < ca.length;i++) {
            let c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
        }
        return null;
    };

    // [MODIFIED] Default Name Logic with Cookie Check
    const savedName = getCookie('pixelWarfareName');
    if (savedName) {
        nameInput.value = savedName;
    } else {
        nameInput.value = "Player" + Math.floor(Math.random()*100);
    }

    const generateRoomId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

    if (hostBtn) {
        // Host New Game
        hostBtn.onclick = () => {
            const roomId = generateRoomId();
            const playerName = nameInput.value || "Host";
            
            // [NEW] Save Name
            setCookie('pixelWarfareName', playerName, 30);

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

            // [NEW] Save Name
            setCookie('pixelWarfareName', playerName, 30);

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

            // [NEW] Save Name
            setCookie('pixelWarfareName', playerName, 30);

            if (roomId.length < 2) return alert("Invalid Room ID");
            
            nameInput.blur(); // [FIX] Remove focus
            roomInput.blur(); // [FIX] Remove focus
            menu.style.display = 'none';
            window.game = new Game(roomId, false, playerName, null);
        };
    }
};