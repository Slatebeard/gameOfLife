// ================================
// 1. SET UP
// ================================

const canvas = document.getElementById('liveCanvas');
//canvas.classList.add("glow")
//canvas.classList.add("glow-intense")
//canvas.classList.add("neon")
//canvas.classList.add("dreamy")
//canvas.classList.add("retro")
//canvas.classList.add("psychedelic")
//canvas.classList.add("pulse")
//canvas.classList.add("vaporwave")
//canvas.classList.add("matrix")
//canvas.classList.add("fire")
//canvas.classList.add("inverted")
//canvas.classList.add("scanlines")
//canvas.classList.add("shadow")
//canvas.classList.add("zoom-pulse")


canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const canvasContext = canvas.getContext('2d');


// ================================
// 2. CONFIG
// ================================

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

const scaleX = window.innerWidth / TARGET_WIDTH;
const scaleY = window.innerHeight / TARGET_HEIGHT;
const scaleFactor = Math.min(scaleX, scaleY);
const baseCellSize = 8;
const baseFontScale = 1;

const cellSize = Math.round(baseCellSize * scaleFactor);
const fontScale = scaleFactor;

document.documentElement.style.setProperty('--ui-scale', fontScale);

const frameRate = 14;
const frameInterval = 1000 / frameRate;
const trailFade = 0.005; // closer to 1 = faster fade
const initialSpawnChance = 0.0005;
let spawnChance = initialSpawnChance;
const scoreboardInterval = 5;
const showKeybinds = false;

// debug toggles
let debugShowTrails = true;
let debugTrailsOnly = false;
let debugShowMetrics = false;
let scheduleEnabled = false;

// polling configuration
const POLL_INTERVAL = 2000; // Poll server every 2 seconds
const GRID_SEND_INTERVAL = 5000; // Send grid to server every 5 seconds
let lastKnownAdminVersion = 0;

// performance metrics
let fpsCounter = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// sync rate limiter for scores display
const SYNC_RATE_LIMIT_MS = 60000;
let lastSyncTs = 0;
let pollTimer = null;
let gridSendTimer = null;

// game states
const STATE_PRE_RUN = 'preRun';
const STATE_RUNNING = 'running';
const STATE_GAME_OVER = 'gameOver';
const STATE_PAUSED = 'paused';
const STATE_NIGHT = 'night';

// pregame phases
const PHASE_PALETTE = 'palette';
const PHASE_TEAMS = 'teams';
const PHASE_STATS = 'stats';
const PHASE_READY = 'ready';

// Note: Phase timing is now controlled by the server

let currentPhase = PHASE_PALETTE;
let pregameStartTime = null;
let gameOverStartTime = null;
const NIGHT_MODE_DELAY = 10 * 60 * 1000; // 10 minutes in ms


// event states
const EVENT_COMETS = 'comets';
const EVENT_DROUGHT = 'drought';

// comet event config
const cometMinRadius = 3;
const cometMaxRadius = 12;


const cometSpawnInterval = Math.floor(Math.random() * 12) + 2; // spawn every 2-10 frames

let currentState = STATE_PRE_RUN;
let currentEvent = null;

// index 0 is dead (transparent), indices 1-4 are team colors
let teamColors = [
    '#000000', // dead, dont touch
    '#E63946',
    '#457B9D',
    '#2A9D8F',
    '#F4A261'
];

let currentPaletteName = '';
let currentCategoryName = '';
let actualTeamNames = ['', '', '', ''];
let gameStats = null;
let isNightPalette = false;

function hexToRGB(hex) {
    // regex magic, no idea how it works, thanks gippity
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);

    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
}

let colorRGB = teamColors.map(hexToRGB);

function updateColorRGB() {
    colorRGB = teamColors.map(hexToRGB);
    // Ensure dead cell color is always pure black
    colorRGB[0] = [0, 0, 0];
}

