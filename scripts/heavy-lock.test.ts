import { mkdtempSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAlive, readOwner, release, shellQuote, tryAcquire } from "./heavy-lock.mjs";

let base: string;
let dir: string;
const owner = (pid: number, label = "job") => ({ pid, label, cwd: "/repo", command: "vitest run", startedAt: new Date(0).toISOString() });
// A pid that is never a running process (above the macOS and Linux pid ceilings).
const DEAD = 9_999_999;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "heavy-lock-"));
  dir = join(base, "lock");
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("heavy-lock", () => {
  // Bug: two sessions both got the lock, which is the whole failure this exists to stop.
  it("gives the lock to one job and tells the next who holds it", () => {
    expect(tryAcquire(owner(process.pid, "first"), dir)).toBeNull();
    const held = tryAcquire(owner(process.ppid, "second"), dir);
    expect(held).toMatchObject({ pid: process.pid, label: "first" });
  });

  // Bug: a session killed mid-job left the lock behind and every other session waited on it forever.
  it("takes over a lock whose owner is no longer running", () => {
    expect(isAlive(DEAD)).toBe(false);
    expect(tryAcquire(owner(DEAD, "crashed"), dir)).toBeNull();
    expect(tryAcquire(owner(process.pid, "next"), dir)).toBeNull();
    expect(readOwner(dir)).toMatchObject({ pid: process.pid, label: "next" });
  });

  // Bug: a holder killed between making the lock and writing its owner left an ownerless lock nobody could clear.
  it("takes over an ownerless lock only once it is a minute old", () => {
    mkdirSync(dir);
    const now = Date.now();
    expect(tryAcquire(owner(process.pid), dir, now)).not.toBeNull();
    const old = new Date(now - 120_000);
    utimesSync(dir, old, old);
    expect(tryAcquire(owner(process.pid), dir, now)).toBeNull();
  });

  // Bug: a job finishing after its stale lock was taken over deleted the new holder's lock.
  it("lets go only of a lock it still holds", () => {
    tryAcquire(owner(process.pid, "holder"), dir);
    release(DEAD, dir);
    expect(readOwner(dir)).toMatchObject({ label: "holder" });
    release(process.pid, dir);
    expect(readOwner(dir)).toBeNull();
  });

  // Bug: `npm test -- -t "adds a species"` reached vitest as `-t adds a species`: the lock re-split npm's arguments.
  it("keeps an appended argument one shell word, quotes and all", () => {
    expect(shellQuote("--maxWorkers=4")).toBe("--maxWorkers=4");
    expect(shellQuote("adds a species")).toBe("'adds a species'");
    expect(shellQuote("it's $HOME")).toBe(`'it'\\''s $HOME'`);
  });
});
