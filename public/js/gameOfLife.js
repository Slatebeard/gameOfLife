// ================================
// 1. SET UP
// ================================

const canvas = document.getElementById("liveCanvas");

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

const cols = Math.floor(window.innerWidth / cellSize);
const rows = Math.floor(window.innerHeight / cellSize);

canvas.width = cols;
canvas.height = rows;
canvas.style.width = window.innerWidth + "px";
canvas.style.height = window.innerHeight + "px";
canvas.style.imageRendering = "pixelated";
canvas.style.imageRendering = "crisp-edges";

const canvasContext = canvas.getContext("2d", { alpha: false });
canvasContext.imageSmoothingEnabled = false;

const imageData = canvasContext.createImageData(cols, rows);
const pixels32 = new Uint32Array(imageData.data.buffer);

const BRIGHTNESS_LEVELS = 201; // 0-200 scale for slower fade
let colorCache32 = [];

function buildColorCache() {
    colorCache32 = [];
    for (let c = 0; c < colorRGB.length; c++) {
        const brightnessLevels = new Uint32Array(BRIGHTNESS_LEVELS);
        const [r, g, b] = colorRGB[c];
        for (let bl = 0; bl < BRIGHTNESS_LEVELS; bl++) {
            const factor = bl / 200;
            const ri = (r * factor) | 0;
            const gi = (g * factor) | 0;
            const bi = (b * factor) | 0;
            brightnessLevels[bl] = 0xFF000000 | (bi << 16) | (gi << 8) | ri;
        }
        colorCache32.push(brightnessLevels);
    }
}

const BLACK_PIXEL = 0xFF000000;

document.documentElement.style.setProperty("--ui-scale", fontScale);

const frameRate = 10
const frameInterval = 1000 / frameRate;
const trailFade = 0.005; // closer to 1 = faster fade
const initialSpawnChance = 0.00005;
let spawnChance = initialSpawnChance;
const scoreboardInterval = 5;
const showKeybinds = false;

// debug toggles
let debugShowTrails = true;
let debugTrailsOnly = false;
let debugShowMetrics = false;
let scheduleEnabled = false;

// polling configuration
const POLL_INTERVAL = 10000;
const GRID_SEND_INTERVAL = 60000;
let lastKnownAdminVersion = 0;
let isInitialLoad = true;

// performance metrics
let fpsCounter = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// sync rate limiter for scores display
const SYNC_RATE_LIMIT_MS = 120000;
let lastSyncTs = 0;
let pollTimer = null;
let gridSendTimer = null;

// game states
const STATE_PRE_RUN = "preRun";
const STATE_RUNNING = "running";
const STATE_GAME_OVER = "gameOver";
const STATE_PAUSED = "paused";
const STATE_NIGHT = "night";

// pregame phases
const PHASE_PALETTE = "palette";
const PHASE_TEAMS = "teams";
const PHASE_STATS = "stats";
const PHASE_READY = "ready";

let currentPhase = PHASE_PALETTE;
let pregameStartTime = null;
let gameOverStartTime = null;
const NIGHT_MODE_DELAY = 10 * 60 * 1000;

// event states
const EVENT_COMETS = "comets";
const EVENT_DROUGHT = "drought";

// comet event config
const cometMinRadius = 3;
const cometMaxRadius = 12;

const cometSpawnInterval = Math.floor(Math.random() * 12) + 2;

let currentState = STATE_PRE_RUN;
let currentEvent = null;

// index 0 is dead (transparent), indices 1-4 are team colors
let teamColors = [
    "#000000", // dead, dont touch
    "#E63946",
    "#457B9D",
    "#2A9D8F",
    "#F4A261",
];

let currentPaletteName = "";
let currentCategoryName = "";
let actualTeamNames = ["", "", "", ""];
let gameStats = null;
let isNightPalette = false;

function hexToRGB(hex) {
    // regex magic, no idea how it works, thanks gippity
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(
        hex,
    );

    return result
        ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16),
        ]
        : [0, 0, 0];
}

let colorRGB = teamColors.map(hexToRGB);
buildColorCache();

function updateColorRGB() {
    colorRGB = teamColors.map(hexToRGB);
    // Ensure dead cell color is always pure black
    colorRGB[0] = [0, 0, 0];
    // Rebuild color cache with new colors
    buildColorCache();
}