function equalizeTeamLabelWidths() {
    const labels = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`name-${i}`);
        if (el) {
            el.style.width = 'auto';
            labels.push(el);
        }
    }
    const maxWidth = Math.max(...labels.map(el => el.offsetWidth));
    labels.forEach(el => {
        el.style.width = `${maxWidth}px`;
    });
}

function showPregamePanel() {
    const panel = document.getElementById('pregame-panel');
    if (panel) panel.classList.add('visible');
}

function hidePregamePanel() {
    const panel = document.getElementById('pregame-panel');
    if (panel) panel.classList.remove('visible');
}

async function showGameoverPanel() {
    const panel = document.getElementById('gameover-panel');
    const winnerEl = document.getElementById('gameover-winner');
    const scoreEl = document.getElementById('gameover-score');

    const winner = getWinner();

    if (winnerEl) {
        if (winner) {
            winnerEl.textContent = winner.name;
            winnerEl.style.color = winner.color;
        } else {
            winnerEl.textContent = 'No one';
            winnerEl.style.color = '';
        }
    }

    if (scoreEl) {
        if (winner) {
            scoreEl.textContent = `${winner.count.toLocaleString()} cells`;
        } else {
            scoreEl.textContent = '';
        }
    }

    // Note: Night palette is now assigned server-side on gameOver transition
    // The client will receive the updated palette via polling

    if (panel) panel.classList.add('visible');
}

function hideGameoverPanel() {
    const panel = document.getElementById('gameover-panel');
    if (panel) panel.classList.remove('visible');
}

function updateGameoverCountdown() {
    const countdownTimeEl = document.getElementById('gameover-countdown-time');
    if (!countdownTimeEl || !gameOverStartTime) return;

    const now = Date.now();
    const elapsed = now - gameOverStartTime;
    const remainingMs = Math.max(0, NIGHT_MODE_DELAY - elapsed);

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    countdownTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Note: Night state transition is now server-controlled via schedule
    // The client will receive the state change via polling
}

function enterNightVisuals() {
    hideGameoverPanel();
    hidePregamePanel();

    // Hide header bar
    const headerBar = document.getElementById('header-bar');
    if (headerBar) headerBar.style.display = 'none';

    // Clear canvas before starting night visuals
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    // Note: Night palette is now assigned server-side
    // The client receives it via polling

    console.log('Entering night mode visuals');
}

function exitNightState() {
    const headerBar = document.getElementById('header-bar');
    if (headerBar) headerBar.style.display = 'flex';
}

