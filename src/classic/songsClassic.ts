/**
 * The classic songs page (`/classic/songs.html`): the songs page for phones too old to run the app, built for the
 * maintainer's son's iPhone 6 on iOS 12.5 (9 Nov 2026). The app's floor is Safari 15 (#896); this page's is
 * Safari 12.
 *
 * No Vue app and no supabase-js: it signs in and reads through Supabase's REST endpoints with plain `fetch`, and
 * the build (`classicSongsPlugin` in vite.config.ts) compiles it for Safari 12 with `vue` aliased to
 * `@vue/reactivity`. What it shares with the app it imports rather than restates, so the two cannot drift: the
 * shelves, picture and colour per song (`songShelf`), the player and all its edge cases (`useSongPlayer`), the
 * login-name rule (`signInEmail`), and the Terms check (`shouldShowTermsGate`).
 */
import { effect } from "vue";
import { signInEmail } from "@edge-shared/childAccount.ts";
import { shouldShowTermsGate } from "@/components/account/termsGate";
import { isActiveChildLink } from "@/lib/childAccount";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { SONG_COLOURS, type PlayerSongRow, type Song, type SongShelf, toShelves } from "@/lib/songs/songShelf";
import { useSongPlayer } from "@/composables/soundboard/useSongPlayer";
import { SONG_PICTURE_SVGS } from "./songPictures.generated";

declare const __CLASSIC_SUPABASE_URL__: string;
declare const __CLASSIC_SUPABASE_ANON_KEY__: string;

const API = __CLASSIC_SUPABASE_URL__;
const KEY = __CLASSIC_SUPABASE_ANON_KEY__;
const SESSION_KEY = "grimoire-classic-songs-session";

const PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>';
const MUTE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';

interface Session {
  accessToken: string;
  refreshToken: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
  userId: string;
}

class SignedOut extends Error {}

// ── Session ─────────────────────────────────────────────────────────────────────

function readSession(): Session | null {
  try {
    const raw = safeLocalStorage().getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) safeLocalStorage().setItem(SESSION_KEY, JSON.stringify(session));
    else safeLocalStorage().removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the session lasts as long as the page does.
  }
}

async function tokenRequest(grant: "password" | "refresh_token", body: object): Promise<Session> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SignedOut(`sign-in refused (${res.status})`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
    userId: data.user.id,
  };
}

/** A session whose access token is good for at least another minute, or `SignedOut`. */
async function liveSession(): Promise<Session> {
  const session = readSession();
  if (!session) throw new SignedOut("no session");
  if (session.expiresAt - Date.now() > 60_000) return session;
  try {
    const fresh = await tokenRequest("refresh_token", { refresh_token: session.refreshToken });
    writeSession(fresh);
    return fresh;
  } catch (e) {
    writeSession(null);
    throw e;
  }
}

async function rest<T>(path: string, init: { method?: string; body?: string } = {}): Promise<T> {
  const session = await liveSession();
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { apikey: KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body: init.body,
  });
  if (res.status === 401) {
    writeSession(null);
    throw new SignedOut("token refused");
  }
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/** Whether new Terms wait for this account: the app's own rule, fed the same two rows the app reads. */
async function termsWaiting(userId: string): Promise<boolean> {
  const [subscriptions, links] = await Promise.all([
    rest<Array<{ terms_version: string | null }>>(`user_subscriptions?select=terms_version&user_id=eq.${userId}`),
    rest<Array<{ adult_on: string }>>(`child_accounts?select=adult_on&child_user_id=eq.${userId}`),
  ]);
  return shouldShowTermsGate({
    isAuthenticated: true,
    subscriptionLoading: false,
    childLoading: false,
    isActiveChild: links.length > 0 && isActiveChildLink(links[0]),
    termsVersion: subscriptions.length > 0 ? subscriptions[0].terms_version : null,
    currentPath: "/songs",
  });
}

// ── Drawing ─────────────────────────────────────────────────────────────────────

const root = document.getElementById("classic-root") as HTMLElement;
const player = useSongPlayer();
let shelves: SongShelf[] = [];

