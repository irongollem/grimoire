// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskWalkView } from "@/lib/ask/askWalkCopy";

const bringBack = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/composables/canon/useCanonWalkSkips", () => ({ useCanonWalkSkipActions: () => ({ bringBack }) }));

import AskWalkProgress from "./AskWalkProgress.vue";

const row = (step: string, state: "filled" | "skipped" | "todo", current = false) => ({ step, memberId: null, memberName: null, state, current }) as AskWalkView["progress"][number];
const progress = [row("pitch", "filled"), row("themes", "skipped"), row("voice", "todo", true)];

describe("AskWalkProgress", () => {
  it("says where the walk is while closed", () => {
    const w = mount(AskWalkProgress, { props: { progress } });
    expect(w.get("[data-testid=walk-progress-toggle]").text()).toContain("Voice · 2 of 3 done");
    expect(w.find("[data-testid=walk-progress-list]").exists()).toBe(false);
  });

  // Bug caught: a press on a stop doing nothing, or jumping to the wrong one.
  it("opens into the stops and asks the one pressed", async () => {
    const w = mount(AskWalkProgress, { props: { progress } });
    await w.get("[data-testid=walk-progress-toggle]").trigger("click");
    expect(w.get("[data-testid=walk-stop-themes]").text()).toContain("Skipped");
    expect(w.get("[data-testid=walk-stop-pitch]").text()).toContain("✓ Filled");
    await w.get("[data-testid=walk-stop-themes]").trigger("click");
    expect(w.emitted("jump")?.[0]?.[0]).toMatchObject({ step: "themes" });
  });

  // Bug caught (live run, 26 Nov 2026): the list left open over half the pane after a jump, hiding the question it had
  // just asked and the block the answer makes.
  it("closes the list when a stop is pressed", async () => {
    const w = mount(AskWalkProgress, { props: { progress } });
    await w.get("[data-testid=walk-progress-toggle]").trigger("click");
    await w.get("[data-testid=walk-stop-themes]").trigger("click");
    expect(w.find("[data-testid=walk-progress-list]").exists()).toBe(false);
  });

  // Bug caught: Bring back asking the question while the skip still stands (the section stays skipped), or not asking at all.
  it("brings a skipped section back, then asks it", async () => {
    bringBack.mutate.mockImplementation((_step: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const w = mount(AskWalkProgress, { props: { progress } });
    await w.get("[data-testid=walk-progress-toggle]").trigger("click");
    await w.get("[data-testid=walk-bring-back-themes]").trigger("click");
    expect(bringBack.mutate.mock.calls[0]?.[0]).toBe("themes");
    expect(w.emitted("jump")?.[0]?.[0]).toMatchObject({ step: "themes" });
    expect(w.find("[data-testid=walk-bring-back-voice]").exists()).toBe(false);
  });

  it("leaves the walk", async () => {
    const w = mount(AskWalkProgress, { props: { progress } });
    await w.get("[data-testid=walk-leave]").trigger("click");
    expect(w.emitted("leave")).toHaveLength(1);
  });
});
