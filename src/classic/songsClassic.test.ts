// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMS_VERSION } from "@/lib/legal";

// The classic page runs on load (it is the whole of the page's script), so each test sets up the page and the
// network first and then imports it fresh. Its shared parts (shelves, player, login names, the Terms rule) have
// their own tests; these hold the page's own wiring: who signs in how, and what a refusal leads to.

const API = "https://db.example.invalid";
const SESSION_KEY = "grimoire-classic-songs-session";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
let routes: Route;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const hit = routes(url, init) ?? { status: 404, body: {} };
  return { ok: hit.status < 300, status: hit.status, json: async () => hit.body } as Response;
});

const songRow = (id: string, name: string) => ({
  campaign_id: "c1", campaign_name: "Kind Country", playlist_id: "p1", playlist_name: "Songs",
  sound_id: id, name, file_url: `https://cdn.example.invalid/${id}.mp3`, thumbnail_url: null, artist: null, gain_trim: 1,
});

const session = { accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, userId: "u1" };

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

async function openPage() {
  vi.resetModules();
  document.body.innerHTML = '<main id="classic-root"></main>';
  await import("./songsClassic");
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("__CLASSIC_SUPABASE_URL__", API);
  vi.stubGlobal("__CLASSIC_SUPABASE_ANON_KEY__", "anon");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

const signedInRoutes = (over: { terms?: string | null; child?: boolean; songs?: number } = {}): Route => (url) => {
  if (url.includes("/rest/v1/user_subscriptions")) return { status: 200, body: [{ terms_version: over.terms ?? TERMS_VERSION }] };
  if (url.includes("/rest/v1/child_accounts")) return { status: 200, body: over.child ? [{ adult_on: "2099-01-01" }] : [] };
  if (url.includes("/rest/v1/rpc/get_player_songs")) {
    return over.songs === 401 ? { status: 401, body: {} } : { status: 200, body: [songRow("a", "Dragon Lullaby"), songRow("b", "Tavern Dance")] };
  }
  return undefined;
};

describe("the classic songs page", () => {
  it("signs a young player in by login name, then shows their songs", async () => {
    const after = signedInRoutes({ child: true });
    routes = (url, init) => {
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return { status: 200, body: { access_token: "t", refresh_token: "r", expires_in: 3600, user: { id: "u1" } } };
      }
      return after(url, init);
    };
    await openPage();
    const form = document.querySelector("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    (form.elements.namedItem("identifier") as HTMLInputElement).value = "Ruben";
    (form.elements.namedItem("password") as HTMLInputElement).value = "secret";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();

    const signIn = fetchMock.mock.calls.find(([url]) => String(url).includes("grant_type=password"))!;
    expect(JSON.parse(String(signIn[1]!.body))).toEqual({ email: "ruben@players.dungeongrimoire.invalid", password: "secret" });
    expect([...document.querySelectorAll(".tile")].map((t) => t.getAttribute("aria-label"))).toEqual(["Dragon Lullaby", "Tavern Dance"]);
  });

  it("sends an adult with new Terms waiting to the app, and reads no songs", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes = signedInRoutes({ terms: "2000-01-01" });
    await openPage();
    expect(document.body.textContent).toContain("terms have changed");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("get_player_songs"))).toBe(false);
  });

  it("never stops a young player at the Terms check, as the app does not", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes = signedInRoutes({ terms: "2000-01-01", child: true });
    await openPage();
    expect(document.querySelectorAll(".tile")).toHaveLength(2);
  });

  it("goes back to signing in when the server refuses the token, instead of a page that never loads", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes = signedInRoutes({ songs: 401 });
    await openPage();
    expect(document.querySelector("form")).not.toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
