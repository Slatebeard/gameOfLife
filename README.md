# Game of Life

a team-based conway's game of life visualizer. four teams compete for territory, cells inherit colors from their neighbors, and everything fades into trails when it dies.

built this to run on a TV/kiosk display at work.

## running it

```bash
npm install
node server.js
```

server runs on port 3000. access requires a token (default: `life`) unless you're on localhost.

- main display: `http://localhost:3000/?token=life`
- scoreboard: `http://localhost:3000/score`
- admin panel: `http://localhost:3000/admin?token=admin`

tokens can be changed with env vars `GAME_TOKEN` and `ADMIN_TOKEN`.

## how it works

standard game of life rules but with colors. when a cell is born, it takes the dominant color of its neighbors. ties are broken randomly. dead cells leave trails that fade out slowly.

the server is the source of truth for game state - clients poll for updates. this lets you have multiple displays showing the same simulation, and control everything from the admin panel.

## game states

- **preRun** - pregame lobby, cycles through revealing palette, teams, and stats
- **running** - simulation is live
- **paused** - frozen
- **gameOver** - shows winner, transitions to night mode
- **night** - dark palette, no UI, just vibes

## schedule

theres a schedule system for automated state transitions throughout the day. times are hardcoded in server.js under `SCHEDULE`. enable it from the admin panel or by pressing `S` on the main display.

## events

press `5` for comets (random explosions that kill cells), `6` for drought (spawn chance drops over time).

## keybinds

| key | action |
|-----|--------|
| H | toggle keybind help |
| T | toggle trails |
| Y | trails only (hide live cells) |
| D | debug metrics |
| S | toggle schedule |
| R | reset game |
| 5 | comet event |
| 6 | drought event |

## palettes

palettes live in `public/data/palettes.json`. theres day palettes and night palettes. night palettes are intentionally dark - theyre meant for after-hours ambient display.

team names are in `public/data/teamNames.json`, organized by category.

## files

```
server.js              - hono server, state management, api
public/js/gameOfLife.js - client-side rendering and simulation
public/index.html      - main display
public/admin.html      - admin controls
public/standings.html  - scoreboard display
public/data/           - palettes and team names
data/                  - persisted game state and stats
```

## network

designed to be lightweight. the client polls the server for state changes but keeps the payload small.

| request | interval | purpose |
|---------|----------|---------|
| `GET /api/game` | 10s | poll for state/palette/admin changes (~0.6 kB) |
| `POST /api/game/grid` | 60s | backup grid to server (~0.2 kB response) |
| `POST /api/scores` | 120s | sync scores for standings page |

grid data is only fetched on initial page load (with `?includeGrid=true`), not on every poll. this keeps regular traffic under 10 kB/min per client.

the server doesn't make any outbound requests - it just responds to clients and checks the schedule every 30 seconds internally.

## notes

- state persists to `data/gameState.json` so you can restart the server without losing progress
- grid data is big so the state file can get large
- the client sends its grid to the server periodically for backup
- scores sync to `data/stats.json` for tracking historical winners
- schedule mode is not persisted - if the server restarts you need to re-enable it