function equalizeTeamLabelWidths() {
    const labels = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`name-${i}`);
        if (el) {
            el.style.width = "auto";
            labels.push(el);
        }
    }
    const maxWidth = Math.max(...labels.map((el) => el.offsetWidth));
    labels.forEach((el) => {
        el.style.width = `${maxWidth}px`;
    });
}

function showPregamePanel() {
    const panel = document.getElementById("pregame-panel");
    if (panel) panel.classList.add("visible");
}

function hidePregamePanel() {
    const panel = document.getElementById("pregame-panel");
    if (panel) panel.classList.remove("visible");
}

async function showGameoverPanel() {
    const panel = document.getElementById("gameover-panel");
    const winnerEl = document.getElementById("gameover-winner");
    const scoreEl = document.getElementById("gameover-score");

    const winner = getWinner();

    if (winnerEl) {
        if (winner) {
            winnerEl.textContent = winner.name;
            winnerEl.style.color = winner.color;
        } else {
            winnerEl.textContent = "No one";
            winnerEl.style.color = "";
        }
    }

    if (scoreEl) {
        if (winner) {
            scoreEl.textContent = `${winner.count.toLocaleString()} cells`;
        } else {
            scoreEl.textContent = "";
        }
    }

    if (panel) panel.classList.add("visible");
}

function hideGameoverPanel() {
    const panel = document.getElementById("gameover-panel");
    if (panel) panel.classList.remove("visible");
}

