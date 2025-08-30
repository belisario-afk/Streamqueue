import { generateChallenge, randomString } from "./pkce";
import { getJSON, setJSON } from "@utils/storage";

const TOKEN_KEY = "dwdw.spotify.token";
const CODE_VERIFIER_KEY = "dwdw.spotify.code_verifier";

type TokenInfo = {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope: string;
  refresh_token?: string;
  obtained_at: number; // ms epoch
};

let currentToken: TokenInfo | null = null;

export function initAuthUI(opts: {
  loginButton: HTMLButtonElement;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}) {
  const { loginButton, clientId, redirectUri, scopes } = opts;
  loginButton.addEventListener("click", async () => {
    await login(clientId, redirectUri, scopes);
  });
}

export async function login(clientId: string, redirectUri: string, scopes: string[]) {
  const codeVerifier = randomString(96);
  const codeChallenge = await generateChallenge(codeVerifier);
  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  const state = randomString(24);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scopes.join(" "),
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state
  });
  location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Helper to detect repo base like "/Streamqueue/" dynamically
function repoBase() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts.length ? `/${parts[0]}/` : "/";
}

export async function ensureAuth(clientId: string, redirectUri: string, scopes: string[]) {
  const url = new URL(location.href);

  // Case 1: We used fragment redirect (recommended): /<repo>/?code=...#/callback
  // In this case, code is in the search params and "#/callback" is in the hash.
  const codeFromSearch = url.searchParams.get("code");
  const errorFromSearch = url.searchParams.get("error");
  const hasHashCallback = (location.hash || "").startsWith("#/callback");

  // Case 2: Direct callback path (/.../callback?code=...) if someone still uses path-based redirect
  const directCallback = url.pathname.endsWith("/callback");
  let code = codeFromSearch;
  let error = errorFromSearch;

  // Case 3: 404 fallback put the callback into the hash: /<repo>/#/callback?code=...
  if (!code && !error && (location.hash || "").startsWith("#/callback")) {
    const hash = location.hash;
    const qIndex = hash.indexOf("?");
    const q = qIndex >= 0 ? hash.slice(qIndex + 1) : "";
    const hParams = new URLSearchParams(q);
    code = hParams.get("code") || null;
    error = hParams.get("error") || null;
  }

  if ((directCallback || hasHashCallback) && (code || error)) {
    if (error) {
      console.error("Spotify auth error:", error);
      return;
    }
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY) || "";
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: code || "",
      redirect_uri: redirectUri, // must match exactly what was used in authorize request
      client_id: clientId,
      code_verifier: codeVerifier
    });
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    if (!res.ok) {
      console.error("Token exchange failed", await res.text());
      return;
    }
    const data = (await res.json()) as Omit<TokenInfo, "obtained_at">;
    currentToken = { ...data, obtained_at: Date.now() };
    setJSON(TOKEN_KEY, currentToken);

    // Clean URL back to the app base (removes ?code, ?error and any /callback or #/callback)
    history.replaceState({}, "", repoBase());
    return;
  }

  // Load token and refresh if needed
  currentToken = getJSON<TokenInfo>(TOKEN_KEY);
  if (currentToken && isExpired(currentToken)) {
    await refresh(clientId);
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (!currentToken) currentToken = getJSON<TokenInfo>(TOKEN_KEY);
  if (!currentToken) return null;
  if (isExpired(currentToken)) return null;
  return currentToken.access_token;
}

function isExpired(token: TokenInfo) {
  const elapsed = (Date.now() - token.obtained_at) / 1000;
  return elapsed >= token.expires_in - 30;
}

export async function refresh(clientId: string) {
  if (!currentToken?.refresh_token) return;
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentToken.refresh_token!,
    client_id: clientId
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!res.ok) {
    console.warn("Token refresh failed", await res.text());
    return;
  }
  const data = (await res.json()) as Omit<TokenInfo, "obtained_at">;
  currentToken = { ...data, obtained_at: Date.now(), refresh_token: currentToken.refresh_token };
  setJSON(TOKEN_KEY, currentToken);
}

export async function isPremium(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return false;
  const me = await res.json();
  return me.product === "premium";
}