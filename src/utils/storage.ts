export function getJSON<T>(key: string): T | null {
  const str = localStorage.getItem(key);
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

export function setJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}