function updateGameoverCountdown() {
    const countdownTimeEl = document.getElementById("gameover-countdown-time");
    if (!countdownTimeEl || !gameOverStartTime) return;

    const now = Date.now();
    const elapsed = now - gameOverStartTime;
    const remainingMs = Math.max(0, NIGHT_MODE_DELAY - elapsed);

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    countdownTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function enterNightVisuals() {
    hideGameoverPanel();
    hidePregamePanel();

    const headerBar = document.getElementById("header-bar");
    if (headerBar) headerBar.style.display = "none";

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    console.log("Entering night mode visuals");
}

function exitNightState() {
    const headerBar = document.getElementById("header-bar");
    if (headerBar) headerBar.style.display = "flex";
}

function updatePregamePanel() {
    const paletteNameEl = document.getElementById("panel-palette-name");
    const categoryNameEl = document.getElementById("panel-category-name");
    const teamListEl = document.getElementById("panel-team-list");
    const statsSection = document.querySelector(".panel-right");

    if (paletteNameEl) paletteNameEl.textContent = currentPaletteName;

    for (let i = 1; i <= 4; i++) {
        const swatch = document.getElementById(`swatch-${i}`);
        const hexLabel = document.getElementById(`hex-${i}`);
        if (swatch) swatch.style.backgroundColor = teamColors[i];
        if (hexLabel) hexLabel.textContent = teamColors[i];
    }

    const teamsRevealed =
        currentPhase === PHASE_TEAMS ||
        currentPhase === PHASE_STATS ||
        currentPhase === PHASE_READY;

    if (categoryNameEl) {
        if (teamsRevealed) {
            categoryNameEl.textContent = currentCategoryName;
            categoryNameEl.classList.remove("panel-placeholder");
        } else {
            categoryNameEl.textContent = "???";
            categoryNameEl.classList.add("panel-placeholder");
        }
    }

    for (let i = 1; i <= 4; i++) {
        const teamEl = document.getElementById(`panel-team-${i}`);
        if (teamEl) {
            if (teamsRevealed) {
                teamEl.textContent = actualTeamNames[i - 1];
                teamEl.style.color = teamColors[i];
                teamEl.classList.remove("panel-placeholder");
            } else {
                teamEl.textContent = "???";
                teamEl.style.color = "rgba(255, 255, 255, 0.5)";
                teamEl.classList.add("panel-placeholder");
            }
        }
    }

    const statsRevealed =
        currentPhase === PHASE_STATS || currentPhase === PHASE_READY;
    const lastWinnerEl = document.getElementById("stat-last-winner");
    const mostPaletteEl = document.getElementById("stat-most-palette");
    const mostCategoryEl = document.getElementById("stat-most-category");
    const highestScoreEl = document.getElementById("stat-highest-score");

    if (lastWinnerEl) {
        if (statsRevealed && gameStats) {
            lastWinnerEl.classList.remove("panel-placeholder");
            if (gameStats.lastWinner?.name) {
                lastWinnerEl.textContent = gameStats.lastWinner.name;
                lastWinnerEl.style.color = gameStats.lastWinner.color;
            } else {
                lastWinnerEl.textContent = "-";
                lastWinnerEl.style.color = "";
            }
        } else {
            lastWinnerEl.textContent = "???";
            lastWinnerEl.style.color = "";
            lastWinnerEl.classList.add("panel-placeholder");
        }
    }

    if (mostPaletteEl) {
        if (statsRevealed && gameStats) {
            mostPaletteEl.classList.remove("panel-placeholder");
            mostPaletteEl.textContent = gameStats.mostPlayedPalette?.name || "-";
        } else {
            mostPaletteEl.textContent = "???";
            mostPaletteEl.classList.add("panel-placeholder");
        }
    }

    if (mostCategoryEl) {
        if (statsRevealed && gameStats) {
            mostCategoryEl.classList.remove("panel-placeholder");
            mostCategoryEl.textContent = gameStats.mostPlayedCategory?.name || "-";
        } else {
            mostCategoryEl.textContent = "???";
            mostCategoryEl.classList.add("panel-placeholder");
        }
    }

    if (highestScoreEl) {
        if (statsRevealed && gameStats) {
            highestScoreEl.classList.remove("panel-placeholder");
            if (gameStats.highestScore?.name) {
                highestScoreEl.textContent = `${gameStats.highestScore.name} (${gameStats.highestScore.count.toLocaleString()})`;
                highestScoreEl.style.color = gameStats.highestScore.color;
            } else {
                highestScoreEl.textContent = "-";
                highestScoreEl.style.color = "";
            }
        } else {
            highestScoreEl.textContent = "???";
            highestScoreEl.style.color = "";
            highestScoreEl.classList.add("panel-placeholder");
        }
    }

    updateCountdown();
}

function updateCountdown() {
    const countdownEl = document.getElementById("pregame-countdown");
    const countdownTimeEl = document.getElementById("countdown-time");
    const countdownLabelEl = document.getElementById("countdown-label");

    if (!countdownEl || !countdownTimeEl || !countdownLabelEl) return;

    // Show phase status based on current phase (server-controlled)
    switch (currentPhase) {
        case PHASE_PALETTE:
            countdownLabelEl.textContent = "Waiting for teams...";
            countdownTimeEl.textContent = "";
            break;
        case PHASE_TEAMS:
            countdownLabelEl.textContent = "Waiting for stats...";
            countdownTimeEl.textContent = "";
            break;
        case PHASE_STATS:
            countdownLabelEl.textContent = "Getting ready...";
            countdownTimeEl.textContent = "";
            break;
        case PHASE_READY:
            countdownLabelEl.textContent = "Starting soon";
            countdownTimeEl.textContent = "";
            break;
        default:
            countdownEl.style.display = "none";
            return;
    }

    countdownEl.style.display = "flex";
}

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
    if (!forceSync && currentTime - lastSyncTs < SYNC_RATE_LIMIT_MS) {
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
            count: teamCounts[i],
        });
    }

    const eventEl = document.getElementById("event-text");
    const event = eventEl ? eventEl.textContent : "NO EVENT";

    fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams, event }),
    }).catch(() => { }); // ignore errors
}

async function fetchStats() {
    try {
        const response = await fetch("/api/stats");
        gameStats = await response.json();
        return gameStats;
    } catch (error) {
        console.error("Failed to fetch stats:", error);
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
            count: maxCount,
        };
    }
    return null;
}

async function recordGameEnd() {
    const winner = getWinner();
    try {
        const response = await fetch("/api/game-end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                winner,
                palette: currentPaletteName,
                category: currentCategoryName,
            }),
        });
        const result = await response.json();
        if (result.stats) {
            gameStats = result.stats;
        }
    } catch (error) {
        console.error("Failed to record game end:", error);
    }
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB"); // HH:MM:SS format
    const date = now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const clockEl = document.getElementById("clock");
    const dateEl = document.getElementById("date");
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

function updateHeaderBarTeams() {
    const teamsRevealed =
        currentPhase === PHASE_TEAMS ||
        currentPhase === PHASE_STATS ||
        currentPhase === PHASE_READY;

    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`name-${i}`);
        if (el) {
            if (teamsRevealed) {
                el.textContent = actualTeamNames[i - 1];
            } else {
                el.textContent = "???";
            }
        }
    }

    const categoryLabel = document.getElementById("category-label");
    if (categoryLabel) {
        if (teamsRevealed) {
            categoryLabel.textContent = currentCategoryName;
        } else {
            categoryLabel.textContent = "???";
        }
    }

    equalizeTeamLabelWidths();
}

