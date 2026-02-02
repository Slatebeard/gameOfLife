import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { networkInterfaces } from "os";

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const ACCESS_TOKEN = process.env.GAME_TOKEN || "life";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin";

// ================================
// DAILY SCHEDULE (24-hour format)
// ================================
let scheduleEnabled = false;
let adminStateVersion = 0; // Increments on each admin action

const SCHEDULE = {
  PREGAME_START: "08:45",
  REVEAL_TEAMS: "08:50",
  REVEAL_STATS: "09:00",
  GAME_START: "09:15",
  GAME_END: "17:00",
  NIGHT_START: "17:10",
};

function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getExpectedState() {
  const now = getCurrentTimeMinutes();
  const times = {
    pregame: parseTimeToMinutes(SCHEDULE.PREGAME_START),
    teams: parseTimeToMinutes(SCHEDULE.REVEAL_TEAMS),
    stats: parseTimeToMinutes(SCHEDULE.REVEAL_STATS),
    gameStart: parseTimeToMinutes(SCHEDULE.GAME_START),
    gameEnd: parseTimeToMinutes(SCHEDULE.GAME_END),
    night: parseTimeToMinutes(SCHEDULE.NIGHT_START),
  };

  if (now >= times.night || now < times.pregame) {
    return { state: "night", phase: null };
  }
  if (now >= times.gameEnd) {
    return { state: "gameOver", phase: null };
  }
  if (now >= times.gameStart) {
    return { state: "running", phase: "ready" };
  }
  if (now >= times.stats) {
    return { state: "preRun", phase: "stats" };
  }
  if (now >= times.teams) {
    return { state: "preRun", phase: "teams" };
  }
  return { state: "preRun", phase: "palette" };
}

const STATS_FILE = "./data/stats.json";
const STATE_FILE = "./data/gameState.json";
const PALETTES_FILE = "./public/data/palettes.json";
const TEAM_NAMES_FILE = "./public/data/teamNames.json";

// ================================
// SERVER-AUTHORITATIVE GAME STATE
// ================================
let gameState = {
  currentState: "preRun",
  currentPhase: "palette",
  pregameStartTime: null,
  gameOverStartTime: null,
  teamColors: ["#000000", "#E63946", "#457B9D", "#2A9D8F", "#F4A261"],
  currentPaletteName: "",
  currentCategoryName: "",
  actualTeamNames: ["", "", "", ""],
  isNightPalette: false,
  grid: null,
  trailColor: null,
  trailBrightness: null,
  teamCounts: [0, 0, 0, 0, 0],
  gridDimensions: null,
  currentEvent: null,
  spawnChance: 0.0005,
};

let saveStateTimeout = null;
const SAVE_DEBOUNCE_MS = 5000;

