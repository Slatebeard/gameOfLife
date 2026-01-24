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


// ================================
// 3. INIT STATE
// ================================

grid = [];

const rows = Math.floor(canvas.height / cellSize);
const cols = Math.floor(canvas.width / cellSize);

for (let r = 0; r < rows; r++) {
    const row = [];

    for (let c = 0; c < cols; c++) {
        // 50%
        row.push(Math.random() < 0.5 ? 0 : 1);
    }

    grid.push(row);
}


// ================================
// 4. DRAW
// ================================

function drawGrid(grid) {

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {

            canvasContext.fillStyle =
                grid[row][col] === 1 ? 'black' : 'white';

            canvasContext.fillRect(
                col * cellSize,
                row * cellSize,
                cellSize,
                cellSize
            );

            canvasContext.strokeRect(
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

function countNeighbors(row, col) {
    let count = 0;

    for (let rOffset = -1; rOffset <= 1; rOffset++) {
        for (let cOffset = -1; cOffset <= 1; cOffset++) {
            if (rOffset === 0 && cOffset === 0) continue;

            const nRow = row + rOffset;
            const nCol = col + cOffset;

            if (
                nRow >= 0 &&
                nRow < grid.length &&
                nCol >= 0 &&
                nCol < grid[0].length
            ) {
                count += grid[nRow][nCol];
            }
        }
    }

    return count;
}





function nextGeneration(currentGrid) {
    const newGrid = [];

    for (let row = 0; row < currentGrid.length; row++) {
        const newRow = [];

        for (let col = 0; col < currentGrid[row].length; col++) {

            // is alive
            const alive = currentGrid[row][col] === 1;

            // Count how many neighbors are alive
            const neighbors = countNeighbors(row, col);

            if (alive) {
                if (neighbors === 2 || neighbors === 3) {
                    newRow.push(1);
                } else {
                    newRow.push(0);
                }
            } else {
                if (neighbors === 3) {
                    newRow.push(1);
                } else {
                    newRow.push(0);
                }
            }
        }
        newGrid.push(newRow);
    }
    return newGrid;
}


function step() {
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    grid = nextGeneration(grid);
    drawGrid(grid);
    requestAnimationFrame(step);
}

requestAnimationFrame(step);