// ================================
// 3. INIT STATE
// ================================

// Use Uint8Array rows for better cache performance
let grid = [];
let gridBuffer = [];
// Trail data as separate typed arrays (brightness 0-100 as uint8)
let trailColor = [];
let trailBrightness = [];

// Trail fade as integer (0-200 scale for slower fade)
const trailFadeInt = Math.round(trailFade * 200);

function resetGrid() {
    grid = [];
    gridBuffer = [];
    trailColor = [];
    trailBrightness = [];

    for (let r = 0; r < rows; r++) {
        const row = new Uint8Array(cols);
        const bufferRow = new Uint8Array(cols);
        const tColor = new Uint8Array(cols);
        const tBright = new Uint8Array(cols);

        for (let c = 0; c < cols; c++) {
            if (Math.random() < 0.5) {
                row[c] = 0;
                tColor[c] = 0;
                tBright[c] = 0;
            } else {
                const color = ((Math.random() * 4) | 0) + 1;
                row[c] = color;
                tColor[c] = color;
                tBright[c] = 200; // Full brightness
            }
        }
        grid.push(row);
        gridBuffer.push(bufferRow);
        trailColor.push(tColor);
        trailBrightness.push(tBright);
    }

    updateScoreboard(true, 0);
    updateTrailAndDraw();
}

// ================================
// 4. DRAW
// ================================

// Combined trail update + draw using Uint32Array for fast pixel writes
// Each cell = 1 pixel, CSS scales to full screen
function updateTrailAndDraw() {
    const px = pixels32;
    let idx = 0;

    for (let row = 0; row < rows; row++) {
        const gridRow = grid[row];
        const tColor = trailColor[row];
        const tBright = trailBrightness[row];

        for (let col = 0; col < cols; col++) {
            const cell = gridRow[col];
            let brightness = tBright[col];

            // Update trail state
            if (cell > 0) {
                tColor[col] = cell;
                brightness = 200;
            } else if (brightness > 0) {
                brightness = brightness > trailFadeInt ? brightness - trailFadeInt : 0;
                if (brightness === 0) tColor[col] = 0;
            }
            tBright[col] = brightness;

            // Get pixel color (single 32-bit write)
            let pixel = BLACK_PIXEL;

            if (brightness > 0) {
                // Apply debug filters
                if (!(debugTrailsOnly && brightness === 200) &&
                    !(!debugShowTrails && brightness < 200)) {
                    pixel = colorCache32[tColor[col]][brightness];
                }
            }

            px[idx++] = pixel;
        }
    }

    canvasContext.putImageData(imageData, 0, 0);
}

// Legacy function names for compatibility (calls combined function)
function drawGrid() {
    updateTrailAndDraw();
}

function updateTrail() {
    // Trail update is now combined with drawGrid in updateTrailAndDraw
    // This function is kept for compatibility but does nothing
}

function updateMetricsPanel(currentTime) {
    fpsCounter++;
    if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = fpsCounter;
        fpsCounter = 0;
        lastFpsUpdate = currentTime;
    }

    const panel = document.getElementById("debug-panel");
    if (!panel) return;

    if (debugShowMetrics) {
        panel.classList.add("visible");

        let liveCells = 0;
        for (let i = 1; i <= 4; i++) {
            liveCells += teamCounts[i];
        }

        document.getElementById("debug-fps").textContent = currentFps;
        document.getElementById("debug-grid-size").textContent =
            `${cols} x ${rows}`;
        document.getElementById("debug-cell-size").textContent = `${cellSize}px`;
        document.getElementById("debug-total-cells").textContent = (
            cols * rows
        ).toLocaleString();
        document.getElementById("debug-live-cells").textContent =
            liveCells.toLocaleString();
        document.getElementById("debug-state").textContent = currentState;
        document.getElementById("debug-trails").textContent = debugShowTrails
            ? "ON"
            : "OFF";
        document.getElementById("debug-trails-only").textContent = debugTrailsOnly
            ? "ON"
            : "OFF";
        document.getElementById("debug-schedule").textContent = scheduleEnabled
            ? "ON"
            : "OFF";
    } else {
        panel.classList.remove("visible");
    }
}

