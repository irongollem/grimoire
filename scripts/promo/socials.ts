/**
 * The recorder's Socials tab, server half: the account at a glance, every Reel
 * with its caption, schedule and readiness, and the buttons that change them.
 *
 * This server can now post publicly, and any website the maintainer visits can
 * send requests to 127.0.0.1, so every write passes `isTrustedWrite` first.
 * Readiness, schedule and the post itself all live in publishing.ts; this file
 * only routes to them.
 */
import { existsSync, readdirSync } from "node:fs";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkCarousel, isCarousel, postCarousel } from "./carousels";
import { accountSummary, findAccount, postsLeft, recentMedia, type RecentMedia } from "./instagram";
import { checkReel, postReel, readSchedule, readPosted, setScheduled, writeCaption, type PostedRecord } from "./publishing";
import type { EpisodeManifest } from "./types";

export const EPISODE_ID = /^[a-z0-9][a-z0-9-]*$/i;
export const PLIST = join(homedir(), "Library/LaunchAgents/nl.dungeongrimoire.promo-post.plist");
const WRITE_HEADER = "x-promo-socials";
const MAX_BODY = 1024 * 1024;

/**
 * A write is trusted only when it came from the recorder's own page: the right
 * Host (blocks DNS rebinding), a same-origin Origin if one is sent, and a
 * custom header that a cross-site form or simple request cannot set without a
 * CORS preflight, which this server never answers.
 */
export function isTrustedWrite(headers: IncomingHttpHeaders, port: number): boolean {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!headers.host || !hosts.includes(headers.host)) return false;
  if (headers.origin !== undefined && !hosts.some((h) => headers.origin === `http://${h}`)) return false;
  return headers[WRITE_HEADER] === "1";
}

export interface ReelRow {
  id: string;
  title: string;
  account: "dm" | "player";
  pairedWith: string | null;
  scheduledAt: string | null;
  posted: PostedRecord | null;
  problems: string[];
  caption: string | null;
  coverAt: number | null;
  hasVideo: boolean;
  hasCover: boolean;
}

/** Unposted scheduled by time, then unposted unscheduled by id, then posted newest first. */
export function orderReels<T extends { id: string; scheduledAt: string | null; posted: { postedAt: string } | null }>(rows: T[]): T[] {
  const rank = (r: T) => (r.posted ? 2 : r.scheduledAt ? 0 : 1);
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return Date.parse(a.scheduledAt as string) - Date.parse(b.scheduledAt as string) || a.id.localeCompare(b.id);
    if (ra === 2) return Date.parse((b.posted as { postedAt: string }).postedAt) - Date.parse((a.posted as { postedAt: string }).postedAt);
    return a.id.localeCompare(b.id);
  });
}

export interface SocialsContext {
  root: string;
  port: number;
  json: (res: ServerResponse, status: number, body: unknown) => void;
  sendFile: (req: IncomingMessage, res: ServerResponse, file: string, type: string) => void;
  episodeIds: () => string[];
  readManifest: (id: string) => EpisodeManifest;
}

/** One post at a time: a second click while Instagram is processing must not start a second upload. */
let posting = false;

