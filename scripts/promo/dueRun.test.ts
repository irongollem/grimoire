import { describe, expect, it } from "vitest";
import { type DueRun, runDue } from "./dueRun";

const NOW = new Date("2026-11-11T22:05:00Z");

function run(overrides: Partial<DueRun>) {
  const calls: string[] = [];
  const r: DueRun = {
    now: NOW,
    schedule: [],
    posted: new Set(),
    dayMark: true,
    log: () => {},
    notify: (title) => calls.push(`notify:${title}`),
    writeSchedule: () => calls.push("writeSchedule"),
    networkUp: async () => {
      calls.push("networkUp");
    },
    post: async (id) => {
      calls.push(`post:${id}`);
      return { permalink: "https://instagram.com/p/x" };
    },
    snapshot: async () => {
      calls.push("snapshot");
    },
    ...overrides,
  };
  return { r, calls };
}

describe("runDue: the day-mark snapshot on every path out", () => {
  // Fails on: a run that only moves the queue back returning before the day mark, losing that post's 24h figure for good.
  it("snapshots when the run moved the queue back", async () => {
    const { r, calls } = run({ schedule: [{ id: "late", at: "2026-11-11T12:00:00Z" }] });
    await runDue(r);
    expect(calls).toEqual(["writeSchedule", "notify:Grimoire posts moved", "snapshot"]);
  });

  it("snapshots when nothing is due and a post is at its mark, and not otherwise", async () => {
    const marked = run({});
    await runDue(marked.r);
    expect(marked.calls).toEqual(["snapshot"]);
    const quiet = run({ dayMark: false });
    await runDue(quiet.r);
    expect(quiet.calls).toEqual([]);
  });

  // Fails on: a failed post rethrowing before last night's post's day-mark snapshot.
  it("still snapshots last night's post when tonight's post fails, then reports the failure", async () => {
    const { r, calls } = run({
      schedule: [{ id: "tonight", at: "2026-11-11T22:00:00Z" }],
      post: async () => {
        throw new Error("container error");
      },
    });
    await expect(runDue(r)).rejects.toThrow("container error");
    expect(calls).toEqual(["networkUp", "notify:Grimoire post NOT published", "snapshot"]);
  });

  it("posts, then snapshots, after the network is up", async () => {
    const { r, calls } = run({ schedule: [{ id: "tonight", at: "2026-11-11T22:00:00Z" }], dayMark: false });
    await runDue(r);
    expect(calls).toEqual(["networkUp", "post:tonight", "notify:Grimoire post published", "snapshot"]);
  });
});