// ================================
// PALETTE AND TEAM NAME SELECTION
// ================================
function loadPalettes() {
  try {
    if (existsSync(PALETTES_FILE)) {
      return JSON.parse(readFileSync(PALETTES_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load palettes:", error);
  }
  return null;
}

function loadTeamNames() {
  try {
    if (existsSync(TEAM_NAMES_FILE)) {
      return JSON.parse(readFileSync(TEAM_NAMES_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load team names:", error);
  }
  return null;
}

function selectRandomPalette(isNight = false) {
  const data = loadPalettes();
  if (!data) {
    console.warn("Using fallback palette");
    gameState.currentPaletteName = "Fallback";
    gameState.isNightPalette = isNight;
    const fallbackColors = isNight
      ? ["#1a1a2e", "#16213e", "#0f3460", "#e94560"]
      : ["#E63946", "#457B9D", "#2A9D8F", "#F4A261"];
    for (let i = 0; i < 4; i++) {
      gameState.teamColors[i + 1] = fallbackColors[i];
    }
    return;
  }

  const palettes = isNight ? data.nightPalettes : data.palettes;
  const paletteNames = Object.keys(palettes);
  const randomName = paletteNames[Math.floor(Math.random() * paletteNames.length)];
  const colors = palettes[randomName];

  gameState.currentPaletteName = randomName;
  gameState.isNightPalette = isNight;
  for (let i = 0; i < 4; i++) {
    gameState.teamColors[i + 1] = colors[i];
  }
  console.log(`[${new Date().toLocaleTimeString()}] Selected ${isNight ? "night " : ""}palette: ${randomName}`);
}

function selectRandomTeamNames() {
  const data = loadTeamNames();
  if (!data) {
    console.warn("Using fallback team names");
    gameState.currentCategoryName = "Fallback";
    gameState.actualTeamNames = ["Alpha", "Beta", "Gamma", "Delta"];
    return;
  }

  const categoryKeys = Object.keys(data.categories);
  const randomCategory = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
  const names = data.categories[randomCategory];

  gameState.currentCategoryName = randomCategory;
  const shuffled = [...names].sort(() => Math.random() - 0.5);
  gameState.actualTeamNames = shuffled.slice(0, 4);
  console.log(`[${new Date().toLocaleTimeString()}] Selected category: ${randomCategory} - Teams: ${gameState.actualTeamNames.join(", ")}`);
}

// ================================
// STATE PERSISTENCE
// ================================
function loadGameState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      if (data.version === 1) {
        return data;
      }
    }
  } catch (error) {
    console.error("Failed to load game state:", error);
  }
  return null;
}

function saveGameState() {
  try {
    const stateToSave = {
      version: 1,
      ...gameState,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(STATE_FILE, JSON.stringify(stateToSave));
  } catch (error) {
    console.error("Failed to save game state:", error);
  }
}

function formatStateLog() {
  const scores = gameState.teamCounts
    ?.slice(1)
    .map(
      (c, i) =>
        `${gameState.actualTeamNames?.[i] || `Team ${i + 1}`}: ${c?.toLocaleString() || 0}`,
    )
    .join(", ");
  return `[${gameState.currentState}/${gameState.currentPhase}] ${scores}`;
}

function debouncedSaveState() {
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  saveStateTimeout = setTimeout(() => {
    saveGameState();
    console.log(
      `[${new Date().toLocaleTimeString()}] State saved to disk: ${formatStateLog()}`,
    );
  }, SAVE_DEBOUNCE_MS);
}

// ================================
// STATE TRANSITIONS
// ================================
function transitionState(newState, newPhase) {
  const oldState = gameState.currentState;
  const oldPhase = gameState.currentPhase;

  if (oldState === newState && oldPhase === newPhase) {
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] State transition: ${oldState}/${oldPhase} -> ${newState}/${newPhase}`);

  gameState.currentState = newState;
  if (newPhase !== undefined) {
    gameState.currentPhase = newPhase;
  }

  switch (newState) {
    case "preRun":
      if (oldState !== "preRun") {
        gameState.pregameStartTime = Date.now();
        gameState.gameOverStartTime = null;
        gameState.isNightPalette = false;
        selectRandomPalette(false);
        selectRandomTeamNames();
        gameState.grid = null;
        gameState.trailColor = null;
        gameState.trailBrightness = null;
        gameState.teamCounts = [0, 0, 0, 0, 0];
      }
      break;
    case "running":
      gameState.currentPhase = "ready";
      if (oldState === "preRun") {
        gameState.grid = null;
        gameState.trailColor = null;
        gameState.trailBrightness = null;
        gameState.teamCounts = [0, 0, 0, 0, 0];
      }
      break;
    case "gameOver":
      gameState.gameOverStartTime = Date.now();
      if (!gameState.isNightPalette) {
        selectRandomPalette(true);
      }
      break;
    case "night":
      if (!gameState.isNightPalette) {
        selectRandomPalette(true);
      }
      break;
  }

  adminStateVersion++;
  debouncedSaveState();
}

// ================================
// SERVER-SIDE SCHEDULE CHECKER
// ================================
function checkAndApplySchedule() {
  if (!scheduleEnabled) return;

  const expected = getExpectedState();

  if (expected.state !== gameState.currentState) {
    transitionState(expected.state, expected.phase);
  } else if (gameState.currentState === "preRun" && expected.phase !== gameState.currentPhase) {
    const phaseOrder = ["palette", "teams", "stats", "ready"];
    const currentIdx = phaseOrder.indexOf(gameState.currentPhase);
    const expectedIdx = phaseOrder.indexOf(expected.phase);
    if (expectedIdx > currentIdx) {
      console.log(`[${new Date().toLocaleTimeString()}] Schedule: advancing phase ${gameState.currentPhase} -> ${expected.phase}`);
      gameState.currentPhase = expected.phase;
      adminStateVersion++;
      debouncedSaveState();
    }
  }
}

setInterval(checkAndApplySchedule, 30000);

// ================================
// INITIALIZE SERVER STATE
// ================================
function initializeServerState() {
  const savedState = loadGameState();
  if (savedState) {
    gameState = {
      currentState: savedState.currentState || "preRun",
      currentPhase: savedState.currentPhase || "palette",
      pregameStartTime: savedState.pregameStartTime || null,
      gameOverStartTime: savedState.gameOverStartTime || null,
      teamColors: savedState.teamColors || ["#000000", "#E63946", "#457B9D", "#2A9D8F", "#F4A261"],
      currentPaletteName: savedState.currentPaletteName || "",
      currentCategoryName: savedState.currentCategoryName || "",
      actualTeamNames: savedState.actualTeamNames || ["", "", "", ""],
      isNightPalette: savedState.isNightPalette || false,
      grid: savedState.grid || null,
      trailColor: savedState.trailColor || null,
      trailBrightness: savedState.trailBrightness || null,
      teamCounts: savedState.teamCounts || [0, 0, 0, 0, 0],
      gridDimensions: savedState.gridDimensions || null,
      currentEvent: savedState.currentEvent || null,
      spawnChance: savedState.spawnChance || 0.0005,
    };
    console.log(`Loaded game state from disk: ${formatStateLog()}`);
  } else {
    console.log("No saved state found, initializing fresh pregame");
    selectRandomPalette(false);
    selectRandomTeamNames();
    gameState.pregameStartTime = Date.now();
  }
}

initializeServerState();

function loadStats() {
  try {
    if (existsSync(STATS_FILE)) {
      return JSON.parse(readFileSync(STATS_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load stats:", error);
  }
  return {
    lastWinner: { name: null, color: null, date: null },
    mostPlayedPalette: { name: null, count: 0 },
    mostPlayedCategory: { name: null, count: 0 },
    highestScore: { name: null, color: null, count: 0, date: null },
    paletteCounts: {},
    categoryCounts: {},
    gamesPlayed: 0,
  };
}

function saveStats(stats) {
  try {
    writeFileSync(STATS_FILE, JSON.stringify(stats, null, 4));
  } catch (error) {
    console.error("Failed to save stats:", error);
  }
}

const app = new Hono();

let currentScores = {
  teams: [
    { name: "Team 1", color: "#E63946", count: 0 },
    { name: "Team 2", color: "#457B9D", count: 0 },
    { name: "Team 3", color: "#2A9D8F", count: 0 },
    { name: "Team 4", color: "#F4A261", count: 0 },
  ],
  event: "NO EVENT",
  lastUpdated: null,
};

// ================================
// NEW SERVER-AUTHORITATIVE ENDPOINTS
// ================================

app.get("/api/game", (c) => {
  const includeGrid = c.req.query("includeGrid") === "true";

  const response = {
    currentState: gameState.currentState,
    currentPhase: gameState.currentPhase,
    pregameStartTime: gameState.pregameStartTime,
    gameOverStartTime: gameState.gameOverStartTime,
    teamColors: gameState.teamColors,
    currentPaletteName: gameState.currentPaletteName,
    currentCategoryName: gameState.currentCategoryName,
    actualTeamNames: gameState.actualTeamNames,
    isNightPalette: gameState.isNightPalette,
    teamCounts: gameState.teamCounts,
    gridDimensions: gameState.gridDimensions,
    currentEvent: gameState.currentEvent,
    spawnChance: gameState.spawnChance,
    adminStateVersion: adminStateVersion,
  };

  if (includeGrid) {
    response.grid = gameState.grid;
    response.trailColor = gameState.trailColor;
    response.trailBrightness = gameState.trailBrightness;
  }

  return c.json(response);
});

app.post("/api/game/grid", async (c) => {
  const body = await c.req.json();

  // Only accept grid updates, not state changes
  if (body.grid) gameState.grid = body.grid;
  if (body.trailColor) gameState.trailColor = body.trailColor;
  if (body.trailBrightness) gameState.trailBrightness = body.trailBrightness;
  if (body.teamCounts) gameState.teamCounts = body.teamCounts;
  if (body.gridDimensions) gameState.gridDimensions = body.gridDimensions;
  if (body.currentEvent !== undefined) gameState.currentEvent = body.currentEvent;
  if (body.spawnChance !== undefined) gameState.spawnChance = body.spawnChance;

  currentScores = {
    teams: gameState.actualTeamNames.map((name, i) => ({
      name: name || `Team ${i + 1}`,
      color: gameState.teamColors[i + 1],
      count: gameState.teamCounts[i + 1] || 0,
    })),
    event: body.currentEvent || "NO EVENT",
    lastUpdated: new Date().toISOString(),
  };

  debouncedSaveState();
  return c.json({ success: true });
});

function isLocalhost(c) {
  const connInfo = getConnInfo(c);
  const ip = connInfo?.remote?.address || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip === "::ffff:127.0.0.1"
  );
}

function hasValidToken(c) {
  const token = c.req.query("token");
  return token === ACCESS_TOKEN;
}

function hasValidAdminToken(c) {
  const token = c.req.query("token");
  return token === ADMIN_TOKEN;
}

app.post("/api/scores", async (c) => {
  const body = await c.req.json();
  currentScores = {
    ...body,
    lastUpdated: new Date().toISOString(),
  };
  return c.json({ success: true });
});

app.get("/api/scores", (c) => {
  return c.json(currentScores);
});

app.get("/api/stats", (c) => {
  const stats = loadStats();
  return c.json(stats);
});

app.get("/api/schedule", (c) => {
  const expected = getExpectedState();
  return c.json({
    enabled: scheduleEnabled,
    schedule: SCHEDULE,
    expected: expected,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/schedule/toggle", async (c) => {
  const body = await c.req.json();
  if (typeof body.enabled === "boolean") {
    scheduleEnabled = body.enabled;
  } else {
    scheduleEnabled = !scheduleEnabled;
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] Schedule ${scheduleEnabled ? "enabled" : "disabled"}`,
  );
  return c.json({ enabled: scheduleEnabled });
});

// ================================
// ADMIN CONTROL ENDPOINTS
// ================================

app.get("/api/control/status", (c) => {
  return c.json({
    state: gameState.currentState,
    phase: gameState.currentPhase,
    scheduleEnabled: scheduleEnabled,
    adminStateVersion: adminStateVersion,
    teams: gameState.actualTeamNames,
    palette: gameState.currentPaletteName,
    category: gameState.currentCategoryName,
    teamColors: gameState.teamColors,
    teamCounts: gameState.teamCounts,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/control/reset", (c) => {
  gameState = {
    currentState: "preRun",
    currentPhase: "palette",
    pregameStartTime: Date.now(),
    gameOverStartTime: null,
    teamColors: ["#000000", "#E63946", "#457B9D", "#2A9D8F", "#F4A261"],
    currentPaletteName: "",
    currentCategoryName: "",
    actualTeamNames: ["", "", "", ""],
    isNightPalette: false,
    grid: null,
    trailColor: null,
    trailBrightness: null,
    teamCounts: [0, 0, 0, 0, 0],
    gridDimensions: null,
    currentEvent: null,
    spawnChance: 0.0005,
  };

  selectRandomPalette(false);
  selectRandomTeamNames();

  scheduleEnabled = false;
  adminStateVersion++;
  debouncedSaveState();

  console.log(`[${new Date().toLocaleTimeString()}] Admin: Game reset to fresh pregame (v${adminStateVersion})`);
  return c.json({
    success: true,
    message: "Game reset with new palette and teams.",
    adminStateVersion: adminStateVersion,
  });
});

app.post("/api/control/advance", (c) => {
  if (gameState.currentState !== "preRun") {
    return c.json({ success: false, message: "Not in pregame state" }, 400);
  }
  const phaseOrder = ["palette", "teams", "stats", "ready"];
  const currentIdx = phaseOrder.indexOf(gameState.currentPhase);
  if (currentIdx < phaseOrder.length - 1) {
    gameState.currentPhase = phaseOrder[currentIdx + 1];
    adminStateVersion++;
    debouncedSaveState();
    console.log(
      `[${new Date().toLocaleTimeString()}] Admin: Advanced to phase ${gameState.currentPhase} (v${adminStateVersion})`,
    );
    return c.json({
      success: true,
      phase: gameState.currentPhase,
      adminStateVersion: adminStateVersion,
    });
  }
  return c.json({ success: false, message: "Already at final phase" }, 400);
});

app.post("/api/control/start", (c) => {
  scheduleEnabled = true;
  transitionState("running", "ready");
  console.log(
    `[${new Date().toLocaleTimeString()}] Admin: Game started, schedule enabled (v${adminStateVersion})`,
  );
  return c.json({
    success: true,
    message: "Game started and schedule enabled",
    scheduleEnabled: true,
    adminStateVersion: adminStateVersion,
  });
});

app.post("/api/control/set-state", async (c) => {
  const body = await c.req.json();
  const { state, phase } = body;
  const validStates = ["preRun", "running", "paused", "gameOver", "night"];
  if (!validStates.includes(state)) {
    return c.json({ success: false, message: "Invalid state" }, 400);
  }
  transitionState(state, phase);
  console.log(
    `[${new Date().toLocaleTimeString()}] Admin: Set state to ${state}${phase ? `/${phase}` : ""} (v${adminStateVersion})`,
  );
  return c.json({
    success: true,
    state: state,
    phase: phase || null,
    adminStateVersion: adminStateVersion,
  });
});

app.post("/api/game-end", async (c) => {
  const body = await c.req.json();
  const { winner, palette, category } = body;

  const stats = loadStats();

  stats.gamesPlayed++;

  if (winner) {
    stats.lastWinner = {
      name: winner.name,
      color: winner.color,
      date: new Date().toISOString(),
    };

    if (winner.count > stats.highestScore.count) {
      stats.highestScore = {
        name: winner.name,
        color: winner.color,
        count: winner.count,
        date: new Date().toISOString(),
      };
    }
  }

  if (palette) {
    stats.paletteCounts[palette] = (stats.paletteCounts[palette] || 0) + 1;

    let maxPalette = null;
    let maxPaletteCount = 0;
    for (const [name, count] of Object.entries(stats.paletteCounts)) {
      if (count > maxPaletteCount) {
        maxPaletteCount = count;
        maxPalette = name;
      }
    }
    stats.mostPlayedPalette = { name: maxPalette, count: maxPaletteCount };
  }

  if (category) {
    stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;

    let maxCategory = null;
    let maxCategoryCount = 0;
    for (const [name, count] of Object.entries(stats.categoryCounts)) {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        maxCategory = name;
      }
    }
    stats.mostPlayedCategory = { name: maxCategory, count: maxCategoryCount };
  }

  saveStats(stats);
  console.log(
    `[${new Date().toLocaleTimeString()}] Game #${stats.gamesPlayed} ended - Winner: ${winner?.name || "none"} (${winner?.count?.toLocaleString() || 0} cells)`,
  );
  return c.json({ success: true, stats });
});

app.get("/score", (c) => {
  const html = readFileSync("./public/standings.html", "utf-8");
  return c.html(html);
});

app.get("/admin", (c) => {
  if (!isLocalhost(c) && !hasValidAdminToken(c)) {
    return c.text("Access denied. Admin token required.", 403);
  }
  const html = readFileSync("./public/admin.html", "utf-8");
  return c.html(html);
});

app.use("/*", async (c, next) => {
  const path = c.req.path;

  if (path === "/score" || path === "/admin" || path.startsWith("/api/")) {
    return next();
  }

  const staticExtensions = [
    ".css",
    ".js",
    ".json",
    ".ttf",
    ".woff",
    ".woff2",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
  ];
  if (staticExtensions.some((ext) => path.endsWith(ext))) {
    return next();
  }

  if (!isLocalhost(c) && !hasValidToken(c)) {
    return c.text(
      "Access denied. Use /score to view standings, or provide a valid token.",
      403,
    );
  }

  return next();
});

app.use("/*", serveStatic({ root: "./public" }));

const port = 3000;
const localIP = getLocalIP();
console.log(`Server running at http://localhost:${port}`);
console.log(`Kiosk access: http://${localIP}:${port}/?token=${ACCESS_TOKEN}`);
console.log(`Admin panel: http://${localIP}:${port}/admin?token=${ADMIN_TOKEN}`);

serve({
  fetch: app.fetch,
  port,
});
