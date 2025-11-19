// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";
import { createController, MovementMode } from "./movement.ts";
import {
  clearPlayerState,
  loadPlayerState,
  savePlayerState,
} from "./storage.ts";

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Memento type
type CellMemento = Record<string, number | null>;

// Save all modified cells (the "overrides") to localStorage
function saveMemento(state: CellMemento) {
  localStorage.setItem("cellMemento", JSON.stringify(state));
}

// Load the saved modified cells from localStorage
function loadMemento(): CellMemento {
  return JSON.parse(localStorage.getItem("cellMemento") ?? "{}");
}

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const INTERACTION_RADIUS = 3;
const TARGET_VALUE = 512;

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

// Restore saved player state (if any)
const savedPlayer = loadPlayerState();
if (savedPlayer) {
  player.latlng = leaflet.latLng(savedPlayer.lat, savedPlayer.lng);
  player.holding = savedPlayer.holding;
}

const playerMarker = leaflet.marker(player.latlng);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const radiusMeters = INTERACTION_RADIUS * TILE_DEGREES * 111320; // approx conversion
const interactionCircle = leaflet.circle(player.latlng, {
  radius: radiusMeters,
  color: "#f00",
  weight: 1,
  fillOpacity: 0.1,
});
interactionCircle.addTo(map);

// Movement mode (buttons | geolocation) - declared early so overlay can read it
let movementMode: MovementMode = "buttons";

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
  overlay.innerHTML = `
     Movement: <b>${movementMode}</b><br>
     Arrows/WASD<br>
     Holding: ${player.holding ?? "None"}`;
}

updateOverlay();

// --- cell logic grids ---
function cellId(i: number, j: number) {
  return `${i},${j}`;
}
//-- FLYWEIGHT PATTERN --
//Only modified cells are stored and the rest are generated on demand using randomness.
function tokenAtCell(i: number, j: number): number | null {
  const r = luck(`${i},${j},spawn`);
  if (r > 0.15) return null; // 15% chance to spawn
  const levels = [1, 2, 4, 8, 16];
  const pick = Math.floor(luck(`${i},${j},value`) * levels.length);
  return levels[pick];
}
// --- Memento Pattern ---
// Overrides stores only cells player has changed
const overrides: CellMemento = loadMemento();

function readCell(i: number, j: number): number | null {
  const id = cellId(i, j);
  if (id in overrides) return overrides[id];
  return tokenAtCell(i, j);
}
function writeCell(i: number, j: number, val: number | null) {
  overrides[cellId(i, j)] = val;
  saveMemento(overrides);
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
      updateOverlay();
      savePlayerState({
        lat: player.latlng.lat,
        lng: player.latlng.lng,
        holding: player.holding,
      });
    }
    return renderGrid();
  }

  // Try to craft
  if (val === player.holding) {
    const newVal = val * 2;
    writeCell(i, j, newVal);
    player.holding = null;
    alert(`Crafted ${newVal}`);
    updateOverlay();
    savePlayerState({
      lat: player.latlng.lat,
      lng: player.latlng.lng,
      holding: player.holding,
    });
    if (newVal >= TARGET_VALUE) alert("You win!");
    return renderGrid();
  }

  if (val === null) {
    writeCell(i, j, player.holding);
    alert(`Placed ${player.holding} on empty cell`);
    player.holding = null;
    updateOverlay();
    savePlayerState({
      lat: player.latlng.lat,
      lng: player.latlng.lng,
      holding: player.holding,
    });
    return renderGrid();
  }
  alert("Cannot craft here!");
  renderGrid();
}

// --- init ---
// Center initially on player and render
map.setView(player.latlng);
renderGrid(player.latlng);

// Movement controller lifecycle and hookup
let controller = createController(movementMode, () => player.latlng);

controller.onPosition((latlng: leaflet.LatLng) => {
  player.latlng = latlng;
  playerMarker.setLatLng(player.latlng);
  interactionCircle.setLatLng(player.latlng);
  map.setView(player.latlng);
  renderGrid(player.latlng);
  savePlayerState({
    lat: player.latlng.lat,
    lng: player.latlng.lng,
    holding: player.holding,
  });
  updateOverlay();
});
controller.start();

// Initialize movement mode from query string or saved preference
const params = new URLSearchParams(location.search);
const qMode = params.get("movement");
const savedMovement = localStorage.getItem("movementMode");

if (qMode === "geolocation" || qMode === "buttons") {
  movementMode = qMode as MovementMode;
} else if (savedMovement === "geolocation" || savedMovement === "buttons") {
  movementMode = savedMovement as MovementMode;
}

// recreate controller with correct mode
controller.stop();
controller = createController(movementMode, () => player.latlng);
controller.start();

// Expose some runtime controls via small UI appended to body
const controls = document.createElement("div");
controls.style.position = "fixed";
controls.style.right = "8px";
controls.style.bottom = "8px";
controls.style.zIndex = "9999";
controls.style.display = "flex";
controls.style.flexDirection = "column";
controls.style.gap = "6px";
const btnToggle = document.createElement("button");
btnToggle.textContent = "Toggle Movement";
btnToggle.onclick = () => {
  // switch movement mode
  movementMode = movementMode === "buttons" ? "geolocation" : "buttons";
  localStorage.setItem("movementMode", movementMode);
  controller.stop();
  controller = createController(movementMode, () => player.latlng);
  controller.onPosition((latlng: leaflet.LatLng) => {
    player.latlng = latlng;
    playerMarker.setLatLng(player.latlng);
    interactionCircle.setLatLng(player.latlng);
    map.setView(player.latlng);
    renderGrid(player.latlng);
    savePlayerState({
      lat: player.latlng.lat,
      lng: player.latlng.lng,
      holding: player.holding,
    });
    updateOverlay();
  });
  controller.start();
  updateOverlay();
};

const btnNewGame = document.createElement("button");
btnNewGame.textContent = "New Game";
btnNewGame.onclick = () => {
  // clear saved cells and player state
  localStorage.removeItem("cellMemento");
  clearPlayerState();
  location.reload();
};
controls.appendChild(btnToggle);
controls.appendChild(btnNewGame);
document.body.appendChild(controls);
