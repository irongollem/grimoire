import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, onMounted, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestDrawer from "./QuestDrawer.vue";

vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useBelow: () => ref(false),
}));

const mounts = vi.hoisted(() => ({ column: 0 }));
const Column = defineComponent({ setup() { onMounted(() => { mounts.column += 1; }); return () => h("p", { "data-test": "column" }, "column"); } });

let wrapper: ReturnType<typeof mount> | undefined;
async function mountDrawer(mode: "quest" | "beat" | "route" = "beat", open = false) {
  setActivePinia(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/quests/:id", component: { template: "<div />" } }] });
  await router.push("/quests/q1");
  const host = ref(open);
  wrapper = mount(QuestDrawer, {
    props: { questId: "q1", mode, open: host.value, "onUpdate:open": (value: boolean) => { host.value = value; void wrapper?.setProps({ open: value }); } },
    slots: { column: () => h(Column), wide: () => h("p", { "data-test": "wide" }, "wide") },
    attachTo: document.body,
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}
const tab = (w: ReturnType<typeof mount>) => w.find('button[aria-expanded]');
/** Whether the key was taken (the registry prevents default on the binding it runs). */
const press = (target: EventTarget, key: string) => !target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
async function clickAt(target: Element) {
  target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // The outside-click listener ignores a second click within the same tick.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flushPromises();
}

beforeEach(() => { mounts.column = 0; });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });

describe("QuestDrawer", () => {
  // Fails if the tab stops being the way to open wide, or does not close again.
  it("the tab opens the wide part and folds it back", async () => {
    const w = await mountDrawer("beat");
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
    expect(tab(w).attributes("aria-label")).toBe("Open wide");
    await tab(w).trigger("click");
    expect(w.find('[data-test="wide"]').exists()).toBe(true);
    expect(tab(w).attributes("aria-label")).toBe("Fold back");
    await tab(w).trigger("click");
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
  });

  // Fails if the wide part is put before the column, or shown at rest (the column is the drawer's left-most part).
  it("holds the column first and the wide part after it, and only the column at rest", async () => {
    const w = await mountDrawer("beat");
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
    await tab(w).trigger("click");
    const column = w.get('[data-test="column"]').element;
    const wide = w.get('[data-test="wide"]').element;
    expect(column.compareDocumentPosition(wide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(w.get('[aria-label="Quest drawer"]').element.contains(wide)).toBe(true);
  });

  // Fails if a route can be opened wide: it has no wide part to show.
  it("a route has no tab and no wide part, even when asked open", async () => {
    const w = await mountDrawer("route", true);
    expect(tab(w).exists()).toBe(false);
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
    expect(w.find('[data-test="column"]').exists()).toBe(true);
  });

  // Fails if opening wide remounts the column (losing its state and scroll) instead of leaving it alone.
  it("the column is the same instance small and wide", async () => {
    const w = await mountDrawer("beat");
    await tab(w).trigger("click");
    await tab(w).trigger("click");
    expect(mounts.column).toBe(1);
  });

  // Fails if Escape folds a drawer that is not wide, or fires while typing.
  it("Escape folds only while wide, and not while typing in a field", async () => {
    const w = await mountDrawer("beat");
    // Not wide: the key is left for whoever else wants it (the selection's deselect).
    expect(press(document, "Escape")).toBe(false);
    await tab(w).trigger("click");
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(press(input, "Escape")).toBe(false);
    await flushPromises();
    expect(w.find('[data-test="wide"]').exists()).toBe(true);
    expect(press(document.body, "Escape")).toBe(true);
    await flushPromises();
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
  });

  // Fails if clicking elsewhere on the page leaves the wide part in the way, or a dialog's own click folds it.
  it("a press outside folds, but a press inside a dialog or a slip does not", async () => {
    const w = await mountDrawer("beat");
    await tab(w).trigger("click");
    for (const attrs of [{ role: "dialog" }, { "data-slip": "" }]) {
      const el = document.createElement("div");
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.body.appendChild(el);
      await clickAt(el);
      expect(w.find('[data-test="wide"]').exists()).toBe(true);
    }
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    await clickAt(outside);
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
  });

  // Fails if the strip of flow left beside the wide part does nothing.
  it("pressing the strip folds back", async () => {
    const w = await mountDrawer("beat", true);
    await w.get('[aria-label="Fold back to the flow"]').trigger("click");
    expect(w.find('[data-test="wide"]').exists()).toBe(false);
  });
});
