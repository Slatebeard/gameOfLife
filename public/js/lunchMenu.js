// ================================
// LUNCH MENU OVERLAY
// Shows "Where's the food?" with today's menus at 11:45 every day.
// Data comes from the server's /api/lunch, which reads /home/user/lunchbot/menu.json
// (falls back to menus.mock.json if that file is missing or invalid).
// ================================

const LUNCH_START = { h: 11, m: 45 };
const LUNCH_DURATION_MIN = 45; // auto-hide at 12:30
const LUNCH_MENU_URL = "/api/lunch";
const LUNCH_CHECK_INTERVAL = 15000;

const lunchPanelEl = document.getElementById("lunch-panel");
const lunchColumnsEl = document.getElementById("lunch-columns");

// Keys are lowercase with spaces removed, see normalizeName()
const RESTAURANT_COLORS = {
  lunchhouse: "#4cd964", // green
  bredbar: "#ff4d4d", // red
  villawera: "#4db8ff", // cool blue
};

function normalizeName(name = "") {
  return name.toLowerCase().replace(/\s+/g, "");
}

let lunchVisible = false;
let lunchManualOverride = null; // null = follow schedule, true/false = forced by keybind

async function loadLunchMenus() {
  try {
    const res = await fetch(LUNCH_MENU_URL, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (error) {
    console.error(`Failed to load ${LUNCH_MENU_URL}:`, error);
  }
  return null;
}

function renderLunchMenus(data) {
  lunchColumnsEl.replaceChildren();
  const restaurants = data?.restaurants ?? [];

  if (restaurants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "lunch-empty";
    empty.textContent = "No menus found today";
    lunchColumnsEl.appendChild(empty);
    return;
  }

  for (const restaurant of restaurants.slice(0, 3)) {
    const col = document.createElement("div");
    col.className = "lunch-column";

    const name = document.createElement("div");
    name.className = "lunch-restaurant";
    name.textContent = restaurant.name;
    const color = RESTAURANT_COLORS[normalizeName(restaurant.name)];
    if (color) name.style.color = color;
    col.appendChild(name);

    for (const item of restaurant.items ?? []) {
      // Items are plain strings, e.g. "Dagens pasta" or a full sentence
      const text = typeof item === "string" ? item : item?.name;
      if (!text) continue;
      const row = document.createElement("div");
      row.className = "lunch-item";
      row.textContent = text;
      col.appendChild(row);
    }
    lunchColumnsEl.appendChild(col);
  }
}

async function showLunchPanel() {
  if (lunchVisible) return;
  lunchVisible = true;
  renderLunchMenus(await loadLunchMenus());
  document.body.classList.add("lunch-mode");
  lunchPanelEl.classList.add("visible");
  fitLunchPanel();
}

// Shrink menu text on busy days so the panel always fits on screen
function fitLunchPanel() {
  const maxHeight = window.innerHeight * 0.95;
  let fit = 1;
  lunchPanelEl.style.setProperty("--lunch-fit", fit);
  while (lunchPanelEl.offsetHeight > maxHeight && fit > 0.5) {
    fit -= 0.05;
    lunchPanelEl.style.setProperty("--lunch-fit", fit);
  }
}

function hideLunchPanel() {
  if (!lunchVisible) return;
  lunchVisible = false;
  document.body.classList.remove("lunch-mode");
  lunchPanelEl.classList.remove("visible");
}

function isLunchTime(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = LUNCH_START.h * 60 + LUNCH_START.m;
  return minutes >= start && minutes < start + LUNCH_DURATION_MIN;
}

function checkLunchSchedule() {
  const scheduled = isLunchTime();
  // Manual override lasts until the schedule state changes
  if (lunchManualOverride !== null && lunchManualOverride !== scheduled) {
    return;
  }
  lunchManualOverride = null;
  if (scheduled) showLunchPanel();
  else hideLunchPanel();
}

function toggleLunchPanel() {
  if (lunchVisible) hideLunchPanel();
  else showLunchPanel();
  lunchManualOverride = lunchVisible;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "l" || e.key === "L") toggleLunchPanel();
});

checkLunchSchedule();
setInterval(checkLunchSchedule, LUNCH_CHECK_INTERVAL);
