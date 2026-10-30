/**
 * The browser a promo episode is filmed in: a signed-in page on the local
 * stack at phone, tablet or desktop size, and a camera that records it at full
 * resolution.
 *
 * Why a visible Chrome window and not headless: a headless page sends
 * screencast frames only now and then (6 frames in 2.5 s when tried), and at
 * CSS pixels whatever the emulated pixel ratio. A headed window launched with
 * `--force-device-scale-factor=3` sends every frame (60 fps while anything
 * moves) at 1170x2079. The window opens off to the side; it can be ignored.
 * That flag is per browser, so the recorder launches one browser per device
 * scale in use (3 for a phone, 2 for a tablet or desktop).
 *
 * Why the screencast and not Playwright's own video: that needs a separate
 * ffmpeg download and encodes VP8 at about 1 Mbit/s, which shows on a phone.
 *
 * A clip keeps the screen's native pixel size (the assembler frames it), so a
 * desktop shot can be zoomed into without going soft.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, type Browser, type BrowserContext, type BrowserContextOptions, type CDPSession, type Page } from "playwright";
import { LOCAL_DEV_PASSWORD } from "../lib/dev-stack.ts";
import { FIXTURE_EMAIL, PLAYER_EMAIL } from "../lib/dev-campaign-io.ts";
import { publicAssetUrl } from "./assets.ts";
import { DEVICES } from "./devices.ts";
import type { Account, CameraKeyframe, Device, Offstage, ShotContext, SoundCue } from "./types.ts";

export const FPS = 30;

const EMAIL: Record<Account, string> = { dm: FIXTURE_EMAIL, player: PLAYER_EMAIL };
/** The code the filmed page runs first: campaign, seeded dice, tap marks, sound reports. */
const PAGE_SETUP = join(dirname(fileURLToPath(import.meta.url)), "page-setup.js");

/** A visible Chrome window; `scale` is the device pixel ratio every page in it renders at. */
export async function launch(scale: number): Promise<Browser> {
  return chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--window-position=2400,0", `--force-device-scale-factor=${scale}`, "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
  });
}

/** A browser nobody watches, for the offstage actor: it films nothing, so it needs no frames. */
export async function launchOffstage(): Promise<Browser> {
  return chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
}

function contextOptions(device: Device): BrowserContextOptions {
  const spec = DEVICES[device];
  const base = device === "phone" ? devices["iPhone 14"] : device === "tablet" ? devices["iPad Pro 11"] : devices["Desktop Chrome"];
  return { ...base, viewport: spec.viewport, deviceScaleFactor: spec.scale, hasTouch: spec.touch, isMobile: spec.mobile };
}

type StoredSession = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function signIn(browser: Browser, base: string, account: Account, device: Device): Promise<StoredSession> {
  const context = await browser.newContext(contextOptions(device));
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

function assertLocal(base: string): void {
  const { hostname } = new URL(base);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`Refusing to film ${base}: promo episodes are shot against the local stack only.`);
  }
}

interface StageOptions {
  base: string;
  account: Account;
  device: Device;
  campaignId: string;
  seed: number;
}

