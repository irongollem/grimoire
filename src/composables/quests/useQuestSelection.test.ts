// @vitest-environment happy-dom
import { effectScope, nextTick, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuestSelection } from "./useQuestSelection";

const mocks = vi.hoisted(() => ({ route: { query: {} as Record<string, string> }, replace: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace }),
}));

const route = reactive(mocks.route);
const party = ref<Record<string, string>>({});
let scope: ReturnType<typeof effectScope>;

function start() {
  scope = effectScope();
  return scope.run(() => useQuestSelection({
    partyBeatFor: (thread) => party.value[thread ?? "main"] ?? null,
    partyBeatSource: () => party.value,
  }))!;
}

const esc = (target: EventTarget = document) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

beforeEach(() => {
  route.query = {};
  mocks.replace.mockReset();
  party.value = {};
});
afterEach(() => scope?.stop());

describe("useQuestSelection", () => {
  it("reads the selection off the URL, and a route only when no beat is named", () => {
    route.query = { beat: "b1", edge: "e1", open: "1" };
    const selection = start();
    expect(selection.selectedBeatId.value).toBe("b1");
    expect(selection.selectedEdgeId.value).toBeNull();
    expect(selection.drawerOpened.value).toBe(true);
  });

  it("is never opened on nothing: open=1 without a beat is a closed drawer", () => {
    route.query = { open: "1" };
    expect(start().drawerOpened.value).toBe(false);
  });

  it("keeps keys it does not own and drops the retired view key when selecting", () => {
    route.query = { view: "work", thread: "t1", beat: "old" };
    start().select({ beat: "b2" });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { thread: "t1", beat: "b2" } });
  });

  it("collapses an opened drawer on the first Esc and deselects on the second", () => {
    route.query = { beat: "b1", open: "1" };
    start();
    esc();
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { beat: "b1" } });
    route.query = { beat: "b1" };
    esc();
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: {} });
  });

  it("ignores Esc while a text field has focus, so it cannot throw away what is being typed", () => {
    route.query = { beat: "b1" };
    start();
    const input = document.createElement("input");
    document.body.appendChild(input);
    esc(input);
    input.remove();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not bind Esc when nothing is selected, leaving it to whatever else wants it", () => {
    start();
    esc();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("resolves open=party to the party's beat once the runtime answers", async () => {
    route.query = { open: "party", thread: "main" };
    start();
    expect(mocks.replace).not.toHaveBeenCalled();
    party.value = { main: "b9" };
    await nextTick();
    expect(mocks.replace).toHaveBeenCalledWith({ query: { thread: "main", beat: "b9", open: "1" } });
  });
});