// ================================
// 5. EVENTS
// ================================

function spawnExplosion() {
    const centerRow = Math.floor(Math.random() * rows);
    const centerCol = Math.floor(Math.random() * cols);
    const radius =
        Math.floor(Math.random() * (cometMaxRadius - cometMinRadius + 1)) +
        cometMinRadius;
    const color = 0;

    for (let r = -radius; r <= radius; r++) {
        for (let c = -radius; c <= radius; c++) {
            if (r * r + c * c <= radius * radius) {
                const targetRow = centerRow + r;
                const targetCol = centerCol + c;
                if (
                    targetRow >= 0 &&
                    targetRow < rows &&
                    targetCol >= 0 &&
                    targetCol < cols
                ) {
                    grid[targetRow][targetCol] = color;
                    trailColor[targetRow][targetCol] = color;
                    trailBrightness[targetRow][targetCol] = color > 0 ? 200 : 0;
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

// Pre-allocated arrays to avoid GC
const cc = new Uint8Array(5); // color counts
const dc = new Uint8Array(4); // dominant colors

function nextGeneration() {
    const numRows = rows;
    const numCols = cols;
    const lastRow = numRows - 1;
    const lastCol = numCols - 1;

    for (let row = 0; row < numRows; row++) {
        const gridRow = grid[row];
        const bufRow = gridBuffer[row];
        const rowAbove = row > 0 ? grid[row - 1] : null;
        const rowBelow = row < lastRow ? grid[row + 1] : null;

        for (let col = 0; col < numCols; col++) {
            // Inline neighbor counting
            let count = 0;
            cc[1] = cc[2] = cc[3] = cc[4] = 0;

            // Check 8 neighbors with unrolled bounds checks
            if (rowAbove) {
                if (col > 0) {
                    const c = rowAbove[col - 1];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
                {
                    const c = rowAbove[col];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
                if (col < lastCol) {
                    const c = rowAbove[col + 1];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
            }
            if (col > 0) {
                const c = gridRow[col - 1];
                if (c > 0) {
                    count++;
                    cc[c]++;
                }
            }
            if (col < lastCol) {
                const c = gridRow[col + 1];
                if (c > 0) {
                    count++;
                    cc[c]++;
                }
            }
            if (rowBelow) {
                if (col > 0) {
                    const c = rowBelow[col - 1];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
                {
                    const c = rowBelow[col];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
                if (col < lastCol) {
                    const c = rowBelow[col + 1];
                    if (c > 0) {
                        count++;
                        cc[c]++;
                    }
                }
            }

            // Find dominant color
            let maxC = 0,
                numD = 0;
            for (let i = 1; i <= 4; i++) {
                if (cc[i] > maxC) {
                    maxC = cc[i];
                    dc[0] = i;
                    numD = 1;
                } else if (cc[i] === maxC && maxC > 0) {
                    dc[numD++] = i;
                }
            }
            const dominant = numD > 0 ? dc[(Math.random() * numD) | 0] : 0;

            // Apply rules
            const alive = gridRow[col] > 0;
            if (alive) {
                bufRow[col] = count === 2 || count === 3 ? dominant : 0;
            } else {
                if (count === 3) {
                    bufRow[col] = dominant;
                } else if (spawnChance > 0 && Math.random() < spawnChance) {
                    bufRow[col] = ((Math.random() * 4) | 0) + 1;
                } else {
                    bufRow[col] = 0;
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

    updateClock();
    updateMetricsPanel(currentTime);

    if (!grid || grid.length === 0) return;

    if (currentState === STATE_GAME_OVER) {
        if (currentTime - lastFrameTime < frameInterval) {
            updateGameoverCountdown();
            return;
        }
        lastFrameTime = currentTime;

        nextGeneration();
        updateTrailAndDraw();
        updateGameoverCountdown();
        return;
    }

    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;
    frameCount++;

    if (currentEvent === EVENT_COMETS) {
        if (frameCount % cometSpawnInterval === 0) {
            spawnExplosion();
        }
        if (frameCount % scoreboardInterval === 0) {
            updateScoreboard(false, currentTime);
        }
        updateTrailAndDraw();
        return;
    }

    if (currentEvent === EVENT_DROUGHT) {
        lowerSpawnChance();
    }

    if (currentState === STATE_PAUSED) {
        return;
    }

    if (currentState === STATE_PRE_RUN) {
        updateCountdown();
        updateTrailAndDraw();
        return;
    }

    if (currentState === STATE_NIGHT) {
        nextGeneration();
        updateTrailAndDraw();
        return;
    }

    if (currentState === STATE_RUNNING) {
        nextGeneration();
        if (frameCount % scoreboardInterval === 0) {
            updateScoreboard(false, currentTime);
        }
        updateTrailAndDraw();
    }
}

requestAnimationFrame(step);

// ================================
// 7. SERVER POLLING (Display-Only Client)
// ================================

async function pollServer(includeGrid = false) {
    try {
        const url = includeGrid ? "/api/game?includeGrid=true" : "/api/game";
        const response = await fetch(url);
        const serverState = await response.json();

        if (serverState.adminStateVersion !== lastKnownAdminVersion) {
            console.log(
                `State update (v${lastKnownAdminVersion} -> v${serverState.adminStateVersion})`,
            );
            lastKnownAdminVersion = serverState.adminStateVersion;
        }

        await applyServerState(serverState);
    } catch (error) {
        console.error("Failed to poll server:", error);
    }
}

async function sendGridToServer() {
    try {
        await fetch("/api/game/grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grid: Array.from(grid, row => Array.from(row)),
                trailColor: Array.from(trailColor, row => Array.from(row)),
                trailBrightness: Array.from(trailBrightness, row => Array.from(row)),
                teamCounts: [...teamCounts],
                gridDimensions: { rows, cols },
                currentEvent: currentEvent,
                spawnChance: spawnChance,
            }),
        });
    } catch (error) {
        console.error("Failed to send grid to server:", error);
    }
}

async function applyServerState(state) {
    const prevState = currentState;
    const prevPhase = currentPhase;

    const stateChanged = state.currentState !== currentState;
    const phaseChanged = state.currentPhase !== currentPhase;

    pregameStartTime = state.pregameStartTime;
    gameOverStartTime = state.gameOverStartTime;

    if (state.teamColors) teamColors = state.teamColors;
    if (state.currentPaletteName) currentPaletteName = state.currentPaletteName;
    if (state.currentCategoryName)
        currentCategoryName = state.currentCategoryName;
    if (state.actualTeamNames) actualTeamNames = state.actualTeamNames;
    if (state.isNightPalette !== undefined) isNightPalette = state.isNightPalette;
    if (state.spawnChance !== undefined) spawnChance = state.spawnChance;

    updateColorRGB();
    initTeamColors();

    if (stateChanged || phaseChanged) {
        currentState = state.currentState;
        currentPhase = state.currentPhase;
        await handleStateChange(state.currentState, prevState);
    }

    if (
        isInitialLoad &&
        state.grid &&
        state.gridDimensions?.rows === rows &&
        state.gridDimensions?.cols === cols
    ) {
        // Convert server grid (regular arrays) to Uint8Array rows
        grid = [];
        gridBuffer = [];
        trailColor = [];
        trailBrightness = [];
        for (let r = 0; r < state.grid.length; r++) {
            grid.push(new Uint8Array(state.grid[r]));
            gridBuffer.push(new Uint8Array(state.grid[r].length));

            // Handle new format (trailColor/trailBrightness arrays)
            if (state.trailColor && state.trailBrightness) {
                trailColor.push(new Uint8Array(state.trailColor[r]));
                trailBrightness.push(new Uint8Array(state.trailBrightness[r]));
            }
            // Handle old format (trailGrid with objects)
            else if (state.trailGrid && state.trailGrid.length > 0) {
                const tColor = new Uint8Array(grid[r].length);
                const tBright = new Uint8Array(grid[r].length);
                for (let c = 0; c < grid[r].length; c++) {
                    const t = state.trailGrid[r][c];
                    tColor[c] = t.color;
                    tBright[c] = Math.round(t.brightness * 200);
                }
                trailColor.push(tColor);
                trailBrightness.push(tBright);
            }
            // No trail data, create from grid
            else {
                const tColor = new Uint8Array(grid[r].length);
                const tBright = new Uint8Array(grid[r].length);
                for (let c = 0; c < grid[r].length; c++) {
                    const cell = grid[r][c];
                    tColor[c] = cell;
                    tBright[c] = cell > 0 ? 200 : 0;
                }
                trailColor.push(tColor);
                trailBrightness.push(tBright);
            }
        }
        if (state.teamCounts) {
            for (let i = 0; i <= 4; i++) {
                teamCounts[i] = state.teamCounts[i] || 0;
            }
        }
        console.log("Grid restored from server");
    }
}

async function handleStateChange(newState, oldState) {
    switch (newState) {
        case STATE_PRE_RUN:
            exitNightState();
            hideGameoverPanel();
            if (oldState !== STATE_PRE_RUN && !isInitialLoad) {
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
            if (oldState === STATE_PRE_RUN && !isInitialLoad) {
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
            const headerBar = document.getElementById("header-bar");
            if (headerBar) headerBar.style.display = "none";
            break;
        case STATE_PAUSED:
            hidePregamePanel();
            hideGameoverPanel();
            break;
    }

    updateEventDisplay();
}

function updateEventDisplay() {
    const eventTextEl = document.getElementById("event-text");
    if (eventTextEl) {
        if (currentEvent === EVENT_COMETS) {
            eventTextEl.textContent = "COMETS!";
            eventTextEl.classList.add("event-active");
        } else if (currentEvent === EVENT_DROUGHT) {
            eventTextEl.textContent = "DROUGHT!";
            eventTextEl.classList.add("event-active");
        } else {
            eventTextEl.textContent = "NO EVENT";
            eventTextEl.classList.remove("event-active");
        }
    }
}

async function toggleSchedule() {
    try {
        const response = await fetch("/api/schedule/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const data = await response.json();
        scheduleEnabled = data.enabled;
        console.log(`Schedule: ${scheduleEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
        console.error("Failed to toggle schedule:", error);
    }
}

async function resetGameState() {
    try {
        await fetch("/api/control/reset", { method: "POST" });
        console.log("Game reset requested");
        // Next poll will pick up the new state
    } catch (error) {
        console.error("Failed to reset game state:", error);
    }
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (gridSendTimer) clearInterval(gridSendTimer);

    pollTimer = setInterval(pollServer, POLL_INTERVAL);
    gridSendTimer = setInterval(sendGridToServer, GRID_SEND_INTERVAL);
}

async function initialize() {
    await pollServer(true);

    if (!grid || grid.length === 0) {
        resetGrid();
    }

    isInitialLoad = false;

    startPolling();

    console.log("Client initialized - polling server for state");
}

// ================================
// 8. KEYBINDS (Debug/Local Only)
// ================================

const keybindsEl = document.getElementById("keybinds");
const eventTextEl = document.getElementById("event-text");

if (showKeybinds && keybindsEl) {
    keybindsEl.classList.add("visible");
}

document.addEventListener("keydown", (e) => {
    switch (e.key) {
        case "5":
            if (currentEvent === EVENT_COMETS) {
                currentEvent = null;
                if (eventTextEl) {
                    eventTextEl.textContent = "NO EVENT";
                    eventTextEl.classList.remove("event-active");
                }
            } else {
                currentEvent = EVENT_COMETS;
                if (eventTextEl) {
                    eventTextEl.textContent = "COMETS!";
                    eventTextEl.classList.add("event-active");
                }
            }
            break;
        case "6":
            if (currentEvent === EVENT_DROUGHT) {
                currentEvent = null;
                spawnChance = initialSpawnChance;
                if (eventTextEl) {
                    eventTextEl.textContent = "NO EVENT";
                    eventTextEl.classList.remove("event-active");
                }
            } else {
                currentEvent = EVENT_DROUGHT;
                if (eventTextEl) {
                    eventTextEl.textContent = "DROUGHT!";
                    eventTextEl.classList.add("event-active");
                }
            }
            break;
        case "h":
        case "H":
            if (keybindsEl) keybindsEl.classList.toggle("visible");
            break;
        // Debug toggles
        case "t":
        case "T":
            debugShowTrails = !debugShowTrails;
            console.log(`Trails: ${debugShowTrails ? "ON" : "OFF"}`);
            break;
        case "y":
        case "Y":
            debugTrailsOnly = !debugTrailsOnly;
            console.log(`Trails Only: ${debugTrailsOnly ? "ON" : "OFF"}`);
            break;
        case "d":
        case "D":
            debugShowMetrics = !debugShowMetrics;
            break;
        case "s":
        case "S":
            toggleSchedule();
            break;
        case "r":
        case "R":
            resetGameState();
            break;
    }
});

initialize();