function el(tag: string, className?: string, html?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function songFace(song: Song): HTMLElement {
  const face = el("span", "face");
  face.style.backgroundColor = SONG_COLOURS[song.colour % SONG_COLOURS.length];
  const picture = () => {
    face.innerHTML = SONG_PICTURE_SVGS[song.picture % SONG_PICTURE_SVGS.length];
  };
  if (song.coverUrl) {
    const img = document.createElement("img");
    img.alt = "";
    // iOS 12 cannot decode WebP, the app's usual cover format: a cover that will not load shows the picture.
    img.onerror = picture;
    img.src = song.coverUrl;
    face.appendChild(img);
  } else {
    picture();
  }
  return face;
}

function message(text: string, action?: { label: string; run: () => void }) {
  root.innerHTML = "";
  const box = el("div", "message");
  box.appendChild(el("p", undefined)).textContent = text;
  if (action) {
    const button = el("button", "action") as HTMLButtonElement;
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", action.run);
    box.appendChild(button);
  }
  root.appendChild(box);
}

function signInForm(failed = false) {
  root.innerHTML = "";
  const form = el("form", "sign-in") as HTMLFormElement;
  form.innerHTML =
    '<p>Sign in to hear the songs your table shares.</p>' +
    '<label>Email or login name<input name="identifier" autocapitalize="none" autocorrect="off" autocomplete="username" required></label>' +
    '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>' +
    (failed ? '<p class="error">That did not work. Check the name and password.</p>' : "") +
    '<button type="submit" class="action">Sign in</button>';
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");
    message("Signing in…");
    tokenRequest("password", { email: signInEmail(identifier), password })
      .then((session) => {
        writeSession(session);
        return load();
      })
      .catch(() => signInForm(true));
  });
  root.appendChild(form);
}

function drawShelves() {
  root.innerHTML = "";
  if (shelves.length === 0) {
    message("No songs yet. Your DM can share a music playlist by ticking Players can listen in it.");
    return;
  }
  const manyCampaigns = new Set(shelves.map((s) => s.campaignId)).size > 1;
  const pager = el("div", "pager");
  shelves.forEach((shelf) => {
    const page = el("section", "page");
    const title = el("h2");
    title.textContent = (manyCampaigns ? `${shelf.campaignName} · ` : "") + shelf.playlistName;
    page.appendChild(title);
    const grid = el("div", "grid");
    shelf.songs.forEach((song) => {
      const cell = el("div", "cell");
      const tile = el("button", "tile") as HTMLButtonElement;
      tile.type = "button";
      tile.setAttribute("data-song", song.id);
      tile.setAttribute("aria-label", song.name);
      tile.appendChild(songFace(song));
      tile.appendChild(el("span", "badge"));
      tile.appendChild(el("span", "bar", '<span class="fill"></span>'));
      tile.appendChild(el("span", "failed", MUTE_SVG));
      tile.addEventListener("click", () => void player.tap(song));
      cell.appendChild(tile);
      cell.appendChild(el("span", "name")).textContent = song.name;
      grid.appendChild(cell);
    });
    page.appendChild(grid);
    pager.appendChild(page);
  });
  root.appendChild(pager);

  if (shelves.length > 1) {
    const bar = el("nav", "playlists");
    const dots: HTMLElement[] = [];
    shelves.forEach((shelf, i) => {
      const dot = el("button", "dot") as HTMLButtonElement;
      dot.type = "button";
      dot.setAttribute("aria-label", shelf.playlistName);
      dot.appendChild(songFace(shelf.songs[0]));
      dot.addEventListener("click", () => {
        pager.scrollLeft = i * pager.clientWidth;
      });
      dots.push(dot);
      bar.appendChild(dot);
    });
    const markPage = () => {
      const page = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
      dots.forEach((dot, i) => dot.classList.toggle("current", i === page));
    };
    pager.addEventListener("scroll", markPage);
    markPage();
    root.appendChild(bar);
  }
  paint();
}

/** Brings every button in line with the player: which song is current, playing, how far along, or failed. */
function paint() {
  const current = player.currentId.value;
  const playing = player.playing.value;
  const progress = player.progress.value;
  const failed = player.failedId.value;
  const tiles = root.querySelectorAll<HTMLElement>(".tile");
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const id = tile.getAttribute("data-song");
    const isCurrent = id === current;
    tile.classList.toggle("current", isCurrent);
    tile.classList.toggle("is-failed", id === failed);
    (tile.querySelector(".badge") as HTMLElement).innerHTML = isCurrent ? (playing ? PAUSE_SVG : PLAY_SVG) : "";
    (tile.querySelector(".fill") as HTMLElement).style.width = isCurrent ? `${Math.round(progress * 1000) / 10}%` : "0";
  }
}

effect(paint);

// ── Loading ─────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const session = await liveSession();
    if (await termsWaiting(session.userId)) {
      message("Grimoire's terms have changed. Open Grimoire on another device to read them, then come back for the songs.");
      return;
    }
    const rows = await rest<PlayerSongRow[]>("rpc/get_player_songs", { method: "POST", body: "{}" });
    shelves = toShelves(rows, SONG_PICTURE_SVGS.length);
    drawShelves();
  } catch (e) {
    if (e instanceof SignedOut) signInForm();
    else message("The songs did not load.", { label: "Try again", run: () => void load() });
  }
}

// The app's songs page follows the campaign doorbell; this page cannot join Realtime without supabase-js, so it
// re-reads when it comes back to the front, which is when a child opens it again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && shelves.length > 0 && !player.playing.value) void load();
});

void load();
