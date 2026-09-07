import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: {
    name: "quest-detail" as string,
    params: { id: "quest-1" } as Record<string, string>,
    query: {} as Record<string, string>,
  },
  // A plain box, not a `ref`: each case reads the computeds immediately after
  // building them, so nothing here needs to be reactive across a mutation.
  dmMode: "prep" as "prep" | "play",
  questFullScreenId: null as string | null,
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({
    get dmMode() { return mocks.dmMode; },
    get questFullScreenId() { return mocks.questFullScreenId; },
  }),
}));

import { useQuestDetailSurface } from "./useQuestDetailSurface";

/** The composable reads reactive sources, so each case runs inside a scope. */
function run<T>(fn: () => T): T {
  const scope = effectScope();
  const result = scope.run(fn)!;
  scope.stop();
  return result;
}

function at(options: {
  name?: string;
  query?: Record<string, string>;
  running?: boolean;
  id?: string;
  fullScreenId?: string | null;
}) {
  mocks.route.name = options.name ?? "quest-detail";
  mocks.route.params = { id: options.id ?? "quest-1" };
  mocks.route.query = options.query ?? {};
  mocks.dmMode = options.running ? "play" : "prep";
  mocks.questFullScreenId = options.fullScreenId ?? null;
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

  // The flag `QuestDetailView.selectView` sets on an in-quest surface switch —
  // covers the overview reached that way, not just `?view=work` above.
  it("takes the whole screen on the overview when the store flag names this quest", () => {
    const { view, takesWholeScreen } = at({ fullScreenId: "quest-1" });

    expect(view.value).toBe("overview");
    expect(takesWholeScreen.value).toBe(true);
  });

  it("ignores the flag when it names a different quest", () => {
    const { view, takesWholeScreen } = at({ id: "quest-2", fullScreenId: "quest-1" });

    expect(view.value).toBe("overview");
    expect(takesWholeScreen.value).toBe(false);
  });
});
