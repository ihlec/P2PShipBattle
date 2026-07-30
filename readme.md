# Peer Pirates

Co-op pirate sandbox in the browser. Procedural world, base building, boats, and P2P multiplayer via Trystero.

## Play

https://ipfs.io/ipfs/bafybeialwjuuyazbmnozubkwtknrpbl4mebfw2co3is4dxrpwwq6c3yogy/

## Run locally

ES modules need a local server (don't open `index.html` as a file).

```bash
git clone https://github.com/ihlec/MedivalPixels.git
cd MedivalPixels
python3 -m http.server 8000
```

Then open http://localhost:8000

Or: `npm install && npm run dev`

## Features

- Infinite procedural map (water, sand, grass, mountains)
- Host / join over P2P (Trystero)
- Gather, build walls, towers, bridges
- Boats with wind sailing and broadsides
- Day / night cycle
- Minimap with pings (`P` or click the map)

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| L-Click | Attack / build |
| R-Click | Interact / cancel build |
| B | Build menu |
| P | Ping map |
| Q / E | Broadsides (in boat) |

One player hosts and shares the room code; others join with that code.