function updatePregamePanel() {
    const paletteNameEl = document.getElementById('panel-palette-name');
    const categoryNameEl = document.getElementById('panel-category-name');
    const teamListEl = document.getElementById('panel-team-list');
    const statsSection = document.querySelector('.panel-right');

    if (paletteNameEl) paletteNameEl.textContent = currentPaletteName;

    for (let i = 1; i <= 4; i++) {
        const swatch = document.getElementById(`swatch-${i}`);
        const hexLabel = document.getElementById(`hex-${i}`);
        if (swatch) swatch.style.backgroundColor = teamColors[i];
        if (hexLabel) hexLabel.textContent = teamColors[i];
    }

    const teamsRevealed = currentPhase === PHASE_TEAMS || currentPhase === PHASE_STATS || currentPhase === PHASE_READY;

    if (categoryNameEl) {
        if (teamsRevealed) {
            categoryNameEl.textContent = currentCategoryName;
            categoryNameEl.classList.remove('panel-placeholder');
        } else {
            categoryNameEl.textContent = '???';
            categoryNameEl.classList.add('panel-placeholder');
        }
    }

    for (let i = 1; i <= 4; i++) {
        const teamEl = document.getElementById(`panel-team-${i}`);
        if (teamEl) {
            if (teamsRevealed) {
                teamEl.textContent = actualTeamNames[i - 1];
                teamEl.style.color = teamColors[i];
                teamEl.classList.remove('panel-placeholder');
            } else {
                teamEl.textContent = '???';
                teamEl.style.color = 'rgba(255, 255, 255, 0.5)';
                teamEl.classList.add('panel-placeholder');
            }
        }
    }

    const statsRevealed = currentPhase === PHASE_STATS || currentPhase === PHASE_READY;
    const lastWinnerEl = document.getElementById('stat-last-winner');
    const mostPaletteEl = document.getElementById('stat-most-palette');
    const mostCategoryEl = document.getElementById('stat-most-category');
    const highestScoreEl = document.getElementById('stat-highest-score');

    if (lastWinnerEl) {
        if (statsRevealed && gameStats) {
            lastWinnerEl.classList.remove('panel-placeholder');
            if (gameStats.lastWinner?.name) {
                lastWinnerEl.textContent = gameStats.lastWinner.name;
                lastWinnerEl.style.color = gameStats.lastWinner.color;
            } else {
                lastWinnerEl.textContent = '-';
                lastWinnerEl.style.color = '';
            }
        } else {
            lastWinnerEl.textContent = '???';
            lastWinnerEl.style.color = '';
            lastWinnerEl.classList.add('panel-placeholder');
        }
    }

    if (mostPaletteEl) {
        if (statsRevealed && gameStats) {
            mostPaletteEl.classList.remove('panel-placeholder');
            mostPaletteEl.textContent = gameStats.mostPlayedPalette?.name || '-';
        } else {
            mostPaletteEl.textContent = '???';
            mostPaletteEl.classList.add('panel-placeholder');
        }
    }

    if (mostCategoryEl) {
        if (statsRevealed && gameStats) {
            mostCategoryEl.classList.remove('panel-placeholder');
            mostCategoryEl.textContent = gameStats.mostPlayedCategory?.name || '-';
        } else {
            mostCategoryEl.textContent = '???';
            mostCategoryEl.classList.add('panel-placeholder');
        }
    }

    if (highestScoreEl) {
        if (statsRevealed && gameStats) {
            highestScoreEl.classList.remove('panel-placeholder');
            if (gameStats.highestScore?.name) {
                highestScoreEl.textContent = `${gameStats.highestScore.name} (${gameStats.highestScore.count.toLocaleString()})`;
                highestScoreEl.style.color = gameStats.highestScore.color;
            } else {
                highestScoreEl.textContent = '-';
                highestScoreEl.style.color = '';
            }
        } else {
            highestScoreEl.textContent = '???';
            highestScoreEl.style.color = '';
            highestScoreEl.classList.add('panel-placeholder');
        }
    }

    updateCountdown();
}

// Note: Phase advancement is now server-controlled
// The client just displays the current phase from the server

function updateCountdown() {
    const countdownEl = document.getElementById('pregame-countdown');
    const countdownTimeEl = document.getElementById('countdown-time');
    const countdownLabelEl = document.getElementById('countdown-label');

    if (!countdownEl || !countdownTimeEl || !countdownLabelEl) return;

    // Show phase status based on current phase (server-controlled)
    switch (currentPhase) {
        case PHASE_PALETTE:
            countdownLabelEl.textContent = 'Waiting for teams...';
            countdownTimeEl.textContent = '';
            break;
        case PHASE_TEAMS:
            countdownLabelEl.textContent = 'Waiting for stats...';
            countdownTimeEl.textContent = '';
            break;
        case PHASE_STATS:
            countdownLabelEl.textContent = 'Getting ready...';
            countdownTimeEl.textContent = '';
            break;
        case PHASE_READY:
            countdownLabelEl.textContent = 'Starting soon';
            countdownTimeEl.textContent = '';
            break;
        default:
            countdownEl.style.display = 'none';
            return;
    }

    countdownEl.style.display = 'flex';
}

// Note: Palette selection is now server-side. The client receives palette
// from the server via polling and applies it directly.

