import leaflet from "leaflet";

export type MovementMode = "buttons" | "geolocation";

export interface MovementController {
  start(): void;
  stop(): void;
  onPosition(cb: (latlng: leaflet.LatLng) => void): void;
  getMode(): MovementMode;
}

// Button controller: uses arrow keys / WASD to move relative to current player position.
export class ButtonMovementController implements MovementController {
  private cb: (latlng: leaflet.LatLng) => void = () => {};
  private listener = (ev: KeyboardEvent) => this.handleKey(ev);
  private getCurrent: () => leaflet.LatLng;
  private step: number;

  constructor(getCurrent: () => leaflet.LatLng, stepDegrees = 1e-4) {
    this.getCurrent = getCurrent;
    this.step = stepDegrees;
  }

  getMode(): MovementMode {
    return "buttons";
  }

  onPosition(cb: (latlng: leaflet.LatLng) => void) {
    this.cb = cb;
  }

  start() {
    document.addEventListener("keydown", this.listener);
  }

  stop() {
    document.removeEventListener("keydown", this.listener);
  }

  private handleKey(ev: KeyboardEvent) {
    const key = ev.key.toLowerCase();
    let dLat = 0;
    let dLng = 0;
    if (key === "arrowup" || key === "w") dLat = this.step;
    if (key === "arrowdown" || key === "s") dLat = -this.step;
    if (key === "arrowleft" || key === "a") dLng = -this.step;
    if (key === "arrowright" || key === "d") dLng = this.step;
    if (dLat === 0 && dLng === 0) return;
    const cur = this.getCurrent();
    const next = leaflet.latLng(cur.lat + dLat, cur.lng + dLng);
    this.cb(next);
  }
}

// Geolocation controller: uses the browser geolocation API to stream absolute positions.
export class GeolocationMovementController implements MovementController {
  private cb: (latlng: leaflet.LatLng) => void = () => {};
  private watchId: number | null = null;

  getMode(): MovementMode {
    return "geolocation";
  }

  onPosition(cb: (latlng: leaflet.LatLng) => void) {
    this.cb = cb;
  }

  start() {
    if (!("geolocation" in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.cb(leaflet.latLng(lat, lng));
      },
      (err) => {
        console.warn("Geolocation error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

// Factory helper
export function createController(
  mode: MovementMode,
  getCurrent: () => leaflet.LatLng,
) {
  if (mode === "geolocation") return new GeolocationMovementController();
  return new ButtonMovementController(getCurrent);
}
