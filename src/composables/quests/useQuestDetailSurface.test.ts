import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: {
    name: "quest-detail" as string,
    query: {} as Record<string, string>,
  },
  // A plain box, not a `ref`: each case reads the computeds immediately after
  // building them, so nothing here needs to be reactive across a mutation.
  dmMode: "prep" as "prep" | "play",
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({
    get dmMode() { return mocks.dmMode; },
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

function at(options: { name?: string; query?: Record<string, string>; running?: boolean }) {
  mocks.route.name = options.name ?? "quest-detail";
  mocks.route.query = options.query ?? {};
  mocks.dmMode = options.running ? "play" : "prep";
  return run(() => useQuestDetailSurface());
}

describe("useQuestDetailSurface", () => {
  it("defaults to the overview when nothing is running", () => {
    const { view, isRunning } = at({});

    expect(view.value).toBe("overview");
    expect(isRunning.value).toBe(false);
  });

  it("opens on the overview when ?view=overview is explicit", () => {
    const { view, isRunning } = at({ query: { view: "overview" } });

    expect(view.value).toBe("overview");
    expect(isRunning.value).toBe(false);
  });

  it("opens on story flow when ?view=work is explicit", () => {
    const { view, isRunning } = at({ query: { view: "work" } });

    expect(view.value).toBe("work");
    expect(isRunning.value).toBe(false);
  });

  // `?view=run` is what QuestChainRow, QuestRunOpenChains and the dashboard
  // widgets generate on every "open this chain" link — a tab choice, not a
  // broadcast switch. See #758.
  it("opens on the run cockpit when ?view=run is explicit, even without a live session", () => {
    const { view, isRunning } = at({ query: { view: "run" } });

    expect(view.value).toBe("run");
    expect(isRunning.value).toBe(true);
  });

  it("defaults to the run cockpit while a session is running", () => {
    const { view, isRunning } = at({ running: true });

    expect(isRunning.value).toBe(true);
    expect(view.value).toBe("run");
  });

  it("lets an explicit overview link win even while a session is running", () => {
    const { view, isRunning } = at({ running: true, query: { view: "overview" } });

    expect(isRunning.value).toBe(false);
    expect(view.value).toBe("overview");
  });

  it("never defaults a quest that has no row yet onto the run cockpit", () => {
    const { view, isRunning } = at({ name: "quest-new", running: true });

    expect(isRunning.value).toBe(false);
    expect(view.value).toBe("overview");
  });
});
