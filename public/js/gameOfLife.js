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

function updatePregamePanel() {
    const paletteNameEl = document.getElementById('panel-palette-name');
    if (paletteNameEl) paletteNameEl.textContent = currentPaletteName;

    for (let i = 1; i <= 4; i++) {
        const swatch = document.getElementById(`swatch-${i}`);
        const hexLabel = document.getElementById(`hex-${i}`);
        if (swatch) swatch.style.backgroundColor = teamColors[i];
        if (hexLabel) hexLabel.textContent = teamColors[i];
    }

    const categoryNameEl = document.getElementById('panel-category-name');
    if (categoryNameEl) categoryNameEl.textContent = currentCategoryName;

    for (let i = 1; i <= 4; i++) {
        const teamEl = document.getElementById(`panel-team-${i}`);
        const nameEl = document.getElementById(`name-${i}`);
        if (teamEl && nameEl) {
            teamEl.textContent = nameEl.textContent;
            teamEl.style.color = teamColors[i];
        }
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
        const nameEl = document.getElementById(`name-${i}`);
        teams.push({
            name: nameEl ? nameEl.textContent : `Team ${i}`,
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

        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById(`name-${i}`);
            if (el) el.textContent = selectedNames[i - 1];
        }

        const categoryLabel = document.getElementById('category-label');
        if (categoryLabel) categoryLabel.textContent = randomCategory;

        equalizeTeamLabelWidths();

        console.log(`Category: ${randomCategory}`);
    } catch (error) {
        console.error('Failed to load team names:', error);
    }
}

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
        return;
    }

    if (currentState === STATE_PAUSED) {
        return;
    }

    if (currentState === STATE_PRE_RUN) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
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
            hidePregamePanel();
            break;
        case '3':
            currentState = STATE_PAUSED;
            break;
        case '4':
            currentState = STATE_GAME_OVER;
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
    }
});
