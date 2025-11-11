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
function renderGrid() {
  cells.forEach((c) => c.remove());
  cells.length = 0;
  const range = 8;
  for (let i = -range; i < range; i++) {
    for (let j = -range; j < range; j++) {
      const bounds = leaflet.latLngBounds([
        [
          CLASSROOM_LATLNG.lat + i * TILE_DEGREES,
          CLASSROOM_LATLNG.lng + j * TILE_DEGREES,
        ],
        [
          CLASSROOM_LATLNG.lat + (i + 1) * TILE_DEGREES,
          CLASSROOM_LATLNG.lng + (j + 1) * TILE_DEGREES,
        ],
      ]);
      const val = readCell(i, j);
      const color = val ? "#88f" : "#ccc";
      const rect = leaflet.rectangle(bounds, { color, weight: 1 });
      rect.addTo(map);
      rect.bindTooltip(val ? `${val}` : "");
      rect.on("click", () => onCellClick(i, j, val));
      cells.push(rect);
    }
  }
}

// --- interactions inventory---
function distance(i: number, j: number) {
  return Math.max(Math.abs(i), Math.abs(j));
}

function onCellClick(i: number, j: number, val: number | null) {
  if (distance(i, j) > INTERACTION_RADIUS) return alert("Too far away!");
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
renderGrid();
