import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PostedRecord } from "./publishing";
import { readCaption } from "./publishing";
import { descriptionFrom, nextShort, planShort, scheduledWithoutTitle, publishShort, readShortStats, readShortTitles, shortProblems, tagsFrom, uploadShort, type YoutubeIo } from "./youtube";

const rec = (id: string, postedAt: string): PostedRecord => ({ id, account: "a", mediaId: id, permalink: "p", postedAt });
const titles = { a: { title: "A" }, b: { title: "B" }, c: { title: "C" } };

describe("nextShort", () => {
  const base = { titles, uploaded: () => false, isCarousel: () => false };

  // Fails on: oldest first, where tonight's Short waits behind an older Reel whose title was approved late, and
  // YouTube falls out of step with Instagram.
  it("takes the newest Instagram post first, whatever order the records come in", () => {
    const posted = [rec("a", "2026-11-01T00:00:00Z"), rec("b", "2026-11-03T00:00:00Z"), rec("c", "2026-11-02T00:00:00Z")];
    expect(nextShort({ ...base, posted })).toBe("b");
  });

  // Fails on: uploading a Reel nobody approved a title for (the youtube-titles.json gate bypassed).
  it("skips a Reel with no approved title", () => {
    expect(nextShort({ ...base, titles: { a: { title: "A" } }, posted: [rec("a", "2026-11-01T00:00:00Z"), rec("b", "2026-11-02T00:00:00Z")] })).toBe("a");
  });

  // Fails on: uploading the same Reel every hour once it has a youtube.json.
  it("skips a Reel already uploaded", () => {
    expect(nextShort({ ...base, uploaded: (id) => id === "b", posted: [rec("a", "2026-11-01T00:00:00Z"), rec("b", "2026-11-02T00:00:00Z")] })).toBe("a");
  });

  // Fails on: sending a carousel's folder (no video) to YouTube.
  it("skips a carousel", () => {
    expect(nextShort({ ...base, isCarousel: (id) => id === "b", posted: [rec("a", "2026-11-01T00:00:00Z"), rec("b", "2026-11-02T00:00:00Z")] })).toBe("a");
  });

  it("is null when nothing waits", () => {
    expect(nextShort({ ...base, posted: [] })).toBeNull();
  });
});

describe("scheduledWithoutTitle", () => {
  const input = { titles: { a: { title: "A" } }, posted: () => false, isCarousel: () => false };

  // Fails on: a Reel with no title passing the schedule check, so it posts to Instagram alone.
  it("names a scheduled Reel with no approved title and passes one that has a title", () => {
    expect(scheduledWithoutTitle({ ...input, schedule: [{ id: "a" }, { id: "b" }] })).toEqual(["b"]);
  });

  // Fails on: the schedule check demanding a YouTube title for a carousel, which has no video to upload.
  it("leaves out carousels", () => {
    expect(scheduledWithoutTitle({ ...input, isCarousel: (id) => id === "b", schedule: [{ id: "b" }] })).toEqual([]);
  });

  // Fails on: flagging Reels that went out before Shorts existed, every time the schedule is checked.
  it("leaves out what is already posted", () => {
    expect(scheduledWithoutTitle({ ...input, posted: (id) => id === "b", schedule: [{ id: "b" }] })).toEqual([]);
  });
});

describe("shortProblems", () => {
  // Fails on: YouTube answering 400 on a 101-character title after the video bytes were already sent.
  it("refuses a title over 100 characters and takes exactly 100", () => {
    expect(shortProblems("x".repeat(100), "d")).toEqual([]);
    expect(shortProblems("x".repeat(101), "d")).toHaveLength(1);
  });

  // Fails on: counting characters for the description, so multi-byte text slips past the 5000 byte limit.
  it("measures the description in bytes", () => {
    expect(shortProblems("t", "é".repeat(2500))).toEqual([]);
    expect(shortProblems("t", "é".repeat(2501))).toHaveLength(1);
  });

  // Fails on: a < or > in the title or caption reaching YouTube, which rejects the upload.
  it("refuses angle brackets in either field", () => {
    expect(shortProblems("a < b", "d")).toHaveLength(1);
    expect(shortProblems("t", "x > y")).toHaveLength(1);
  });

  // Fails on: an empty title uploading as an untitled video.
  it("refuses an empty title", () => {
    expect(shortProblems("  ", "d")).toHaveLength(1);
  });
});

