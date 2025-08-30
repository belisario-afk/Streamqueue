import { get, set } from "idb-keyval";
import { type AudioFeatures, type AudioAnalysis } from "@spotify/api";

type CachedCover = {
  etag?: string;
  blob?: Blob;
  objectUrl?: string;
  palette?: string[];
  url: string;
};

export async function getCachedCover(trackId: string, url: string): Promise<CachedCover | null> {
  const key = `cover:${trackId}`;
  const cached = (await get(key)) as CachedCover | undefined;
  if (!cached || cached.url !== url) return null;
  if (cached.blob && !cached.objectUrl) {
    cached.objectUrl = URL.createObjectURL(cached.blob);
  }
  return cached;
}

export async function savePaletteForTrack(trackId: string, url: string, palette: string[]) {
  const key = `cover:${trackId}`;
  const cached = (await get(key)) as CachedCover | undefined;
  if (cached) {
    await set(key, { ...cached, palette });
  } else {
    await set(key, { url, palette });
  }
}

export async function cacheCover(trackId: string, url: string, etag: string | undefined, blob: Blob) {
  const key = `cover:${trackId}`;
  await set(key, { url, etag, blob });
}

export async function fetchCoverWithCache(trackId: string, url: string) {
  const key = `cover:${trackId}`;
  const cached = (await get(key)) as CachedCover | undefined;
  const headers: Record<string,string> = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  const res = await fetch(url, { headers });
  if (res.status === 304 && cached?.blob) {
    return cached.blob;
  }
  const etag = res.headers.get("ETag") || undefined;
  const blob = await res.blob();
  await cacheCover(trackId, url, etag, blob);
  return blob;
}

export async function cacheTrackMeta(track: any) {
  await set(`track:${track.id}`, track);
}

export async function getCachedTrackMeta(id: string) {
  return get(`track:${id}`);
}

export async function cacheAnalysis(id: string, data: { features: AudioFeatures; analysis: AudioAnalysis }) {
  await set(`analysis:${id}`, data);
}

export async function getCachedAnalysis(id: string) {
  return get(`analysis:${id}`) as Promise<{ features: AudioFeatures; analysis: any } | undefined>;
}