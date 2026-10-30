import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewHandoutPicker from "./NewHandoutPicker.vue";

const mocks = vi.hoisted(() => ({ startHandout: vi.fn(), push: vi.fn(), canCreate: { value: true } }));
vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/scriptorium/useStartScriptoriumDocument", () => ({
  useStartScriptoriumDocument: () => ({ startHandout: mocks.startHandout, isStarting: ref(false) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: mocks.canCreate }) }));

function mountPicker() {
  return mount(NewHandoutPicker, { attachTo: document.body, global: { stubs: { PaywallModal: { props: ["modelValue"], template: '<i data-testid="paywall" :data-open="modelValue" />' } } } });
}
const open = async (w: ReturnType<typeof mountPicker>) => {
  await w.findAll("button").find((b) => b.text().includes("New handout"))!.trigger("click");
  await flushPromises();
};
const paper = (name: string) => document.body.querySelector<HTMLButtonElement>(`[data-paper="${name}"]`)!;

describe("NewHandoutPicker", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mocks.startHandout.mockReset().mockResolvedValue("new-id");
    mocks.push.mockReset();
    mocks.canCreate.value = true;
  });

  it("asks what it is written on and offers the four papers", async () => {
    const w = mountPicker();
    await open(w);
    expect(document.body.textContent).toContain("What is it written on?");
    expect(["letter", "notice", "journal", "plain"].every((p) => paper(p))).toBe(true);
  });

  it("one click on a paper creates the handout on that paper and opens it", async () => {
    const w = mountPicker();
    await open(w);
    paper("notice").click();
    await flushPromises();
    expect(mocks.startHandout).toHaveBeenCalledWith("notice");
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/new-id");
  });

  it("shows the paywall instead of the papers when the quota is spent", async () => {
    mocks.canCreate.value = false;
    const w = mountPicker();
    await open(w);
    expect(document.body.textContent).not.toContain("What is it written on?");
    expect(document.body.querySelector('[data-testid="paywall"]')?.getAttribute("data-open")).toBe("true");
  });

  it("stays on the picker and says why when creating fails", async () => {
    mocks.startHandout.mockRejectedValue(new Error("Offline"));
    const w = mountPicker();
    await open(w);
    paper("letter").click();
    await flushPromises();
    expect(document.body.textContent).toContain("Offline");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
