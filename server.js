import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ================================
// ACCESS TOKEN FOR KIOSK DEVICE
// ================================
// Set this to a secret value - kiosk accesses game via /?token=YOUR_SECRET
const ACCESS_TOKEN = process.env.GAME_TOKEN || "life";

// ================================
// DAILY SCHEDULE (24-hour format)
// ================================
let scheduleEnabled = false; // Set to true to enable automatic state transitions

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

let currentGameState = null;

let saveStateTimeout = null;
const SAVE_DEBOUNCE_MS = 5000;

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

function saveGameState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save game state:", error);
  }
}

function formatStateLog(state) {
  if (!state) return "null";
  const scores = state.teamCounts
    ?.slice(1)
    .map(
      (c, i) =>
        `${state.actualTeamNames?.[i] || `Team ${i + 1}`}: ${c?.toLocaleString() || 0}`,
    )
    .join(", ");
  return `[${state.currentState}/${state.currentPhase}] ${scores}`;
}

function debouncedSaveState() {
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  saveStateTimeout = setTimeout(() => {
    if (currentGameState) {
      saveGameState(currentGameState);
      console.log(
        `[${new Date().toLocaleTimeString()}] State saved to disk: ${formatStateLog(currentGameState)}`,
      );
    }
  }, SAVE_DEBOUNCE_MS);
}

currentGameState = loadGameState();
if (currentGameState) {
  console.log(
    `Loaded game state from disk: ${formatStateLog(currentGameState)}`,
  );
} else {
  console.log("No saved state found, will start fresh");
}

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

app.get("/api/state", (c) => {
  if (currentGameState) {
    return c.json(currentGameState);
  }
  return c.body(null, 204);
});

app.post("/api/state", async (c) => {
  const body = await c.req.json();
  const prevState = currentGameState?.currentState;
  currentGameState = {
    ...body,
    savedAt: new Date().toISOString(),
  };
  if (prevState !== currentGameState.currentState) {
    console.log(
      `[${new Date().toLocaleTimeString()}] State changed: ${prevState || "none"} → ${currentGameState.currentState}`,
    );
  }
  debouncedSaveState();
  return c.json({ success: true });
});

app.delete("/api/state", (c) => {
  currentGameState = null;
  if (existsSync(STATE_FILE)) {
    writeFileSync(STATE_FILE, "{}");
  }
  console.log(`[${new Date().toLocaleTimeString()}] Game state cleared`);
  return c.json({ success: true });
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

app.use("/*", async (c, next) => {
  const path = c.req.path;

  if (path === "/score" || path.startsWith("/api/")) {
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
console.log(`Server running at http://localhost:${port}`);
console.log(`Kiosk access: http://<server-ip>:${port}/?token=${ACCESS_TOKEN}`);

serve({
  fetch: app.fetch,
  port,
});
