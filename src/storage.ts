export type PersistedPlayer = {
  lat: number;
  lng: number;
  holding: number | null;
};
export type GameState = { player?: PersistedPlayer; movement?: string };

const PLAYER_KEY = "playerState";

export function savePlayerState(p: PersistedPlayer) {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
}

export function loadPlayerState(): PersistedPlayer | null {
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedPlayer;
  } catch {
    return null;
  }
}

export function clearPlayerState() {
  localStorage.removeItem(PLAYER_KEY);
}
