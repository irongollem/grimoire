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

  it("opens wide on the quest itself: open=1 with nothing selected", () => {
    route.query = { open: "1" };
    expect(start().drawerOpened.value).toBe(true);
  });

  it("a route has no wide part: open=1 with an edge selected is a closed drawer", () => {
    route.query = { edge: "e1", open: "1" };
    expect(start().drawerOpened.value).toBe(false);
  });

  it("opening wide with nothing selected asks for the quest's wide part, and a route ignores it", () => {
    const selection = start();
    selection.setOpened(true);
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { open: "1" } });
    mocks.replace.mockClear();
    route.query = { edge: "e1" };
    selection.setOpened(true);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the wide part when another beat is picked from the flow, and drops it for a route", () => {
    const selection = start();
    selection.select({ beat: "b2", open: true });
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { beat: "b2", open: "1" } });
    selection.select({ edge: "e1", open: true });
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { edge: "e1" } });
  });

  it("keeps keys it does not own and drops the retired view key when selecting", () => {
    route.query = { view: "work", thread: "t1", beat: "old" };
    start().select({ beat: "b2" });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { thread: "t1", beat: "b2" } });
  });

  it("deselects on Esc, but leaves a wide drawer to fold itself first", () => {
    route.query = { beat: "b1", open: "1" };
    start();
    esc();
    expect(mocks.replace).not.toHaveBeenCalled();
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
