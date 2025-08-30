import { apiGet, apiPut, apiPost, getDevices as apiGetDevices, PlaybackState } from "./api";

type WebPlaybackCallbacks = {
  onReady: (deviceId: string) => void;
  onStateChange: (state: Spotify.PlaybackState) => void;
};

let player: Spotify.Player | null = null;
let deviceId: string | null = null;

export async function initWebPlayback(getToken: () => Promise<string | null>, onReady: (deviceId: string) => void, onStateChange: (state: Spotify.PlaybackState | null) => void) {
  await new Promise<void>((resolve) => {
    const check = () => {
      if ((window as any).Spotify) resolve();
      else setTimeout(check, 50);
    };
    check();
  });

  player = new Spotify.Player({
    name: "dwdw Player",
    getOAuthToken: async (cb) => {
      const token = await getToken();
      if (token) cb(token);
    },
    volume: 0.7
  });

  player.addListener("ready", ({ device_id }) => {
    deviceId = device_id;
    onReady(device_id);
  });
  player.addListener("player_state_changed", state => {
    onStateChange(state);
  });
  player.addListener("initialization_error", ({ message }) => console.error(message));
  player.addListener("authentication_error", ({ message }) => console.error(message));
  player.addListener("account_error", ({ message }) => console.error(message));
}

export async function connectWebPlayback() {
  await player?.connect();
}

export async function getDevices() {
  return apiGetDevices();
}

export async function transferPlayback(deviceId: string, play: boolean) {
  await apiPost("/me/player", { device_ids: [deviceId], play });
}

export async function playPause() {
  const state = await currentState();
  if (!state) return;
  if (state.is_playing) await apiPut("/me/player/pause");
  else await apiPut("/me/player/play");
}

export async function nextTrack() {
  await apiPost("/me/player/next");
}

export async function prevTrack() {
  await apiPost("/me/player/previous");
}

export async function seekMs(ms: number) {
  await apiPut(`/me/player/seek?position_ms=${ms}`);
}

export async function setVolume(volPercent: number) {
  await apiPut(`/me/player/volume?volume_percent=${volPercent}`);
}

export async function setDeviceVolume(volPercent: number) {
  await apiPut(`/me/player/volume?volume_percent=${volPercent}`);
}

export async function currentState(): Promise<PlaybackState | null> {
  try {
    return await apiGet<PlaybackState>("/me/player");
  } catch {
    return null;
  }
}