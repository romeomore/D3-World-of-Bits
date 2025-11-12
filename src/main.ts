// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const INTERACTION_RADIUS = 9;
const TARGET_VALUE = 256;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// --- Added player state ---
const player = {
  latlng: CLASSROOM_LATLNG,
  holding: null as number | null, // token value in hand
};

const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const radiusMeters = INTERACTION_RADIUS * TILE_DEGREES * 111320; // approx conversion
const interactionCircle = leaflet.circle(CLASSROOM_LATLNG, {
  radius: radiusMeters,
  color: "#f00",
  weight: 1,
  fillOpacity: 0.1,
});
interactionCircle.addTo(map);

// Movement / view mode state
type Mode = "player" | "map";
let mode: Mode = "player";

// Small on-screen overlay that shows current mode and instructions
const overlay = document.createElement("div");
overlay.id = "mode-overlay";
overlay.style.position = "fixed";
overlay.style.left = "8px";
overlay.style.bottom = "8px";
overlay.style.padding = "6px 10px";
overlay.style.background = "rgba(0,0,0,0.6)";
overlay.style.color = "#fff";
overlay.style.fontFamily = "sans-serif";
overlay.style.fontSize = "13px";
overlay.style.borderRadius = "6px";
overlay.style.zIndex = "9999";
document.body.appendChild(overlay);

function updateOverlay() {
  overlay.innerHTML =
    `Mode: <b>${mode}</b><br>Arrows/WASD to move • Tab to toggle mode`;
}
updateOverlay();

// --- cell logic grids ---
function cellId(i: number, j: number) {
  return `${i},${j}`;
}

function tokenAtCell(i: number, j: number): number | null {
  const r = luck(`${i},${j},spawn`);
  if (r > 0.15) return null; // 15% chance to spawn
  const levels = [1, 2, 4, 8];
  const pick = Math.floor(luck(`${i},${j},value`) * levels.length);
  return levels[pick];
}

// --- state overrides (persistent changes) ---
const overrides: Record<string, number | null> = JSON.parse(
  localStorage.getItem("overrides") ?? "{}",
);

function readCell(i: number, j: number): number | null {
  const id = cellId(i, j);
  if (id in overrides) return overrides[id];
  return tokenAtCell(i, j);
}
function writeCell(i: number, j: number, val: number | null) {
  overrides[cellId(i, j)] = val;
  localStorage.setItem("overrides", JSON.stringify(overrides));
}

// --- grid rendering ---
const cells: leaflet.Rectangle[] = [];

// Helpers to convert between lat/lng and integer cell coordinates.
function latLngToCell(latlng: leaflet.LatLng): { i: number; j: number } {
  const di = (latlng.lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES;
  const dj = (latlng.lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES;
  return { i: Math.round(di), j: Math.round(dj) };
}

function cellToLatLng(i: number, j: number): leaflet.LatLng {
  return leaflet.latLng(
    CLASSROOM_LATLNG.lat + i * TILE_DEGREES,
    CLASSROOM_LATLNG.lng + j * TILE_DEGREES,
  );
}

function renderGrid(_centerLatLng?: leaflet.LatLng) {
  // Remove old cells
  cells.forEach((c) => c.remove());
  cells.length = 0;

  // Do NOT setView here! Only use map bounds
  const bounds = map.getBounds();
  const nw = latLngToCell(bounds.getNorthWest());
  const se = latLngToCell(bounds.getSouthEast());

  const minI = Math.min(nw.i, se.i);
  const maxI = Math.max(nw.i, se.i);
  const minJ = Math.min(nw.j, se.j);
  const maxJ = Math.max(nw.j, se.j);

  for (let ii = minI; ii <= maxI; ii++) {
    for (let jj = minJ; jj <= maxJ; jj++) {
      const topLeft = cellToLatLng(ii, jj);
      const bottomRight = cellToLatLng(ii + 1, jj + 1);
      const rectBounds = leaflet.latLngBounds([
        [topLeft.lat, topLeft.lng],
        [bottomRight.lat, bottomRight.lng],
      ]);
      const val = readCell(ii, jj);
      const color = val ? "#88f" : "#ccc";
      const rect = leaflet.rectangle(rectBounds, { color, weight: 1 });
      rect.addTo(map);
      rect.bindTooltip(val ? `${val}` : "");
      rect.on("click", () => onCellClick(ii, jj, val));
      cells.push(rect);
    }
  }
}

// --- interactions inventory---
function distanceFromPlayer(i: number, j: number) {
  const p = latLngToCell(player.latlng);
  return Math.max(Math.abs(i - p.i), Math.abs(j - p.j));
}

function onCellClick(i: number, j: number, val: number | null) {
  if (distanceFromPlayer(i, j) > INTERACTION_RADIUS) {
    return alert("Too far away!");
  }
  if (player.holding === null) {
    // Try to pick up
    if (val) {
      player.holding = val;
      writeCell(i, j, null);
      alert(`Picked up ${val}`);
    }
  } else {
    // Try to craft
    if (val === player.holding) {
      const newVal = val * 2;
      writeCell(i, j, newVal);
      player.holding = null;
      alert(`Crafted ${newVal}`);
      if (newVal >= TARGET_VALUE) alert("You win!");
    } else {
      alert("Cannot craft here!");
    }
  }
  renderGrid();
}

// --- init ---
// Re-render grid when the map moves (so panning shows new cells)
map.on("moveend", () => {
  if (mode === "map") {
    renderGrid(map.getCenter());
  }
});

// Keyboard controls for player movement vs map panning
function toggleMode() {
  mode = mode === "player" ? "map" : "player";
  updateOverlay();
  // When switching to player mode, center on player. When switching to map mode, keep map center.
  if (mode === "player") map.setView(player.latlng);
  renderGrid(mode === "player" ? player.latlng : map.getCenter());
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Tab") {
    ev.preventDefault();
    toggleMode();
    return;
  }

  // Movement step in degrees
  const step = TILE_DEGREES;
  let dLat = 0;
  let dLng = 0;

  if (ev.key === "ArrowUp" || ev.key.toLowerCase() === "w") dLat = step;
  if (ev.key === "ArrowDown" || ev.key.toLowerCase() === "s") dLat = -step;
  if (ev.key === "ArrowLeft" || ev.key.toLowerCase() === "a") dLng = -step;
  if (ev.key === "ArrowRight" || ev.key.toLowerCase() === "d") dLng = step;

  if (dLat === 0 && dLng === 0) return; // not a movement key

  if (mode === "player") {
    // Move the player and recenter map on player
    player.latlng = leaflet.latLng(
      player.latlng.lat + dLat,
      player.latlng.lng + dLng,
    );
    playerMarker.setLatLng(player.latlng);
    interactionCircle.setLatLng(player.latlng);
    map.setView(player.latlng);
    renderGrid(player.latlng);
  } else {
    // Pan the map without moving player
    const center = map.getCenter();
    const newCenter = leaflet.latLng(center.lat + dLat, center.lng + dLng);
    map.setView(newCenter);
    renderGrid(newCenter);
  }
});

// Center initially on player and render
map.setView(player.latlng);
renderGrid(player.latlng);