async function settledPage(browser: Browser, opts: StageOptions) {
  assertLocal(opts.base);
  const storageState = await signIn(browser, opts.base, opts.account, opts.device);
  const context = await browser.newContext({ ...contextOptions(opts.device), colorScheme: "light", reducedMotion: "no-preference", storageState });
  const args = JSON.stringify({ mode: opts.account, campaignId: opts.campaignId, seed: opts.seed });
  await context.addInitScript({ content: `window.__promoArgs = ${args};\n${readFileSync(PAGE_SETUP, "utf8")}` });
  const page = await context.newPage();
  async function open(path: string): Promise<void> {
    await page.goto(`${opts.base}${path}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await untilNoSkeleton(page);
    await page.waitForTimeout(800);
  }
  return { context, page, open };
}

/** Waits until no grey loading placeholder is left on the page, so a shot never opens on skeletons. */
async function untilNoSkeleton(page: Page): Promise<void> {
  await page.waitForFunction('!document.querySelector(".skeleton-block")', undefined, { timeout: 15_000 }).catch(() => undefined);
}

/** The other person at the table: a desktop page that is never filmed. */
export async function openOffstage(browser: Browser, opts: Omit<StageOptions, "device">): Promise<Offstage> {
  const { page, open } = await settledPage(browser, { ...opts, device: "desktop" });
  return { page, open, base: opts.base };
}

export interface Stage {
  page: Page;
  device: Device;
  /** Navigates and waits for the page to go quiet. */
  open(path: string): Promise<void>;
  /** Films `run` and writes it to `out` at the screen's native pixel size; returns its length, size, camera moves and the cues logged during it. */
  film(
    out: string,
    run: (ctx: ShotContext) => Promise<void>,
  ): Promise<{ duration: number; size: { width: number; height: number }; camera: CameraKeyframe[]; cues: SoundCue[] }>;
}

export async function openStage(
  browser: Browser,
  opts: StageOptions & { scratch: string; offstage: (account: Account) => Promise<Offstage> },
): Promise<Stage> {
  const { page, context, open } = await settledPage(browser, opts);
  const cdp = await context.newCDPSession(page);
  // The shot being filmed, if any, collects the sounds the page reports.
  let listener: ((src: string, gain: number) => void) | null = null;
  await page.exposeFunction("__promoSound", (src: string, gain: number) => listener?.(src, gain));

  async function film(out: string, run: (ctx: ShotContext) => Promise<void>) {
    return filmShot(page, cdp, opts.device, opts.scratch, out, run, open, opts.offstage, (fn) => {
      listener = fn;
    });
  }

  return { page, device: opts.device, open, film };
}

async function filmShot(
  page: Page,
  cdp: CDPSession,
  device: Device,
  scratch: string,
  out: string,
  run: (ctx: ShotContext) => Promise<void>,
  open: (path: string) => Promise<void>,
  offstage: (account: Account) => Promise<Offstage>,
  listen: (fn: ((src: string, gain: number) => void) | null) => void,
) {
  const { viewport, scale, touch } = DEVICES[device];
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
  const camera: CameraKeyframe[] = [];
  listen((src, gain) => {
    if (src) cues.push({ t: performance.now() / 1000 - start, src: publicAssetUrl(src), gain });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: viewport.width * scale, maxHeight: viewport.height * scale });

  // Episodes destructure these helpers, so none of them may lean on `this`.
  async function scroll(dy: number, ms = 700): Promise<void> {
    const steps = Math.max(1, Math.round(ms / 16));
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
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
      // A phone is touched; a desktop is clicked. Either way the page draws the ring.
      if (touch) await target.tap();
      else await target.click();
      await page.waitForTimeout(holdMs);
    },
    async type(target, text) {
      if (touch) await target.tap();
      else await target.click();
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
    async focus(target, opts) {
      if (target === null) {
        camera.push({ t: performance.now() / 1000 - start, rect: null, ...(opts?.leftInset === undefined ? {} : { homeInset: opts.leftInset * scale }) });
        return;
      }
      await target.waitFor({ timeout: 15_000 });
      let box = await target.boundingBox();
      await target.scrollIntoViewIfNeeded();
      const after = await target.boundingBox();
      if (box && after && box.y !== after.y) await page.waitForTimeout(400);
      box = (await target.boundingBox()) ?? box;
      if (!box) throw new Error("focus: the target is not on the page.");
      // Only what is on the screen can be framed.
      const x0 = Math.max(0, box.x);
      const y0 = Math.max(0, box.y);
      const x1 = Math.min(viewport.width, box.x + box.width);
      const y1 = Math.min(viewport.height, box.y + box.height);
      if (x1 <= x0 || y1 <= y0) throw new Error("focus: the target is outside the screen.");
      camera.push({
        t: performance.now() / 1000 - start,
        rect: { x: x0 * scale, y: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale },
        ...(opts?.padding === undefined ? {} : { padding: opts.padding * scale }),
      });
    },
    async settled() {
      await untilNoSkeleton(page);
      await page.waitForTimeout(400);
    },
    async overview() {
      camera.push({ t: performance.now() / 1000 - start, rect: null, overview: true });
    },
    offstage,
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
  // `-t` because the concat demuxer shows its closing repeat of the last frame for as long as the one before it
  // (a screen that stood still for 2 s came out at 4 s), which the recorded length must not include.
  // Native size, cropped by at most a pixel to even dimensions (H.264 4:2:0 needs them).
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-t", (end - start).toFixed(4),
    "-vf", `fps=${FPS},crop=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-an",
    out,
  ]);
  const [width, height] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", out], { encoding: "utf8" })
    .trim()
    .split("x")
    .map(Number);
  return { duration: end - start, size: { width, height }, camera, cues };
}
