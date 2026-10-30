/**
 * The browser a promo episode is filmed in: a phone-sized, signed-in page on
 * the local stack, and a camera that records it at full resolution.
 *
 * Why a visible Chrome window and not headless: a headless page sends
 * screencast frames only now and then (6 frames in 2.5 s when tried), and at
 * CSS pixels whatever the emulated pixel ratio. A headed window launched with
 * `--force-device-scale-factor=3` sends every frame (60 fps while anything
 * moves) at 1170x2079. The window opens off to the side; it can be ignored.
 *
 * Why the screencast and not Playwright's own video: that needs a separate
 * ffmpeg download and encodes VP8 at about 1 Mbit/s, which shows on a phone.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { LOCAL_DEV_PASSWORD } from "../lib/dev-stack.ts";
import { FIXTURE_EMAIL, PLAYER_EMAIL } from "../lib/dev-campaign-io.ts";
import { publicAssetUrl } from "./assets.ts";
import type { Account, ShotContext, SoundCue } from "./types.ts";

/** CSS viewport: an iPhone's width at exactly 9:16, so a frame fills a Reel. */
const VIEWPORT = { width: 390, height: 693 };
const SCALE = 3;
/** The clip size every shot is encoded at. */
export const CLIP = { width: 1080, height: 1920, fps: 30 };

const EMAIL: Record<Account, string> = { dm: FIXTURE_EMAIL, player: PLAYER_EMAIL };
/** The code the filmed page runs first: campaign, seeded dice, tap marks, sound reports. */
const PAGE_SETUP = join(dirname(fileURLToPath(import.meta.url)), "page-setup.js");

export async function launch(): Promise<Browser> {
  return chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--window-position=2400,0", `--force-device-scale-factor=${SCALE}`, "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
  });
}

type StoredSession = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function signIn(browser: Browser, base: string, account: Account): Promise<StoredSession> {
  const context = await browser.newContext({ ...devices["iPhone 14"], viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.locator('input[autocomplete="username"]').fill(EMAIL[account]);
    await page.locator('input[autocomplete="current-password"]').fill(LOCAL_DEV_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    await page.waitForTimeout(1500);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

export interface Stage {
  page: Page;
  context: BrowserContext;
  /** Navigates and waits for the page to go quiet. */
  open(path: string): Promise<void>;
  /** Films `run` and writes it to `out` as a 1080x1920 clip; returns its length and the cues logged during it. */
  film(out: string, run: (ctx: ShotContext) => Promise<void>): Promise<{ duration: number; cues: SoundCue[] }>;
}

export async function openStage(
  browser: Browser,
  opts: { base: string; account: Account; campaignId: string; seed: number; scratch: string },
): Promise<Stage> {
  const { hostname } = new URL(opts.base);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`Refusing to film ${opts.base}: promo episodes are shot against the local stack only.`);
  }
  const storageState = await signIn(browser, opts.base, opts.account);
  const context = await browser.newContext({
    ...devices["iPhone 14"],
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    reducedMotion: "no-preference",
    storageState,
  });
  const args = JSON.stringify({ mode: opts.account, campaignId: opts.campaignId, seed: opts.seed });
  await context.addInitScript({ content: `window.__promoArgs = ${args};\n${readFileSync(PAGE_SETUP, "utf8")}` });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  // The shot being filmed, if any, collects the sounds the page reports.
  let listener: ((src: string, gain: number) => void) | null = null;
  await page.exposeFunction("__promoSound", (src: string, gain: number) => listener?.(src, gain));

  async function open(path: string): Promise<void> {
    await page.goto(`${opts.base}${path}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }

  async function film(out: string, run: (ctx: ShotContext) => Promise<void>) {
    return filmShot(page, cdp, opts.scratch, out, run, open, (fn) => {
      listener = fn;
    });
  }

  return { page, context, open, film };
}

async function filmShot(
  page: Page,
  cdp: CDPSession,
  scratch: string,
  out: string,
  run: (ctx: ShotContext) => Promise<void>,
  open: (path: string) => Promise<void>,
  listen: (fn: ((src: string, gain: number) => void) | null) => void,
): Promise<{ duration: number; cues: SoundCue[] }> {
  const dir = join(scratch, "frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // Frames are stamped with the time they arrive, on the same clock as the cues.
  const frames: number[] = [];
  const onFrame = (f: { data: string; sessionId: number }) => {
    writeFileSync(join(dir, `${String(frames.length).padStart(5, "0")}.jpg`), Buffer.from(f.data, "base64"));
    frames.push(performance.now() / 1000);
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  };
  cdp.on("Page.screencastFrame", onFrame);
  const start = performance.now() / 1000;
  const cues: SoundCue[] = [];
  listen((src, gain) => {
    if (src) cues.push({ t: performance.now() / 1000 - start, src: publicAssetUrl(src), gain });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIEWPORT.width * SCALE, maxHeight: VIEWPORT.height * SCALE });

  // Episodes destructure these helpers, so none of them may lean on `this`.
  async function scroll(dy: number, ms = 700): Promise<void> {
    const steps = Math.max(1, Math.round(ms / 16));
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(250);
  }

  const ctx: ShotContext = {
    page,
    async tap(target, holdMs = 600) {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await target.tap();
      await page.waitForTimeout(holdMs);
    },
    async type(target, text) {
      await target.tap();
      await target.pressSequentially(text, { delay: 70 });
    },
    scroll,
    async scrollTo(target, ms = 900, offset = 90) {
      await target.waitFor({ timeout: 15_000 });
      const box = await target.boundingBox();
      if (!box) throw new Error("scrollTo: the target is not on the page.");
      await scroll(box.y - offset, ms);
    },
    async hold(ms) {
      await page.waitForTimeout(ms);
    },
    cue(src, gain) {
      cues.push({ t: performance.now() / 1000 - start, src, ...(gain === undefined ? {} : { gain }) });
    },
    open,
  };

  try {
    await run(ctx);
    await page.waitForTimeout(300);
  } catch (error) {
    // The screen at the moment a take failed says more than the selector does.
    const shot = out.replace(/\.mp4$/, ".failed.png");
    await page.screenshot({ path: shot }).catch(() => undefined);
    console.error(`The take failed; the screen at that moment is ${shot}`);
    throw error;
  } finally {
    listen(null);
    await cdp.send("Page.stopScreencast").catch(() => undefined);
    cdp.off("Page.screencastFrame", onFrame);
  }
  const end = performance.now() / 1000;
  if (frames.length === 0) throw new Error(`No frames were captured for ${out}.`);

  // The first frame stands from the start of the shot; each frame lasts until the next.
  const lines: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const from = i === 0 ? start : frames[i];
    const to = i + 1 < frames.length ? frames[i + 1] : end;
    lines.push(`file '${String(i).padStart(5, "0")}.jpg'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`);
  }
  lines.push(`file '${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(join(dir, "list.txt"), lines.join("\n"));
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `fps=${CLIP.fps},scale=${CLIP.width}:${CLIP.height}:flags=lanczos,setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-an",
    out,
  ]);
  return { duration: end - start, cues };
}
