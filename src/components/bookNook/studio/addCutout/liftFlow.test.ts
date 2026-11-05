import { describe, expect, it, vi } from "vitest";
import { FILL_FAILED } from "./costLabels";
import { runLift, type LiftDeps } from "./liftFlow";

const blob = (s: string) => new Blob([s]);
const crop = { x: 10, y: 20, w: 100, h: 80 };

function deps(over: Partial<LiftDeps> = {}): LiftDeps {
  return {
    crop: vi.fn(async () => blob("crop")),
    lift: vi.fn(async () => blob("lifted")),
    analyse: vi.fn(async () => ({ part: blob("part"), bounds: { x: 5, y: 6, w: 30, h: 40 }, mask: blob("mask") })),
    fill: vi.fn(async () => blob("filled")),
    composite: vi.fn(async () => blob("room")),
    upload: vi.fn(async (b: Blob) => `url:${await b.text()}`),
    ...over,
  };
}

describe("runLift", () => {
  it("stores the part and the room with the gap painted in", async () => {
    const d = deps();
    const r = await runLift(d, crop);
    expect(r).toMatchObject({ partUrl: "url:part", roomUrl: "url:room", notice: null, bounds: { x: 5, y: 6, w: 30, h: 40 } });
    expect(d.fill).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({}));
  });

  it("keeps the lifted part and says so plainly when the fill fails", async () => {
    // Bug: a failed fill throws away the part the DM already paid for, or reports success with a twin left in the picture.
    const r = await runLift(deps({ fill: vi.fn(async () => { throw new Error("model down"); }) }), crop);
    expect(r.partUrl).toBe("url:part");
    expect(r.roomUrl).toBeNull();
    expect(r.notice).toBe(FILL_FAILED);
  });

  it("a failed lift stores nothing and never calls the fill", async () => {
    const d = deps({ lift: vi.fn(async () => { throw new Error("no"); }) });
    await expect(runLift(d, crop)).rejects.toThrow("no");
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.fill).not.toHaveBeenCalled();
  });
});
