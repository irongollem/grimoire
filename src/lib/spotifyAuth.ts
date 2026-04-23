// Spotify PKCE OAuth helpers — no client secret required.
//
// Setup: create an app at https://developer.spotify.com/dashboard
//   1. Add redirect URI: http://localhost:5173/spotify/callback  (+ your prod domain)
//   2. Copy the Client ID into VITE_SPOTIFY_CLIENT_ID in .env.local

const TOKEN_KEY = "spotify_tokens";
const VERIFIER_KEY = "spotify_code_verifier";

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
  client_id?: string; // bound to the app that issued the tokens
}

// ── PKCE helpers ──────────────────────────────────────────────────────────

function base64URLEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
}

// ── Config ────────────────────────────────────────────────────────────────

// Client ID is stored in the campaign (BYOK). The spotify store passes it in.
export function getRedirectUri(): string {
  return `${window.location.origin}/spotify/callback`;
}

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

// ── Auth flow ─────────────────────────────────────────────────────────────

const CLIENT_ID_KEY = "spotify_client_id_pending";

export async function buildAuthUrl(clientId: string): Promise<string> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  // Also stash the client ID so the callback page can complete the exchange
  // without needing the campaign store (which may not be loaded yet).
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
    show_dialog: "true", // Always show account chooser so switching accounts works
  });

  return `https://accounts.spotify.com/authorize?${params}`;
}

/** Exchange the auth code for tokens. Client ID is read from sessionStorage if not provided. */
export async function exchangeCode(code: string, clientId?: string): Promise<SpotifyTokens | null> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return null;
  sessionStorage.removeItem(VERIFIER_KEY);
  const id = clientId ?? sessionStorage.getItem(CLIENT_ID_KEY) ?? "";
  sessionStorage.removeItem(CLIENT_ID_KEY);
  if (!id) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    client_id: id,
  };
  storeTokens(tokens);
  return tokens;
}

async function refreshAccessToken(clientId: string, refreshToken: string): Promise<SpotifyTokens | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
    client_id: clientId,
  };
  storeTokens(tokens);
  return tokens;
}

// ── Token storage ─────────────────────────────────────────────────────────

export function storeTokens(tokens: SpotifyTokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function getStoredTokens(): SpotifyTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Returns a valid access token, refreshing silently if expired. Null = not logged in. */
export async function getValidToken(clientId: string): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  // Tokens were issued for a different app — clear and force re-auth.
  if (tokens.client_id && tokens.client_id !== clientId) {
    clearTokens();
    return null;
  }

  // Refresh 60 s before expiry to avoid mid-session token death
  if (Date.now() < tokens.expires_at - 60_000) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(clientId, tokens.refresh_token);
  return refreshed?.access_token ?? null;
}

// ── URI helpers ───────────────────────────────────────────────────────────

/** Convert an open.spotify.com URL to a Spotify URI, e.g. spotify:track:xxx */
export function urlToUri(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(track|playlist|album|episode)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return `spotify:${m[1]}:${m[2]}`;
}

/** True for playlist/album contexts (not single tracks). */
export function isContextUri(uri: string): boolean {
  return uri.startsWith("spotify:playlist:") || uri.startsWith("spotify:album:");
}
