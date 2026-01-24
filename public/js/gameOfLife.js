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

const cellSize = 8;
const frameRate = 14;
const frameInterval = 1000 / frameRate;
const trailFade = 0.005; // closer to 1 = faster fade
let spawnChance = 0.0005;
const scoreboardInterval = 5;
const showKeybinds = false; // toggle keybinds panel visibility

// game states
const STATE_PRE_RUN = 'preRun';
const STATE_RUNNING = 'running';
const STATE_GAME_OVER = 'gameOver';
const STATE_PAUSED = 'paused';


// event states
const EVENT_COMETS = 'comets';

// comet event config
const cometMinRadius = 3;
const cometMaxRadius = 12;


const cometSpawnInterval = Math.floor(Math.random() * 12) + 2; // spawn every 2-10 frames

let currentState = STATE_RUNNING;
let currentEvent = null;

const teamColors = [
    '#000000', // dead dont touch, fully transparent
    '#E63946',
    '#457B9D',
    '#2A9D8F',
    '#F4A261'
];

function hexToRGB(hex) {
    // regex magic, no idea how it works, thanks gippity
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);

    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
}

const colorRGB = teamColors.map(hexToRGB);

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

        const shuffled = [...names].sort(() => Math.random() - 0.5);
        const selectedNames = shuffled.slice(0, 4);

        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById(`name-${i}`);
            if (el) el.textContent = selectedNames[i - 1];
        }
    } catch (error) {
        console.error('Failed to load team names:', error);
    }
}

assignRandomTeamNames();


// ================================
// 3. INIT STATE
// ================================

grid = [];

const rows = Math.floor(canvas.height / cellSize);
const cols = Math.floor(canvas.width / cellSize);

for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.5) {
            row.push(0); // dead
        } else {
            // random color, like rain
            row.push(Math.floor(Math.random() * 4) + 1);
        }
    }
    grid.push(row);
}

let trailGrid = [];
for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
        const color = grid[r][c];
        row.push({ color: color, brightness: color > 0 ? 1 : 0 });
    }
    trailGrid.push(row);
}

// Initial scoreboard update
updateScoreboard();


// ================================
// 4. DRAW
// ================================

function drawGrid() {
    for (let row = 0; row < trailGrid.length; row++) {
        for (let col = 0; col < trailGrid[row].length; col++) {
            const { color, brightness } = trailGrid[row][col];
            // Skip fully faded cells to show background through canvas
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
                trailGrid[row][col] = { color: cell, brightness: 1 };
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
            // Check if within circle
            if (r * r + c * c <= radius * radius) {
                const targetRow = centerRow + r;
                const targetCol = centerCol + c;
                // Bounds check
                if (targetRow >= 0 && targetRow < rows && targetCol >= 0 && targetCol < cols) {
                    grid[targetRow][targetCol] = color;
                    // Set brightness to 0 for dead cells (transparent holes)
                    trailGrid[targetRow][targetCol] = { color: color, brightness: color > 0 ? 1 : 0 };
                }
            }
        }
    }
}


// ================================
// 6. ITERATE NEXT GEN
// ================================

function getNeighborInfo(row, col, currentGrid) {
    let count = 0;
    const colorCounts = [0, 0, 0, 0, 0]; // index 0 used for dead, 1-4 for colors

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
    // tie brake if multiple colors have same max count
    let maxCount = 0;
    let dominantColors = [];
    for (let i = 1; i <= 4; i++) {
        if (colorCounts[i] > maxCount) {
            maxCount = colorCounts[i];
            dominantColors = [i];
        } else if (colorCounts[i] === maxCount && maxCount > 0) {
            dominantColors.push(i);
        }
    }
    const dominantColor =
        dominantColors.length > 0
            ? dominantColors[Math.floor(Math.random() * dominantColors.length)]
            : 0;
    return { count, dominantColor };
}

function nextGeneration(currentGrid) {
    const newGrid = [];

    for (let row = 0; row < currentGrid.length; row++) {
        const newRow = [];

        for (let col = 0; col < currentGrid[row].length; col++) {
            const currentCell = currentGrid[row][col];
            const alive = currentCell > 0;
            const { count, dominantColor } = getNeighborInfo(row, col, currentGrid);

            if (alive) {
                if (count === 2 || count === 3) {
                    newRow.push(dominantColor);
                } else {
                    newRow.push(0); // die
                }
            } else {
                if (count === 3) {
                    newRow.push(dominantColor);
                } else if (Math.random() < spawnChance) {
                    newRow.push(Math.floor(Math.random() * 4) + 1);
                } else {
                    newRow.push(0); // stay dead
                }
            }
        }
        newGrid.push(newRow);
    }
    return newGrid;
}


let lastFrameTime = 0;
let frameCount = 0;

function step(currentTime) {
    requestAnimationFrame(step);

    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;
    frameCount++;

    updateClock();

    // Event takes priority over game state
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
        grid = nextGeneration(grid);
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

// Show keybinds on load if config enabled
if (showKeybinds && keybindsEl) {
    keybindsEl.classList.add('visible');
}

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case '1':
            currentState = STATE_PRE_RUN;
            break;
        case '2':
            currentState = STATE_RUNNING;
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
        case 'h':
        case 'H':
            if (keybindsEl) keybindsEl.classList.toggle('visible');
            break;
    }
});