const teamCounts = [0, 0, 0, 0, 0];

function updateScoreboard(forceSync, currentTime) {
    teamCounts.fill(0);
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            const cell = grid[r][c];
            if (cell > 0) teamCounts[cell]++;
        }
    }
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`count-${i}`);
        if (el) el.textContent = teamCounts[i];
    }

    sendScoresToServer(forceSync, currentTime);
}

function sendScoresToServer(forceSync, currentTime) {
    if (!forceSync && (currentTime - lastSyncTs < SYNC_RATE_LIMIT_MS)) {
        return;
    }

    if (currentTime > 0) {
        lastSyncTs = currentTime;
    }

    const teams = [];
    for (let i = 1; i <= 4; i++) {
        teams.push({
            name: actualTeamNames[i - 1] || `Team ${i}`,
            color: teamColors[i],
            count: teamCounts[i]
        });
    }

    const eventEl = document.getElementById('event-text');
    const event = eventEl ? eventEl.textContent : 'NO EVENT';

    fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams, event })
    }).catch(() => { }); // ignore errors
}

async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        gameStats = await response.json();
        return gameStats;
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        return null;
    }
}

function getWinner() {
    let maxCount = 0;
    let winnerIndex = -1;
    for (let i = 1; i <= 4; i++) {
        if (teamCounts[i] > maxCount) {
            maxCount = teamCounts[i];
            winnerIndex = i;
        }
    }
    if (winnerIndex > 0) {
        return {
            name: actualTeamNames[winnerIndex - 1],
            color: teamColors[winnerIndex],
            count: maxCount
        };
    }
    return null;
}

async function recordGameEnd() {
    const winner = getWinner();
    try {
        const response = await fetch('/api/game-end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                winner,
                palette: currentPaletteName,
                category: currentCategoryName
            })
        });
        const result = await response.json();
        if (result.stats) {
            gameStats = result.stats;
        }
    } catch (error) {
        console.error('Failed to record game end:', error);
    }
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB'); // HH:MM:SS format
    const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.textContent = time;
    if (dateEl) dateEl.textContent = date;
}

function initTeamColors() {
    for (let i = 1; i <= 4; i++) {
        const el = document.querySelector(`.team-${i}`);
        if (el) el.style.color = teamColors[i];
    }
}

initTeamColors();

// Note: Team name selection is now server-side. The client receives team names
// from the server via polling and applies them directly.

function updateHeaderBarTeams() {
    const teamsRevealed = currentPhase === PHASE_TEAMS || currentPhase === PHASE_STATS || currentPhase === PHASE_READY;

    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`name-${i}`);
        if (el) {
            if (teamsRevealed) {
                el.textContent = actualTeamNames[i - 1];
            } else {
                el.textContent = '???';
            }
        }
    }

    const categoryLabel = document.getElementById('category-label');
    if (categoryLabel) {
        if (teamsRevealed) {
            categoryLabel.textContent = currentCategoryName;
        } else {
            categoryLabel.textContent = '???';
        }
    }

    equalizeTeamLabelWidths();
}

// ================================
// 3. INIT STATE
// ================================

const rows = Math.floor(canvas.height / cellSize);
const cols = Math.floor(canvas.width / cellSize);

let grid = [];
let gridBuffer = [];
let trailGrid = [];

function resetGrid() {
    grid = [];
    gridBuffer = [];
    trailGrid = [];

    for (let r = 0; r < rows; r++) {
        const row = [];
        const bufferRow = [];
        const trailRow = [];
        for (let c = 0; c < cols; c++) {
            if (Math.random() < 0.5) {
                row.push(0); // dead
                trailRow.push({ color: 0, brightness: 0 });
            } else {
                // random color, like rain
                const color = Math.floor(Math.random() * 4) + 1;
                row.push(color);
                trailRow.push({ color: color, brightness: 1 });
            }
            bufferRow.push(0);
        }
        grid.push(row);
        gridBuffer.push(bufferRow);
        trailGrid.push(trailRow);
    }

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    updateScoreboard(true, 0);
    drawGrid();
}

