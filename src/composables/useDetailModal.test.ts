import { effectScope } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  route: { matched: [{}] as unknown[], query: {} as Record<string, unknown> },
  // A plain box, not a `ref`: `vi.hoisted` runs before imports, and each case
  // reads its computeds immediately, so nothing here needs to be reactive.
  narrow: { value: false },
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@vueuse/core", () => ({ useMediaQuery: () => mocks.narrow }));

import { useDetailModal } from "./useDetailModal";

/** The composable reads reactive sources, so each case runs inside a scope. */
function run<T>(fn: () => T): T {
  const scope = effectScope();
  const result = scope.run(fn)!;
  scope.stop();
  return result;
}

function at(options: { detail: boolean; editing?: boolean; narrow?: boolean }) {
  mocks.route.matched = options.detail ? [{}, {}] : [{}];
  mocks.route.query = options.editing ? { edit: "true" } : {};
  mocks.narrow.value = !!options.narrow;
  return run(() => useDetailModal("/npcs"));
}

beforeEach(() => {
  mocks.replace.mockReset();
});

describe("useDetailModal", () => {
  it("shows the list alone when no detail is open", () => {
    const { asModal, showList } = at({ detail: false });

    expect(asModal.value).toBe(false);
    expect(showList.value).toBe(true);
  });

  it("keeps the list rendered behind an open modal", () => {
    const { asModal, showList } = at({ detail: true });

    expect(asModal.value).toBe(true);
    // The whole point: the grid is never unmounted, so scroll position and the
    // revealed page of an infinite-scrolling list survive a look at one entity.
    expect(showList.value).toBe(true);
  });

  it("gives editing the whole screen and unmounts the list behind it", () => {
    const { asModal, showList } = at({ detail: true, editing: true });

    expect(asModal.value).toBe(false);
    expect(showList.value).toBe(false);
  });

  it("keeps the mobile full-screen takeover, modal or not", () => {
    const { asModal, showList } = at({ detail: true, narrow: true });

    expect(asModal.value).toBe(false);
    expect(showList.value).toBe(false);
  });

  it("closes by replacing, so Back still returns to wherever the user came from", () => {
    const { close } = at({ detail: true });
    close();

    expect(mocks.replace).toHaveBeenCalledWith("/npcs");
  });
});