describe("tagsFrom", () => {
  // Fails on: tags keeping their # or repeating, which YouTube counts against its tag length limit.
  it("strips the # and drops repeats", () => {
    expect(tagsFrom("Hello\n#dnd #dnd #Foo_1")).toEqual(["dnd", "Foo_1"]);
  });
});

describe("uploads without a network", () => {
  afterEach(() => {
    delete process.env.YOUTUBE_CLIENT_FILE;
  });

  const fakeIo = (calls: string[]): YoutubeIo => ({
    readFile: () => Buffer.from("video"),
    fetch: async (url, init) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]}`);
      if (u.includes("uploadType=resumable")) return new Response("{}", { status: 200, headers: { location: "https://upload.example/session" } });
      if (u.startsWith("https://upload.example")) return new Response(JSON.stringify({ id: "vid123" }), { status: 200 });
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    },
  });

  // Fails on: a bad title reaching the network (the check before the first request).
  it("validates before any request", async () => {
    const calls: string[] = [];
    await expect(uploadShort("t", { title: "a<b", description: "d", tags: [], videoPath: "x" }, fakeIo(calls))).rejects.toThrow(/not uploaded/);
    expect(calls).toEqual([]);
  });

  // A /shorts/ link to a long landscape video opens nothing useful (yt-scriptorium's first record had one); youtu.be
  // opens either kind.
  it("returns a link that opens the video whether or not YouTube made it a Short", async () => {
    const out = await uploadShort("t", { title: "T", description: "d", tags: [], videoPath: "x" }, fakeIo([]));
    expect(out).toEqual({ videoId: "vid123", url: "https://youtu.be/vid123" });
  });

  // Fails on: a second upload of an id that already has youtube.json (a double post) and on a missing record after a good one.
  it("writes youtube.json and refuses a second upload without --again", async () => {
    const root = mkdtempSync(join(tmpdir(), "promo-yt-"));
    mkdirSync(join(root, "ep"));
    writeFileSync(join(root, "ep", "ep.mp4"), "v");
    const plan = planShort(root, "ep", { ep: { title: "T" } }, "caption #dnd");
    if (!plan) throw new Error("no plan");
    const calls: string[] = [];
    // The token exchange reads the client file; point it at a fixture.
    const file = join(root, "client.json");
    writeFileSync(file, JSON.stringify({ installed: { client_id: "c", client_secret: "s" } }));
    process.env.YOUTUBE_CLIENT_FILE = file;
    const r = await publishShort("refresh", root, "ep", plan, {}, fakeIo(calls));
    expect(JSON.parse(readFileSync(join(root, "ep", "youtube.json"), "utf8")).videoId).toBe("vid123");
    expect(r.url).toContain("vid123");
    const before = calls.length;
    await expect(publishShort("refresh", root, "ep", plan, {}, fakeIo(calls))).rejects.toThrow(/already on YouTube/);
    expect(calls.length).toBe(before);
  });
});

describe("readShortStats", () => {
  // Fails on: a hidden like count reading as 0 instead of unknown.
  it("reports a missing count as null", async () => {
    const io = { fetch: async () => new Response(JSON.stringify({ items: [{ id: "v", statistics: { viewCount: "12" } }] }), { status: 200 }) };
    expect((await readShortStats("t", ["v"], io)).get("v")).toEqual({ views: 12, likes: null });
  });
});

describe("descriptionFrom", () => {
  // A YouTube viewer has no "bio" to follow: the Instagram pointer must become the link itself.
  it("turns Instagram's link-in-bio pointer into the site's address", () => {
    expect(descriptionFrom("Load the demo. Link in bio.\n\n#dnd")).toBe("Load the demo. Try it at https://dungeongrimoire.com\n\n#dnd");
  });
});

// The hourly job always picks the oldest waiting Short, so one approved title YouTube would refuse is retried every
// hour and holds up every Short behind it. Caught here, at commit time, instead of in the night.
describe.each(Object.entries(readShortTitles()))("approved Short %s", (id, { title }) => {
  it("has a caption to describe it, and a title and description YouTube will take", () => {
    const caption = readCaption(id);
    expect(caption, `captions/${id}.txt`).not.toBeNull();
    expect(shortProblems(title, descriptionFrom(caption as string))).toEqual([]);
  });
});
