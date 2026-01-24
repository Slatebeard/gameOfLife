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
const frameRate = 30;
const frameInterval = 1000 / frameRate;
const trailFade = 0.05; // higher = faster fade
const spawnChance = 0.0005;
const scoreboardInterval = 30;

const teamColors = [
    '#000000', // dead dont touch
    '#00f7ffff',
    '#ff0000ff',
    '#6802c1ff',
    '#ec07ddff'
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
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = time;
}

// Apply team colors from JS to DOM
function initTeamColors() {
    for (let i = 1; i <= 4; i++) {
        const el = document.querySelector(`.team-${i}`);
        if (el) el.style.color = teamColors[i];
    }
}
initTeamColors();


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

// Trail grid stores {color, brightness} for fade effect
let trailGrid = [];
for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
        const color = grid[r][c];
        row.push({ color: color, brightness: color > 0 ? 1 : 0 });
    }
    trailGrid.push(row);
}


// ================================
// 4. DRAW
// ================================

function drawGrid() {
    for (let row = 0; row < trailGrid.length; row++) {
        for (let col = 0; col < trailGrid[row].length; col++) {
            const { color, brightness } = trailGrid[row][col];
            const [r, g, b] = colorRGB[color];
            canvasContext.fillStyle = `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
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
                // Alive: full brightness, update color
                trailGrid[row][col] = { color: cell, brightness: 1 };
            } else {
                // Dead: fade brightness, keep last color
                trailGrid[row][col].brightness = Math.max(0, trailGrid[row][col].brightness - trailFade);
            }
        }
    }
}

drawGrid();

// ================================
// 5. ITERATE NEXT GEN
// ================================

function getNeighborInfo(row, col, currentGrid) {
    let count = 0;
    const colorCounts = [0, 0, 0, 0, 0]; // index 0 unused, 1-4 for colors

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
                    // Random spawn to prevent stagnation
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

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    grid = nextGeneration(grid);
    updateTrail();
    updateClock();
    if (frameCount % scoreboardInterval === 0) {
        updateScoreboard();
    }
    drawGrid();
}

requestAnimationFrame(step);
