import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: { name: "quest-detail" as string, query: {} as Record<string, string> },
  // A plain box, not a `ref`: each case reads the computeds immediately after
  // building them, so nothing here needs to be reactive across a mutation.
  dmMode: "prep" as "prep" | "play",
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ get dmMode() { return mocks.dmMode; } }),
}));

import { useQuestDetailSurface } from "./useQuestDetailSurface";

/** The composable reads reactive sources, so each case runs inside a scope. */
function run<T>(fn: () => T): T {
  const scope = effectScope();
  const result = scope.run(fn)!;
  scope.stop();
  return result;
}

function at(options: { name?: string; query?: Record<string, string>; running?: boolean }) {
  mocks.route.name = options.name ?? "quest-detail";
  mocks.route.query = options.query ?? {};
  mocks.dmMode = options.running ? "play" : "prep";
  return run(() => useQuestDetailSurface());
}

describe("useQuestDetailSurface", () => {
  it("defaults to the overview when nothing is running", () => {
    const { view, isRunning, takesWholeScreen } = at({});

    expect(view.value).toBe("overview");
    expect(isRunning.value).toBe(false);
    expect(takesWholeScreen.value).toBe(false);
  });

  it("opens on work when ?view=work is explicit", () => {
    const { view, takesWholeScreen } = at({ query: { view: "work" } });

    expect(view.value).toBe("work");
    expect(takesWholeScreen.value).toBe(true);
  });

  it("treats ?overview=true as the overview surface", () => {
    const { view } = at({ query: { overview: "true" } });

    expect(view.value).toBe("overview");
  });

  it("treats ?mode=details as the overview surface", () => {
    const { view } = at({ query: { mode: "details" } });

    expect(view.value).toBe("overview");
  });

  it("defaults to work while a session is running", () => {
    const { view, isRunning, takesWholeScreen } = at({ running: true });

    expect(isRunning.value).toBe(true);
    expect(view.value).toBe("work");
    expect(takesWholeScreen.value).toBe(true);
  });

  // `?mode=run` is what QuestChainRow and QuestRunOpenChains generate on every
  // "open this chain" link — a surface choice, not a broadcast switch. See #758.
  it("opens on work from a run link even without a live session", () => {
    const { view, isRunning } = at({ query: { mode: "run" } });

    expect(isRunning.value).toBe(true);
    expect(view.value).toBe("work");
  });

  it("never runs a quest that has no row yet, whatever the link asks for", () => {
    const { isRunning, view } = at({ name: "quest-new", running: true, query: { mode: "run" } });

    expect(isRunning.value).toBe(false);
    expect(view.value).toBe("overview");
  });

  it("lets an explicit overview bookmark win even while a session is running", () => {
    const { view, isRunning } = at({ running: true, query: { overview: "true" } });

    expect(isRunning.value).toBe(true);
    expect(view.value).toBe("overview");
  });
});
