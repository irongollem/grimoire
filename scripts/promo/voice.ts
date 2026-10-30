/**
 * A small local voice-over recorder for the promo pipeline.
 *
 *   tsx --tsconfig tsconfig.node.json scripts/promo/voice.ts [episode id] [--root <dir>]
 *
 * Without an episode the page opens on a list of every recorded episode (a
 * folder under the root with a manifest.json) and its progress; the episode
 * being worked on is the page's `?episode=` and can be switched there.
 *
 * Serves a page on 127.0.0.1 where the maintainer reads each shot's narration
 * with the clip playing, keeps or retakes it, and cuts the Reel. Takes land as
 * `promo-out/<id>/vo/<shot id>.wav`, trimmed, exactly where assemble.ts looks.
 * See docs/promo-videos.md. The page (voice/index.html, voice/voice.js) is plain
 * browser JS because the scripts' tsconfig has no DOM types.
 */
import { execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWav, trimSilence } from "./wav";
import type { EpisodeManifest } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIRST_PORT = 5182;
const TAKE_EXTENSIONS = ["wav", "m4a", "mp3", "aif", "aiff"] as const;
const MAX_BODY = 200 * 1024 * 1024;
const MIME: Record<string, string> = {
  mp4: "video/mp4", wav: "audio/wav", m4a: "audio/mp4", mp3: "audio/mpeg", aif: "audio/aiff", aiff: "audio/aiff",
};
const FONTS: Record<string, string> = {
  "alegreya-sans-400.woff2": "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-400-normal.woff2",
  "alegreya-sans-700.woff2": "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-700-normal.woff2",
  "fondamento-400.woff2": "node_modules/@fontsource/fondamento/files/fondamento-latin-400-normal.woff2",
};

const EPISODE_ID = /^[a-z0-9][a-z0-9-]*$/i;

function parseArgs(argv: string[]): { id: string | null; root: string } {
  let root = "promo-out";
  let id: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") root = argv[++i] ?? root;
    else if (id === null) id = argv[i];
  }
  if (id !== null && !EPISODE_ID.test(id)) throw new Error("Usage: voice.ts [episode id] [--root <dir>]");
  return { id, root: resolve(root) };
}

const { id: START_EPISODE, root: ROOT } = parseArgs(process.argv.slice(2));