function readText(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on("data", (c: Buffer) => {
      n += c.length;
      if (n > MAX_BODY) { fail(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function instagramPart(): Promise<{
  account: { username: string; followers: number; posts: number; quota: { used: number; total: number } } | null;
  accountError: string | null;
  recent: RecentMedia[];
}> {
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) return { account: null, accountError: "INSTAGRAM_SYSTEM_USER_TOKEN is not set", recent: [] };
  try {
    const acct = await findAccount(token);
    const [summary, quota, recent] = await Promise.all([accountSummary(token, acct.id), postsLeft(token, acct.id), recentMedia(token, acct.id)]);
    return { account: { username: acct.username, ...summary, quota }, accountError: null, recent };
  } catch (e) {
    return { account: null, accountError: message(e), recent: [] };
  }
}

/** Photo posts: folders under the root holding slides and no Reel manifest. */
function carouselIds(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && EPISODE_ID.test(d.name) && isCarousel(root, d.name))
    .map((d) => d.name)
    .sort();
}

/** Every post the tab can act on: Reels with a manifest, and carousels. */
function postIds(ctx: SocialsContext): string[] {
  return [...ctx.episodeIds(), ...carouselIds(ctx.root)];
}

function carouselRows(ctx: SocialsContext, scheduled: Map<string, string>): ReelRow[] {
  return carouselIds(ctx.root).map((id) => {
    const check = checkCarousel(ctx.root, id);
    return {
      id,
      title: check.caption?.split("\n")[0] ?? id,
      account: "dm",
      pairedWith: null,
      scheduledAt: scheduled.get(id) ?? null,
      posted: check.posted,
      problems: check.problems,
      caption: check.caption,
      coverAt: null,
      hasVideo: false,
      hasCover: check.slides.length > 0,
    };
  });
}

function reelRows(ctx: SocialsContext): ReelRow[] {
  const scheduled = new Map(readSchedule().map((e) => [e.id, e.at]));
  const rows: ReelRow[] = [];
  for (const id of ctx.episodeIds()) {
    const m = ctx.readManifest(id);
    if ((m.format ?? "reel") !== "reel") continue;
    const check = checkReel(ctx.root, id);
    rows.push({
      id,
      title: m.title,
      account: m.account,
      pairedWith: m.pairedWith,
      scheduledAt: scheduled.get(id) ?? null,
      posted: check.posted,
      problems: check.problems,
      caption: check.caption,
      coverAt: check.coverAt,
      hasVideo: existsSync(check.video),
      hasCover: existsSync(join(ctx.root, id, "cover.jpg")),
    });
  }
  return orderReels([...rows, ...carouselRows(ctx, scheduled)]);
}

/** Returns true when it handled the request. */
export async function handleSocials(req: IncomingMessage, res: ServerResponse, url: URL, ctx: SocialsContext): Promise<boolean> {
  const path = url.pathname;
  if (!path.startsWith("/api/socials")) return false;
  const method = req.method ?? "GET";
  const { json } = ctx;

  if (method !== "GET" && !isTrustedWrite(req.headers, ctx.port)) {
    json(res, 403, { error: "refused: not a request from the recorder page" });
    return true;
  }

  if (method === "GET" && path === "/api/socials") {
    const [ig, reels] = await Promise.all([instagramPart(), Promise.resolve(reelRows(ctx))]);
    json(res, 200, {
      account: ig.account,
      accountError: ig.accountError,
      scheduler: { installed: existsSync(PLIST), plist: PLIST },
      reels,
      recent: ig.recent,
    });
    return true;
  }

  const route = /^\/api\/socials\/(cover|caption|schedule|post)$/.exec(path);
  const verb = { cover: "GET", caption: "PUT", schedule: "PUT", post: "POST" } as const;
  if (!route || method !== verb[route[1] as keyof typeof verb]) {
    json(res, 404, { error: "not found" });
    return true;
  }
  // Matched against the folders on disk, so a path is never built from request input.
  const requested = url.searchParams.get("episode") ?? "";
  const id = EPISODE_ID.test(requested) ? postIds(ctx).find((e) => e === requested) : undefined;
  if (!id) {
    json(res, 404, { error: "unknown episode" });
    return true;
  }

  switch (route[1]) {
    case "cover":
      // A carousel's cover is its first slide.
      ctx.sendFile(req, res, isCarousel(ctx.root, id) ? join(ctx.root, id, "slides", "slide-1.jpg") : join(ctx.root, id, "cover.jpg"), "image/jpeg");
      return true;
    case "caption": {
      writeCaption(id, await readText(req));
      json(res, 200, { problems: (isCarousel(ctx.root, id) ? checkCarousel(ctx.root, id) : checkReel(ctx.root, id)).problems });
      return true;
    }
    case "schedule": {
      let at: string | null;
      try {
        const body = JSON.parse(await readText(req)) as { at?: unknown };
        if (body.at !== null && typeof body.at !== "string") throw new Error('expected { "at": string | null }');
        at = body.at;
      } catch (e) {
        json(res, 400, { error: message(e) });
        return true;
      }
      if (readPosted(ctx.root, id)) {
        json(res, 409, { error: `${id} is already posted` });
        return true;
      }
      try {
        const next = setScheduled(id, at);
        json(res, 200, { scheduledAt: next.find((e) => e.id === id)?.at ?? null });
      } catch (e) {
        json(res, 400, { error: message(e) });
      }
      return true;
    }
    default: {
      const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
      if (!token) {
        json(res, 503, { error: "INSTAGRAM_SYSTEM_USER_TOKEN is not set" });
        return true;
      }
      if (posting) {
        json(res, 409, { error: "a post is already running" });
        return true;
      }
      posting = true;
      try {
        const log = (line: string) => console.log(`[socials ${id}] ${line}`);
        const posted = isCarousel(ctx.root, id) ? await postCarousel(token, ctx.root, id, log) : await postReel(token, ctx.root, id, log);
        json(res, 200, { posted });
      } catch (e) {
        json(res, 400, { error: message(e) });
      } finally {
        posting = false;
      }
      return true;
    }
  }
}
