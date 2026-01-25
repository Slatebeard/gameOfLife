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

// phase timing config (minutes from pregame start)
const phaseTimings = {
    [PHASE_PALETTE]: 0,    // immediate
    [PHASE_TEAMS]: 10,     // +10 min
    [PHASE_STATS]: 20,     // +20 min
    [PHASE_READY]: 25      // +25 min = game start
};

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

function showGameoverPanel() {
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

    gameOverStartTime = Date.now();
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

    if (remainingMs === 0) {
        enterNightState();
    }
}

async function enterNightState() {
    currentState = STATE_NIGHT;
    hideGameoverPanel();
    hidePregamePanel();

    // Hide header bar
    const headerBar = document.getElementById('header-bar');
    if (headerBar) headerBar.style.display = 'none';

    await assignNightPalette();

    console.log('Entering night mode');
}

function exitNightState() {
    // Show header bar again
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

function getNextPhase() {
    switch (currentPhase) {
        case PHASE_PALETTE: return PHASE_TEAMS;
        case PHASE_TEAMS: return PHASE_STATS;
        case PHASE_STATS: return PHASE_READY;
        default: return null;
    }
}

function advancePhase() {
    const nextPhase = getNextPhase();
    if (nextPhase) {
        currentPhase = nextPhase;
        updateHeaderBarTeams();
        updatePregamePanel();
    }
}

function updateCountdown() {
    const countdownEl = document.getElementById('pregame-countdown');
    const countdownTimeEl = document.getElementById('countdown-time');
    const countdownLabelEl = document.getElementById('countdown-label');

    if (!countdownEl || !countdownTimeEl || !countdownLabelEl) return;

    if (currentPhase === PHASE_READY) {
        countdownLabelEl.textContent = 'Starting soon';
        countdownTimeEl.textContent = '';
        return;
    }

    const nextPhase = getNextPhase();
    if (!nextPhase || !pregameStartTime) {
        countdownEl.style.display = 'none';
        return;
    }

    countdownEl.style.display = 'flex';

    const nextPhaseTime = pregameStartTime + (phaseTimings[nextPhase] * 60 * 1000);
    const now = Date.now();
    const remainingMs = Math.max(0, nextPhaseTime - now);

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    switch (nextPhase) {
        case PHASE_TEAMS:
            countdownLabelEl.textContent = 'Teams reveal in';
            break;
        case PHASE_STATS:
            countdownLabelEl.textContent = 'Stats reveal in';
            break;
        case PHASE_READY:
            countdownLabelEl.textContent = 'Ready in';
            break;
    }

    countdownTimeEl.textContent = timeStr;

    if (remainingMs === 0) {
        advancePhase();
    }
}

async function assignRandomPalette() {
    try {
        const response = await fetch('/data/palettes.json');
        const data = await response.json();

        const paletteNames = Object.keys(data.palettes);
        const randomName = paletteNames[Math.floor(Math.random() * paletteNames.length)];
        const colors = data.palettes[randomName];

        currentPaletteName = randomName;

        for (let i = 0; i < 4; i++) {
            teamColors[i + 1] = colors[i];
        }

        updateColorRGB();
        initTeamColors();

        console.log(`Palette: ${randomName}`);
    } catch (error) {
        console.error('Failed to load palette:', error);
    }
}

async function assignNightPalette() {
    try {
        const response = await fetch('/data/palettes.json');
        const data = await response.json();

        const paletteNames = Object.keys(data.nightPalettes);
        const randomName = paletteNames[Math.floor(Math.random() * paletteNames.length)];
        const colors = data.nightPalettes[randomName];

        currentPaletteName = randomName;

        for (let i = 0; i < 4; i++) {
            teamColors[i + 1] = colors[i];
        }

        updateColorRGB();
        initTeamColors();

        console.log(`Night Palette: ${randomName}`);
    } catch (error) {
        console.error('Failed to load night palette:', error);
    }
}

const teamCounts = [0, 0, 0, 0, 0];

function updateScoreboard() {
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

    sendScoresToServer();
}

function sendScoresToServer() {
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

async function assignRandomTeamNames() {
    try {
        const response = await fetch('/data/teamNames.json');
        const data = await response.json();

        const categoryKeys = Object.keys(data.categories);
        const randomCategory = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
        const names = data.categories[randomCategory];

        currentCategoryName = randomCategory;

        const shuffled = [...names].sort(() => Math.random() - 0.5);
        const selectedNames = shuffled.slice(0, 4);

        // Store actual names for later reveal
        for (let i = 0; i < 4; i++) {
            actualTeamNames[i] = selectedNames[i];
        }

        // Update header bar display based on current phase
        updateHeaderBarTeams();

        console.log(`Category: ${randomCategory}`);
    } catch (error) {
        console.error('Failed to load team names:', error);
    }
}

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

fetchStats();
assignRandomPalette();
assignRandomTeamNames();


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
    updateScoreboard();
    drawGrid();
}

resetGrid();

updateScoreboard();

// ================================
// 4. DRAW
// ================================

function drawGrid() {
    for (let row = 0; row < trailGrid.length; row++) {
        for (let col = 0; col < trailGrid[row].length; col++) {
            const { color, brightness } = trailGrid[row][col];
            if (brightness === 0) continue;
            const [r, g, b] = colorRGB[color];
            canvasContext.fillStyle = `rgba(${r * brightness}, ${g * brightness}, ${b * brightness}, ${brightness})`;
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
                trailGrid[row][col].brightness = Math.max(0, trailGrid[row][col].brightness - trailFade);
            }
        }
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

    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;
    frameCount++;

    updateClock();

    if (currentEvent === EVENT_COMETS) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        if (frameCount % cometSpawnInterval === 0) {
            spawnExplosion();
        }
        if (frameCount % scoreboardInterval === 0) {
            updateScoreboard();
        }
        drawGrid();
        return;
    }

    if (currentEvent === EVENT_DROUGHT) {
        lowerSpawnChance();
    }

    if (currentState === STATE_GAME_OVER) {
        updateGameoverCountdown();
        return;
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
            updateScoreboard();
        }
        drawGrid();
    }
}

requestAnimationFrame(step);


// ================================
// 7. KEYBINDS
// ================================

const keybindsEl = document.getElementById('keybinds');
const eventTextEl = document.getElementById('event-text');

if (showKeybinds && keybindsEl) {
    keybindsEl.classList.add('visible');
}

async function enterPregameState() {
    currentState = STATE_PRE_RUN;
    currentPhase = PHASE_PALETTE;
    pregameStartTime = Date.now();
    exitNightState();
    hideGameoverPanel();
    await fetchStats();
    await assignRandomPalette();
    await assignRandomTeamNames();
    resetGrid();
    updatePregamePanel();
    showPregamePanel();
}

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case '1':
            enterPregameState();
            break;
        case '2':
            currentState = STATE_RUNNING;
            currentPhase = PHASE_READY; // Ensure teams are revealed when game starts
            updateHeaderBarTeams();
            hidePregamePanel();
            hideGameoverPanel();
            break;
        case '3':
            currentState = STATE_PAUSED;
            break;
        case '4':
            currentState = STATE_GAME_OVER;
            updateScoreboard(); // Ensure final scores are counted
            showGameoverPanel();
            recordGameEnd();
            break;
        case '5':
            if (currentEvent === EVENT_COMETS) {
                currentEvent = null;
                currentState = STATE_RUNNING;
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
        case ']':
            if (currentState === STATE_PRE_RUN) {
                advancePhase();
            }
            break;
        case '0':
            enterNightState();
            break;
    }
});