/** Every recorded episode: a folder under the root holding a manifest. */
function episodeIds(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && EPISODE_ID.test(d.name) && existsSync(join(ROOT, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
}

interface Episode {
  id: string;
  dir: string;
  vo: string;
}

/** The episode a request names, only if it is one of the folders on disk: a path is never built from request input. */
function episodeFor(url: URL): Episode | null {
  const id = episodeIds().find((e) => e === url.searchParams.get("episode"));
  if (!id) return null;
  const dir = join(ROOT, id);
  return { id, dir, vo: join(dir, "vo") };
}

function readManifest(ep: Episode): EpisodeManifest {
  return JSON.parse(readFileSync(join(ep.dir, "manifest.json"), "utf8")) as EpisodeManifest;
}

/** The manifest is the only source of shot ids, so a path is never built from request input. */
function findShot(ep: Episode, shotId: string) {
  return readManifest(ep).shots.find((s) => s.id === shotId) ?? null;
}

function takeFile(ep: Episode, shotId: string): string | null {
  for (const ext of TAKE_EXTENSIONS) {
    const f = join(ep.vo, `${shotId}.${ext}`);
    if (existsSync(f)) return f;
  }
  return null;
}

function probeDuration(file: string): Promise<number | null> {
  return new Promise((done) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      (err, out) => {
        const n = Number.parseFloat(out);
        done(err || !Number.isFinite(n) ? null : n);
      },
    );
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, type: string): void {
  if (!existsSync(file)) return json(res, 404, { error: "not found" });
  const size = statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const head = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-store" };
  if (!range || (range[1] === "" && range[2] === "")) {
    res.writeHead(200, { ...head, "content-length": size });
    createReadStream(file).pipe(res);
    return;
  }
  let start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start > end || start >= size) {
    res.writeHead(416, { "content-range": `bytes */${size}` });
    res.end();
    return;
  }
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
  createReadStream(file, { start, end }).pipe(res);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on("data", (c: Buffer) => {
      n += c.length;
      if (n > MAX_BODY) { fail(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => done(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

async function saveTake(ep: Episode, shotId: string, rate: number, body: Buffer): Promise<{ duration: number; raw: number }> {
  const even = body.length - (body.length % 2);
  // Copy to an aligned buffer: a Buffer slice may sit at an odd byte offset.
  const samples = new Int16Array(even / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = body.readInt16LE(i * 2);
  const trimmed = trimSilence(samples, rate);
  mkdirSync(ep.vo, { recursive: true });
  writeFileSync(join(ep.vo, `${shotId}.wav`), encodeWav(trimmed, rate));
  // The assembler prefers wav, but never leave an older take of another kind around.
  for (const ext of TAKE_EXTENSIONS) if (ext !== "wav") rmSync(join(ep.vo, `${shotId}.${ext}`), { force: true });
  return { duration: trimmed.length / rate, raw: samples.length / rate };
}

let assembling = false;
function assemble(ep: Episode): Promise<{ ok: boolean; tail: string }> {
  return new Promise((done) => {
    const child = spawn("npx", ["tsx", "--tsconfig", "tsconfig.node.json", "scripts/promo/assemble.ts", ep.id, "--root", ROOT], {
      cwd: resolve(HERE, "../.."),
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (e) => done({ ok: false, tail: String(e) }));
    child.on("close", (code) => done({ ok: code === 0, tail: out.trim().split("\n").slice(-15).join("\n") }));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/") return sendFile(req, res, join(HERE, "voice/index.html"), "text/html; charset=utf-8");
  if (method === "GET" && path === "/voice.js") return sendFile(req, res, join(HERE, "voice/voice.js"), "text/javascript; charset=utf-8");
  if (method === "GET" && path === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (method === "GET" && path.startsWith("/font/")) {
    // Own keys only: a plain lookup would also answer "constructor" and friends.
    const name = path.slice(6);
    const rel = Object.hasOwn(FONTS, name) ? FONTS[name] : undefined;
    return rel ? sendFile(req, res, resolve(HERE, "../..", rel), "font/woff2") : json(res, 404, { error: "not found" });
  }

  if (method === "GET" && path === "/api/episodes") {
    const list = episodeIds().map((id) => {
      const ep: Episode = { id, dir: join(ROOT, id), vo: join(ROOT, id, "vo") };
      const m = readManifest(ep);
      return {
        id,
        title: m.title,
        account: m.account,
        pairedWith: m.pairedWith,
        recordedAt: m.recordedAt,
        shots: m.shots.length,
        takes: m.shots.filter((s) => takeFile(ep, s.id) !== null).length,
        reel: existsSync(join(ep.dir, `${id}.mp4`)),
      };
    });
    return json(res, 200, list);
  }

  // Everything below works on one episode, named by ?episode=.
  const ep = episodeFor(url);
  if (!ep) return json(res, 404, { error: "unknown episode" });

  if (method === "GET" && path === "/api/episode") {
    const manifest = readManifest(ep);
    const shots = await Promise.all(
      manifest.shots.map(async (s) => {
        const file = takeFile(ep, s.id);
        return { ...s, take: file ? { duration: await probeDuration(file) } : null };
      }),
    );
    return json(res, 200, { ...manifest, shots, reel: existsSync(join(ep.dir, `${ep.id}.mp4`)) });
  }

  const clip = /^\/(clip|take)\/([^/]+)$/.exec(path);
  if (method === "GET" && clip) {
    const shot = findShot(ep, decodeURIComponent(clip[2]));
    if (!shot) return json(res, 404, { error: "unknown shot" });
    if (clip[1] === "clip") return sendFile(req, res, join(ep.dir, shot.file), MIME.mp4);
    const file = takeFile(ep, shot.id);
    return file ? sendFile(req, res, file, MIME[file.split(".").pop() ?? "wav"]) : json(res, 404, { error: "no take" });
  }

  const put = /^\/api\/take\/([^/]+)$/.exec(path);
  if (method === "PUT" && put) {
    const shot = findShot(ep, decodeURIComponent(put[1]));
    if (!shot) return json(res, 400, { error: "unknown shot" });
    const rate = Number(url.searchParams.get("rate"));
    if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) return json(res, 400, { error: "bad sample rate" });
    const body = await readBody(req);
    if (body.length < 2) return json(res, 400, { error: "empty take" });
    return json(res, 200, await saveTake(ep, shot.id, rate, body));
  }

  if (method === "POST" && path === "/api/assemble") {
    if (assembling) return json(res, 409, { error: "already assembling" });
    assembling = true;
    try {
      return json(res, 200, await assemble(ep));
    } finally {
      assembling = false;
    }
  }

  if (method === "GET" && path === "/reel") return sendFile(req, res, join(ep.dir, `${ep.id}.mp4`), MIME.mp4);

  json(res, 404, { error: "not found" });
}

function listen(port: number): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer((req, res) => {
      handle(req, res).catch((e: unknown) => {
        if (!res.headersSent) json(res, 500, { error: String(e) });
        else res.end();
      });
    });
    server.once("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE" && port < FIRST_PORT + 20) listen(port + 1).then(done, fail);
      else fail(e);
    });
    server.listen(port, "127.0.0.1", () => done(port));
  });
}

const port = await listen(FIRST_PORT);
const address = `http://127.0.0.1:${port}/${START_EPISODE ? `?episode=${START_EPISODE}` : ""}`;
console.log(`Voice-over recorder: ${address}`);
if (!process.env.PROMO_VOICE_NO_OPEN) execFile("open", [address], () => undefined);
