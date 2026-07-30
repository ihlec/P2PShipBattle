import Game from './core/Game.js';

window.onload = () => {
    const hostBtn = document.getElementById('btn-host');
    const loadHostBtn = document.getElementById('btn-load-host');
    const joinBtn = document.getElementById('btn-join');
    const roomInput = document.getElementById('room-input');
    const nameInput = document.getElementById('name-input');
    const menu = document.getElementById('main-menu');

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

    const savedName = getCookie('peerPiratesName') || getCookie('pixelWarfareName');
    if (savedName) {
        nameInput.value = savedName;
    } else {
        nameInput.value = "Player" + Math.floor(Math.random()*100);
    }

    const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

    if (hostBtn) {
        hostBtn.onclick = () => {
            const roomId = generateRoomId();
            const playerName = nameInput.value || "Host";
            setCookie('peerPiratesName', playerName, 30);
            nameInput.blur();
            menu.style.display = 'none';
            window.game = new Game(roomId, true, playerName, null); 
            alert(`Room Created! Share Code: ${roomId}`);
        };

        loadHostBtn.onclick = () => {
            const saveString = localStorage.getItem('peerPiratesSave') || localStorage.getItem('pixelWarfareSave');
            if (!saveString) return alert("No Save Found!");
            
            const roomId = generateRoomId();
            const playerName = nameInput.value || "Host";
            setCookie('peerPiratesName', playerName, 30);
            nameInput.blur();
            const saveData = JSON.parse(saveString);
            
            menu.style.display = 'none';
            window.game = new Game(roomId, true, playerName, saveData);
            alert(`Game Loaded! Share Code: ${roomId}`);
        };

        joinBtn.onclick = () => {
            const roomId = roomInput.value.toUpperCase();
            const playerName = nameInput.value || "Guest";
            setCookie('peerPiratesName', playerName, 30);

            if (roomId.length < 2) return alert("Invalid Room ID");
            
            nameInput.blur();
            roomInput.blur();
            menu.style.display = 'none';
            window.game = new Game(roomId, false, playerName, null);
        };
    }
};