// Spotify PKCE OAuth helpers — no client secret required.
//
// Setup: create an app at https://developer.spotify.com/dashboard
//   1. Add redirect URI: http://localhost:5173/spotify/callback  (+ your prod domain)
//   2. Copy the Client ID into VITE_SPOTIFY_CLIENT_ID in .env.local

const TOKEN_KEY = "spotify_tokens";
const VERIFIER_KEY = "spotify_code_verifier";
const STATE_KEY = "spotify_oauth_state";

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

function generateOAuthState(): string {
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


/**
 * Thrown when a Spotify endpoint cannot be reached at all — offline, DNS
 * failure, a blocked request. Distinct from an error *response*: the session
 * and tokens are presumed fine, so callers should surface a connectivity
 * message rather than log the user out.
 */
export class SpotifyUnreachableError extends Error {
  constructor(url: string) {
    super(`Could not reach ${new URL(url).host} — check your connection.`);
    this.name = "SpotifyUnreachableError";
  }
}

/** `fetch()` that turns a network-level throw into `SpotifyUnreachableError`. */
export async function spotifyFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new SpotifyUnreachableError(url);
  }
}

/**
 * Spotify replies to a failed auth/API call with a JSON body that says exactly
 * what is wrong (`error` / `error_description`, or a nested `error.message`).
 * Swallowing it leaves the UI able to say only "it failed", which is useless to
 * whoever has to fix the Spotify app settings.
 */
export async function readSpotifyError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body: unknown = await res.json();
    if (body !== null && typeof body === "object") {
      const rec = body as Record<string, unknown>;
      if (typeof rec.error_description === "string") detail = rec.error_description;
      else if (typeof rec.error === "string") detail = rec.error;
      else if (rec.error !== null && typeof rec.error === "object") {
        const nested = rec.error as Record<string, unknown>;
        if (typeof nested.message === "string") detail = nested.message;
      }
    }
  } catch {
    /* non-JSON body — the status alone will have to do */
  }

  const base = `Spotify returned ${res.status}`;
  if (!detail) return base;

  // 403 after a successful login almost always means the Spotify app is still
  // in Development mode and this account is not on its user list. Say so,
  // because the fix is in the Spotify dashboard and nowhere in this codebase.
  if (res.status === 403) {
    return `${base}: ${detail}. Check the Spotify app declares both Web API and Web Playback SDK, and that this account is listed under User Management.`;
  }
  return `${base}: ${detail}`;
}

// ── Auth flow ─────────────────────────────────────────────────────────────

const CLIENT_ID_KEY = "spotify_client_id_pending";

export async function buildAuthUrl(clientId: string): Promise<string> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateOAuthState();
  // localStorage (not sessionStorage) so the verifier survives when iOS PWA
  // hands the Spotify callback off to Safari and back — different session contexts.
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SCOPES,
    show_dialog: "true", // Always show account chooser so switching accounts works
  });

  return `https://accounts.spotify.com/authorize?${params}`;
}

/** Exchange an auth response for tokens after validating its CSRF state. */
export async function exchangeCode(code: string, state: string | undefined, clientId?: string): Promise<SpotifyTokens> {
  const expectedState = localStorage.getItem(STATE_KEY);
  localStorage.removeItem(STATE_KEY);
  if (!expectedState || !state || state !== expectedState) {
    throw new Error("Spotify login state did not match. Please start the connection again.");
  }

  const verifier = localStorage.getItem(VERIFIER_KEY);
  // The verifier lives in localStorage, which is per-origin. If the login began
  // on one host and the callback landed on another (an apex → app redirect, say),
  // it is simply not here — worth naming, because it looks nothing like a
  // Spotify problem from the outside.
  if (!verifier) {
    throw new Error(
      `No PKCE verifier found for ${window.location.origin}. If the login started on a different domain, the redirect URI registered with Spotify must point at this one.`,
    );
  }
  localStorage.removeItem(VERIFIER_KEY);
  const stored = localStorage.getItem(CLIENT_ID_KEY);
  const id = clientId ?? (stored === null ? "" : stored);
  localStorage.removeItem(CLIENT_ID_KEY);
  if (!id) throw new Error("No Spotify client ID available for the token exchange.");

  const res = await spotifyFetch("https://accounts.spotify.com/api/token", {
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

  if (!res.ok) throw new Error(await readSpotifyError(res));
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
  const res = await spotifyFetch("https://accounts.spotify.com/api/token", {
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

/**
 * Returns a valid access token, refreshing silently if expired. Null = not
 * logged in. Throws `SpotifyUnreachableError` when a needed refresh cannot
 * reach Spotify — being offline is not being logged out, so callers must not
 * clear the session on that path.
 */
export async function getValidToken(clientId: string, forceRefresh = false): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  // Campaign hasn't loaded yet — don't compare against an empty client ID,
  // that would mistakenly wipe perfectly valid tokens.
  if (!clientId) return null;
  // Tokens were issued for a different app — clear and force re-auth.
  if (tokens.client_id && tokens.client_id !== clientId) {
    clearTokens();
    return null;
  }

  // Refresh 60 s before expiry to avoid mid-session token death
  if (!forceRefresh && Date.now() < tokens.expires_at - 60_000) {
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
