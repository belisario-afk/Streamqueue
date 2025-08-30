import { withBackoff } from "@utils/rateLimiter";

let tokenProvider: () => Promise<string | null>;

export function initAPI(tp: () => Promise<string | null>) {
  tokenProvider = tp;
}

async function authHeaders() {
  const token = await tokenProvider();
  if (!token) throw new Error("No access token");
  return { Authorization: `Bearer ${token}` };
}

export async function apiGet<T>(path: string, params?: Record<string,string|number|boolean>): Promise<T> {
  const headers = await authHeaders();
  const url = new URL(`https://api.spotify.com/v1${path}`);
  if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  return withBackoff(async () => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${path} failed ${res.status}`);
    return res.json() as Promise<T>;
  });
}

export async function apiPut(path: string, body?: any) {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  return withBackoff(async () => {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method: "PUT",
      headers, body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`PUT ${path} failed ${res.status}`);
    return;
  });
}

export async function apiPost<T=any>(path: string, body?: any): Promise<T> {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  return withBackoff(async () => {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method: "POST",
      headers, body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`POST ${path} failed ${res.status}`);
    return res.status === 204 ? (undefined as any) : res.json();
  });
}

export type Device = {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
};

export type PlaybackState = {
  device: Device;
  repeat_state: string;
  shuffle_state: boolean;
  context: any;
  timestamp: number;
  progress_ms: number;
  is_playing: boolean;
  item: any;
  currently_playing_type: string;
  actions: any;
};

export type AudioFeatures = {
  danceability: number; energy: number; key: number; loudness: number; mode: number; speechiness: number;
  acousticness: number; instrumentalness: number; liveness: number; valence: number; tempo: number; time_signature: number;
};

export type AudioAnalysis = {
  bars: { start: number; duration: number; confidence: number }[];
  beats: { start: number; duration: number; confidence: number }[];
  sections: { start: number; duration: number; confidence: number; tempo: number; key: number; mode: number; loudness: number }[];
  segments: { start: number; duration: number; confidence: number; loudness_start: number; loudness_max: number; loudness_max_time: number; loudness_end: number; pitches: number[]; timbre: number[] }[];
  tatums: { start: number; duration: number; confidence: number }[];
  track: { duration: number; tempo: number; time_signature: number };
};

export async function getCurrentPlayback(): Promise<PlaybackState | null> {
  try {
    const res = await apiGet<PlaybackState>("/me/player");
    return res;
  } catch {
    return null;
  }
}

export async function getDevices(): Promise<Device[]> {
  const json = await apiGet<{ devices: Device[] }>("/me/player/devices");
  return json.devices;
}

export async function transferPlayback(deviceId: string, play: boolean) {
  await apiPut("/me/player", { device_ids: [deviceId], play });
}

export async function getCurrentTrackFeatures(trackId: string) {
  const feats = await apiGet<AudioFeatures>(`/audio-features/${trackId}`);
  const analysis = await apiGet<AudioAnalysis>(`/audio-analysis/${trackId}`);
  return { feats, analysis };
}