resetGrid();

updateScoreboard(true, 0);

// ================================
// 4. DRAW
// ================================

function drawGrid() {
    // Fill background with black first (don't rely on CSS body showing through)
    canvasContext.fillStyle = '#000000';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < trailGrid.length; row++) {
        for (let col = 0; col < trailGrid[row].length; col++) {
            const { color, brightness } = trailGrid[row][col];
            if (brightness === 0) continue;

            // Debug: trails only mode - skip live cells
            if (debugTrailsOnly && brightness === 1) continue;

            // Debug: no trails mode - skip fading cells
            if (!debugShowTrails && brightness < 1) continue;

            const [r, g, b] = colorRGB[color];
            canvasContext.fillStyle = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`;
            canvasContext.fillRect(
                col * cellSize,
                row * cellSize,
                cellSize,
                cellSize
            );
        }
    }
}

function updateTrail() {
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const cell = grid[row][col];
            if (cell > 0) {
                trailGrid[row][col].color = cell;
                trailGrid[row][col].brightness = 1;
            } else {
                const newBrightness = Math.max(0, trailGrid[row][col].brightness - trailFade);
                trailGrid[row][col].brightness = newBrightness;
                // Reset color to black when fully faded
                if (newBrightness === 0) {
                    trailGrid[row][col].color = 0;
                }
            }
        }
    }
}

function updateMetricsPanel(currentTime) {
    fpsCounter++;
    if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = fpsCounter;
        fpsCounter = 0;
        lastFpsUpdate = currentTime;
    }

    const panel = document.getElementById('debug-panel');
    if (!panel) return;

    if (debugShowMetrics) {
        panel.classList.add('visible');

        let liveCells = 0;
        for (let i = 1; i <= 4; i++) {
            liveCells += teamCounts[i];
        }

        document.getElementById('debug-fps').textContent = currentFps;
        document.getElementById('debug-grid-size').textContent = `${cols} x ${rows}`;
        document.getElementById('debug-cell-size').textContent = `${cellSize}px`;
        document.getElementById('debug-total-cells').textContent = (cols * rows).toLocaleString();
        document.getElementById('debug-live-cells').textContent = liveCells.toLocaleString();
        document.getElementById('debug-state').textContent = currentState;
        document.getElementById('debug-trails').textContent = debugShowTrails ? 'ON' : 'OFF';
        document.getElementById('debug-trails-only').textContent = debugTrailsOnly ? 'ON' : 'OFF';
        document.getElementById('debug-schedule').textContent = scheduleEnabled ? 'ON' : 'OFF';
    } else {
        panel.classList.remove('visible');
    }
}

drawGrid();


// ================================
// 5. EVENTS
// ================================

function spawnExplosion() {
    const centerRow = Math.floor(Math.random() * rows);
    const centerCol = Math.floor(Math.random() * cols);
    const radius = Math.floor(Math.random() * (cometMaxRadius - cometMinRadius + 1)) + cometMinRadius;
    const color = 0

    for (let r = -radius; r <= radius; r++) {
        for (let c = -radius; c <= radius; c++) {
            if (r * r + c * c <= radius * radius) {
                const targetRow = centerRow + r;
                const targetCol = centerCol + c;
                if (targetRow >= 0 && targetRow < rows && targetCol >= 0 && targetCol < cols) {
                    grid[targetRow][targetCol] = color;
                    trailGrid[targetRow][targetCol] = { color: color, brightness: color > 0 ? 1 : 0 };
                }
            }
        }
    }
}


function lowerSpawnChance() {
    spawnChance = Math.max(0, spawnChance - 0.0001);
}


// ================================
// 6. ITERATE NEXT GEN
// ================================

const colorCounts = [0, 0, 0, 0, 0];
const dominantColors = [0, 0, 0, 0];
const neighborResult = { count: 0, dominantColor: 0 };

function getNeighborInfo(row, col, currentGrid) {
    let count = 0;
    colorCounts[0] = 0; colorCounts[1] = 0; colorCounts[2] = 0; colorCounts[3] = 0; colorCounts[4] = 0;

    for (let rOffset = -1; rOffset <= 1; rOffset++) {
        for (let cOffset = -1; cOffset <= 1; cOffset++) {
            if (rOffset === 0 && cOffset === 0) continue;
            const nRow = row + rOffset;
            const nCol = col + cOffset;
            if (
                nRow >= 0 &&
                nRow < currentGrid.length &&
                nCol >= 0 &&
                nCol < currentGrid[0].length
            ) {
                const cell = currentGrid[nRow][nCol];
                if (cell > 0) {
                    count++;
                    colorCounts[cell]++;
                }
            }
        }
    }
    // tie break if multiple colors have same max count
    let maxCount = 0;
    let numDominant = 0;
    for (let i = 1; i <= 4; i++) {
        if (colorCounts[i] > maxCount) {
            maxCount = colorCounts[i];
            dominantColors[0] = i;
            numDominant = 1;
        } else if (colorCounts[i] === maxCount && maxCount > 0) {
            dominantColors[numDominant++] = i;
        }
    }
    neighborResult.count = count;
    neighborResult.dominantColor = numDominant > 0
        ? dominantColors[Math.floor(Math.random() * numDominant)]
        : 0;
    return neighborResult;
}

function nextGeneration() {
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const currentCell = grid[row][col];
            const alive = currentCell > 0;
            const { count, dominantColor } = getNeighborInfo(row, col, grid);

            if (alive) {
                if (count === 2 || count === 3) {
                    gridBuffer[row][col] = dominantColor;
                } else {
                    gridBuffer[row][col] = 0; // die
                }
            } else {
                if (count === 3) {
                    gridBuffer[row][col] = dominantColor;
                } else if (Math.random() < spawnChance) {
                    gridBuffer[row][col] = Math.floor(Math.random() * 4) + 1;
                } else {
                    gridBuffer[row][col] = 0; // stay dead
                }
            }
        }
    }
    const temp = grid;
    grid = gridBuffer;
    gridBuffer = temp;
}


let lastFrameTime = 0;
let frameCount = 0;

function step(currentTime) {
    requestAnimationFrame(step);

    // Clock and metrics always update regardless of state
    updateClock();
    updateMetricsPanel(currentTime);

    // Game over shows night mode simulation behind the winner panel
    if (currentState === STATE_GAME_OVER) {
        if (currentTime - lastFrameTime < frameInterval) {
            updateGameoverCountdown();
            return;
        }
        lastFrameTime = currentTime;

        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        nextGeneration();
        updateTrail();
        drawGrid();
        updateGameoverCountdown();
        return;
    }

    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;
    frameCount++;

    if (currentEvent === EVENT_COMETS) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        if (frameCount % cometSpawnInterval === 0) {
            spawnExplosion();
        }
        if (frameCount % scoreboardInterval === 0) {
            updateScoreboard(false, currentTime);
        }
        drawGrid();
        return;
    }

    if (currentEvent === EVENT_DROUGHT) {
        lowerSpawnChance();
    }

    if (currentState === STATE_PAUSED) {
        return;
    }

    if (currentState === STATE_PRE_RUN) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        updateCountdown();
        drawGrid();
        return;
    }

    if (currentState === STATE_NIGHT) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        nextGeneration();
        updateTrail();
        drawGrid();
        return;
    }

    if (currentState === STATE_RUNNING) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        nextGeneration();
        updateTrail();
        if (frameCount % scoreboardInterval === 0) {
            updateScoreboard(false, currentTime);
        }
        drawGrid();
    }
}

requestAnimationFrame(step);


// ================================
// 7. SERVER POLLING (Display-Only Client)
// ================================

// Poll the server for game state - server is the single source of truth
async function pollServer() {
    try {
        const response = await fetch('/api/game');
        const serverState = await response.json();

        // Track admin version for logging
        if (serverState.adminStateVersion !== lastKnownAdminVersion) {
            console.log(`State update (v${lastKnownAdminVersion} -> v${serverState.adminStateVersion})`);
            lastKnownAdminVersion = serverState.adminStateVersion;
        }

        await applyServerState(serverState);
    } catch (error) {
        console.error('Failed to poll server:', error);
    }
}

// Send grid data to server (for backup/restore only)
async function sendGridToServer() {
    try {
        await fetch('/api/game/grid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grid: grid,
                trailGrid: trailGrid,
                teamCounts: [...teamCounts],
                gridDimensions: { rows, cols },
                currentEvent: currentEvent,
                spawnChance: spawnChance,
            })
        });
    } catch (error) {
        console.error('Failed to send grid to server:', error);
    }
}

// Apply state received from server
async function applyServerState(state) {
    const prevState = currentState;
    const prevPhase = currentPhase;

    // Check if state changed
    const stateChanged = state.currentState !== currentState;
    const phaseChanged = state.currentPhase !== currentPhase;

    // Apply core state from server
    pregameStartTime = state.pregameStartTime;
    gameOverStartTime = state.gameOverStartTime;

    // Apply palette and team info from server
    if (state.teamColors) teamColors = state.teamColors;
    if (state.currentPaletteName) currentPaletteName = state.currentPaletteName;
    if (state.currentCategoryName) currentCategoryName = state.currentCategoryName;
    if (state.actualTeamNames) actualTeamNames = state.actualTeamNames;
    if (state.isNightPalette !== undefined) isNightPalette = state.isNightPalette;
    if (state.spawnChance !== undefined) spawnChance = state.spawnChance;

    // Update derived state
    updateColorRGB();
    initTeamColors();

    // Restore grid from server if available and dimensions match
    if (state.grid && state.gridDimensions?.rows === rows && state.gridDimensions?.cols === cols) {
        // Only restore if we don't have a grid yet (initial load)
        if (!grid || grid.length === 0) {
            grid = state.grid;
            trailGrid = state.trailGrid || trailGrid;
            if (state.teamCounts) {
                for (let i = 0; i <= 4; i++) {
                    teamCounts[i] = state.teamCounts[i] || 0;
                }
            }
        }
    }

    // Handle state transitions
    if (stateChanged || phaseChanged) {
        currentState = state.currentState;
        currentPhase = state.currentPhase;
        await handleStateChange(state.currentState, prevState);
    }
}

// Handle UI transitions based on state changes
async function handleStateChange(newState, oldState) {
    switch (newState) {
        case STATE_PRE_RUN:
            exitNightState();
            hideGameoverPanel();
            if (oldState !== STATE_PRE_RUN) {
                resetGrid();
            }
            await fetchStats();
            updatePregamePanel();
            showPregamePanel();
            updateHeaderBarTeams();
            break;
        case STATE_RUNNING:
            exitNightState();
            hidePregamePanel();
            hideGameoverPanel();
            updateHeaderBarTeams();
            if (oldState === STATE_PRE_RUN) {
                resetGrid();
            }
            break;
        case STATE_GAME_OVER:
            updateScoreboard(true, 0);
            await showGameoverPanel();
            if (oldState !== STATE_GAME_OVER) {
                await recordGameEnd();
            }
            break;
        case STATE_NIGHT:
            hideGameoverPanel();
            hidePregamePanel();
            const headerBar = document.getElementById('header-bar');
            if (headerBar) headerBar.style.display = 'none';
            break;
        case STATE_PAUSED:
            hidePregamePanel();
            hideGameoverPanel();
            break;
    }

    // Update event display
    updateEventDisplay();
}

function updateEventDisplay() {
    const eventTextEl = document.getElementById('event-text');
    if (eventTextEl) {
        if (currentEvent === EVENT_COMETS) {
            eventTextEl.textContent = 'COMETS!';
            eventTextEl.classList.add('event-active');
        } else if (currentEvent === EVENT_DROUGHT) {
            eventTextEl.textContent = 'DROUGHT!';
            eventTextEl.classList.add('event-active');
        } else {
            eventTextEl.textContent = 'NO EVENT';
            eventTextEl.classList.remove('event-active');
        }
    }
}

// Toggle schedule via server
async function toggleSchedule() {
    try {
        const response = await fetch('/api/schedule/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        scheduleEnabled = data.enabled;
        console.log(`Schedule: ${scheduleEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        console.error('Failed to toggle schedule:', error);
    }
}

// Request game reset via admin API
async function resetGameState() {
    try {
        await fetch('/api/control/reset', { method: 'POST' });
        console.log('Game reset requested');
        // Next poll will pick up the new state
    } catch (error) {
        console.error('Failed to reset game state:', error);
    }
}

// Start polling and grid sending
function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (gridSendTimer) clearInterval(gridSendTimer);

    pollTimer = setInterval(pollServer, POLL_INTERVAL);
    gridSendTimer = setInterval(sendGridToServer, GRID_SEND_INTERVAL);
}

