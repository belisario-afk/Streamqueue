export async function sha256(plain: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

export function base64UrlEncode(input: Uint8Array) {
  let str = "";
  const len = input.byteLength;
  for (let i = 0; i < len; i++) str += String.fromCharCode(input[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const result = [];
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result.push(charset[randomValues[i] % charset.length]);
  }
  return result.join("");
}

export async function generateChallenge(verifier: string) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}