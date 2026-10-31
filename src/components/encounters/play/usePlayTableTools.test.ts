import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { MAX_POINTS } from "@/lib/tableChannel/messages";
import { DRAW_THROTTLE_MS, usePlayTableTools, type TableMarkSender } from "./usePlayTableTools";
import type { PlayTool } from "./playTypes";

function setup(initial: PlayTool, pinned = false) {
  const channel = {
    sendPing: vi.fn(),
    startMeasure: vi.fn(),
    updateMeasure: vi.fn(),
    endMeasure: vi.fn(),
    draw: vi.fn(),
  } satisfies TableMarkSender;
  const tool = ref<PlayTool>(initial);
  const scope = effectScope();
  const tools = scope.run(() => usePlayTableTools({ channel, tool, color: () => "#e11d48", pinned: ref(pinned) }));
  if (!tools) throw new Error("scope");
  return { channel, tool, tools, scope };
}
const at = (x: number, y: number) => ({ x, y });
/** Client pixels stand in for the pointer; a click is a press and release within a few pixels. */
const px = (x: number, y = 0) => ({ x, y });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 12));
});
afterEach(() => vi.useRealTimers());

describe("Ping", () => {
  it("pings the pressed point in image cells", () => {
    const { channel, tools } = setup("ping");
    tools.down(at(4.25, 7.5), px(10));
    expect(channel.sendPing).toHaveBeenCalledWith(4.25, 7.5);
  });
});

describe("Measure", () => {
  it("a drag measures from the middle of the first square to the middle of the square under the pointer, and ends on release", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.2, 1.9), px(10));
    expect(channel.startMeasure.mock.calls[0][1]).toEqual([[1.5, 1.5]]);
    tools.move(at(5.7, 1.2));
    expect(channel.updateMeasure.mock.calls.at(-1)?.[1]).toEqual([[1.5, 1.5], [5.5, 1.5]]);
    tools.up(at(5.7, 1.2), px(200));
    expect(channel.endMeasure).toHaveBeenCalledTimes(1);
  });

  it("does not resend the line while the pointer stays in the same square", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.2, 1.2), px(10));
    tools.move(at(3.1, 1.1));
    tools.move(at(3.4, 1.4));
    tools.move(at(3.9, 1.9));
    expect(channel.updateMeasure).toHaveBeenCalledTimes(1);
  });

  it("a click keeps the line, and the next click bends it at that square", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.5, 1.5), px(10));
    tools.up(at(1.5, 1.5), px(10));
    expect(channel.endMeasure).not.toHaveBeenCalled();
    tools.move(at(5.5, 1.5));
    tools.down(at(5.5, 1.5), px(90));
    tools.up(at(5.5, 1.5), px(90));
    tools.move(at(5.5, 4.5));
    expect(channel.updateMeasure.mock.calls.at(-1)?.[1]).toEqual([[1.5, 1.5], [5.5, 1.5], [5.5, 4.5]]);
  });

  it("clicking the square it already ends at lets the line go", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.5, 1.5), px(10));
    tools.up(at(1.5, 1.5), px(10));
    tools.move(at(4.5, 1.5));
    tools.down(at(4.5, 1.5), px(80));
    tools.up(at(4.5, 1.5), px(80));
    tools.down(at(4.5, 1.5), px(80));
    tools.up(at(4.5, 1.5), px(80));
    expect(channel.endMeasure).toHaveBeenCalledTimes(1);
  });

  it("Esc lets go of a kept line, and the pointer leaving does not", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.5, 1.5), px(10));
    tools.up(at(1.5, 1.5), px(10));
    tools.release();
    expect(channel.endMeasure).not.toHaveBeenCalled();
    tools.cancel();
    expect(channel.endMeasure).toHaveBeenCalledTimes(1);
  });

  it("a held line is re-sent while it waits, so players' copy does not expire", () => {
    const { channel, tools } = setup("measure");
    tools.down(at(1.5, 1.5), px(10));
    tools.up(at(1.5, 1.5), px(10));
    channel.updateMeasure.mockClear();
    vi.advanceTimersByTime(5000);
    expect(channel.updateMeasure).toHaveBeenCalledTimes(1);
  });
});

describe("Draw", () => {
  it("sends the stroke in the drawer's colour, pinned only when the pin is on", () => {
    const plain = setup("draw");
    plain.tools.down(at(1, 1), px(10));
    expect(plain.channel.draw.mock.calls[0][0]).toMatchObject({ color: "#e11d48", pinned: false });
    const pinned = setup("draw", true);
    pinned.tools.down(at(1, 1), px(10));
    expect(pinned.channel.draw.mock.calls[0][0]).toMatchObject({ pinned: true });
  });

  it("adds points as the pointer travels, at most ten sends a second, and sends the last point on release", () => {
    const { channel, tools } = setup("draw");
    tools.down(at(1, 1), px(10));
    for (let i = 1; i <= 5; i++) tools.move(at(1 + i * 0.5, 1));
    // The first send was the press; the burst after it waits out the throttle window.
    expect(channel.draw).toHaveBeenCalledTimes(1);
    tools.up(at(4, 1), px(40));
    expect(channel.draw).toHaveBeenCalledTimes(2);
    const last = channel.draw.mock.calls.at(-1)?.[0];
    expect(last.points.at(-1)).toEqual([4, 1]);
    expect(last.points.length).toBe(7);
  });

  it("sends the trailing part of a stroke once the throttle window is up", () => {
    const { channel, tools } = setup("draw");
    tools.down(at(1, 1), px(10));
    tools.move(at(2, 1));
    vi.advanceTimersByTime(DRAW_THROTTLE_MS);
    expect(channel.draw).toHaveBeenCalledTimes(2);
  });

  it("ignores a hand tremor under a tenth of a square", () => {
    const { channel, tools } = setup("draw");
    tools.down(at(1, 1), px(10));
    tools.move(at(1.05, 1.05));
    tools.up(at(1.05, 1.05), px(10));
    expect(channel.draw).toHaveBeenCalledTimes(1);
    expect(channel.draw.mock.calls[0][0].points).toHaveLength(1);
  });

  it("stops adding points at the most the channel accepts, or it would refuse the whole stroke", () => {
    const { channel, tools } = setup("draw");
    tools.down(at(0, 0), px(0));
    for (let i = 1; i < MAX_POINTS + 50; i++) tools.move(at(i, 0));
    tools.up(at(MAX_POINTS + 60, 0), px(0));
    expect(channel.draw.mock.calls.at(-1)?.[0].points).toHaveLength(MAX_POINTS);
  });
});

describe("ownership", () => {
  it("owns Measure, Ping and Draw and leaves every other tool to the map", () => {
    const { tool, tools } = setup("move");
    const owned = (t: PlayTool) => ((tool.value = t), tools.owns.value);
    expect(["measure", "ping", "draw"].map((t) => owned(t as PlayTool))).toEqual([true, true, true]);
    expect(["move", "area", "fog", "darkness"].map((t) => owned(t as PlayTool))).toEqual([false, false, false, false]);
  });
});