async function initialize() {
    // Initial poll to get server state
    await pollServer();

    // If no grid from server, initialize fresh
    if (!grid || grid.length === 0) {
        resetGrid();
    }

    // Start polling and grid sending
    startPolling();

    console.log('Client initialized - polling server for state');
}

// ================================
// 8. KEYBINDS (Debug/Local Only)
// ================================

const keybindsEl = document.getElementById('keybinds');
const eventTextEl = document.getElementById('event-text');

if (showKeybinds && keybindsEl) {
    keybindsEl.classList.add('visible');
}

// Note: State transitions are now server-controlled.
// These keybinds are for local debug/events only.

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        // Events (local only, sent to server via grid update)
        case '5':
            if (currentEvent === EVENT_COMETS) {
                currentEvent = null;
                if (eventTextEl) {
                    eventTextEl.textContent = 'NO EVENT';
                    eventTextEl.classList.remove('event-active');
                }
            } else {
                currentEvent = EVENT_COMETS;
                if (eventTextEl) {
                    eventTextEl.textContent = 'COMETS!';
                    eventTextEl.classList.add('event-active');
                }
            }
            break;
        case '6':
            if (currentEvent === EVENT_DROUGHT) {
                currentEvent = null;
                spawnChance = initialSpawnChance;
                if (eventTextEl) {
                    eventTextEl.textContent = 'NO EVENT';
                    eventTextEl.classList.remove('event-active');
                }
            } else {
                currentEvent = EVENT_DROUGHT;
                if (eventTextEl) {
                    eventTextEl.textContent = 'DROUGHT!';
                    eventTextEl.classList.add('event-active');
                }
            }
            break;
        case 'h':
        case 'H':
            if (keybindsEl) keybindsEl.classList.toggle('visible');
            break;
        // Debug toggles
        case 't':
        case 'T':
            debugShowTrails = !debugShowTrails;
            console.log(`Trails: ${debugShowTrails ? 'ON' : 'OFF'}`);
            break;
        case 'y':
        case 'Y':
            debugTrailsOnly = !debugTrailsOnly;
            console.log(`Trails Only: ${debugTrailsOnly ? 'ON' : 'OFF'}`);
            break;
        case 'd':
        case 'D':
            debugShowMetrics = !debugShowMetrics;
            break;
        case 's':
        case 'S':
            toggleSchedule();
            break;
        case 'r':
        case 'R':
            resetGameState();
            break;
    }
});

// Initialize - poll server for state, server is the single source of truth
initialize();
