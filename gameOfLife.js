// ================================
// 1. SET UP
// ================================

const canvas = document.getElementById('liveCanvas');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const canvasContext = canvas.getContext('2d');


// ================================
// 2. CONFIG
// ================================

const cellSize = 10;
const frameRate = 30; // frames per second
const frameInterval = 1000 / frameRate;
const colors = ['black', 'red', 'lime', 'blue', 'yellow'];


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
            // Random color 1-4
            row.push(Math.floor(Math.random() * 4) + 1);
        }
    }

    grid.push(row);
}


// ================================
// 4. DRAW
// ================================

function drawGrid(grid) {

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            canvasContext.fillStyle = colors[grid[row][col]];
            canvasContext.fillRect(
                col * cellSize,
                row * cellSize,
                cellSize,
                cellSize
            );

        }
    }
}

drawGrid(grid);

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

    // Find dominant color (random tie-break)
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
                    // Survive, but take dominant neighbor color (can be "eaten")
                    newRow.push(dominantColor);
                } else {
                    newRow.push(0); // die
                }
            } else {
                if (count === 3) {
                    // Born with dominant neighbor color
                    newRow.push(dominantColor);
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

function step(currentTime) {
    requestAnimationFrame(step);

    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    grid = nextGeneration(grid);
    drawGrid(grid);
}

requestAnimationFrame(step);
