import { mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GeneratorPanelShell from "./GeneratorPanelShell.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";

const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
  }),
}));

function mountShell(props: Record<string, unknown> = {}) {
  return mount(GeneratorPanelShell, {
    props: {
      open: true,
      concept: "",
      title: "Thing Generator",
      conceptPlaceholder: "Describe it",
      credits: 1,
      byok: false,
      isGenerating: false,
      error: null,
      blankTo: "/things/new",
      blankLabel: "New Blank Thing",
      ...props,
    },
    global: { stubs: { RouterLink: RouterLinkStub, GenerationCostBadge: true } },
  });
}

const generateButton = (w: ReturnType<typeof mountShell>) =>
  w.findAll("button").find((b) => b.text().includes("Generate with AI"));

describe("GeneratorPanelShell", () => {
  beforeEach(() => {
    campaignState.isAiEnabled = true;
  });

  it("renders nothing when closed", () => {
    const w = mountShell({ open: false });
    expect(w.find("aside").exists()).toBe(false);
  });

  it("shows the title and the concept counter when open", () => {
    const w = mountShell({ concept: "abc" });
    expect(w.text()).toContain("Thing Generator");
    expect(w.text()).toContain("3 / 1000");
  });

  it("disables Generate until there is a concept, then emits generate", async () => {
    const w = mountShell();
    expect(generateButton(w)!.attributes("disabled")).toBeDefined();

    await w.setProps({ concept: "A thing" });
    const btn = generateButton(w)!;
    expect(btn.attributes("disabled")).toBeUndefined();
    await btn.trigger("click");
    expect(w.emitted("generate")).toHaveLength(1);
  });

  it("disables Generate when canGenerate is false", () => {
    const w = mountShell({ concept: "A thing", canGenerate: false });
    expect(generateButton(w)!.attributes("disabled")).toBeDefined();
  });

  it("shows AiOffNotice and no Generate button when AI is off", () => {
    campaignState.isAiEnabled = false;
    const w = mountShell({ concept: "A thing", imageToggleLabel: "Make art" });
    expect(w.findComponent(AiOffNotice).exists()).toBe(true);
    expect(generateButton(w)).toBeFalsy();
    expect(w.text()).not.toContain("Make art");
  });

  it("renders the image toggle only when a label is given and AI is on", () => {
    expect(mountShell().text()).not.toContain("Make art");
    expect(mountShell({ imageToggleLabel: "Make art" }).text()).toContain("Make art");
  });

  it("omits the CONSTRAINTS heading without a constraints slot", () => {
    expect(mountShell().text()).not.toContain("CONSTRAINTS");
    const w = mount(GeneratorPanelShell, {
      props: { open: true, concept: "", title: "T", conceptPlaceholder: "p", credits: 1, byok: false, isGenerating: false, error: null },
      global: { stubs: { GenerationCostBadge: true } },
      slots: { constraints: "<div>extra field</div>" },
    });
    expect(w.text()).toContain("CONSTRAINTS");
    expect(w.text()).toContain("extra field");
  });

  it("closes when the blank button is clicked", async () => {
    const w = mountShell();
    const blank = w.findComponent(RouterLinkStub);
    await blank.trigger("click");
    expect(w.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  describe("unsaved result", () => {
    const saveButton = (w: ReturnType<typeof mountShell>) =>
      w.findAll("button").find((b) => b.text().includes("Save again"));

    it("shows the notice, Save again label, and no cost badge", () => {
      const w = mountShell({ unsavedLabel: "feature" });
      expect(w.text()).toContain("The generated feature could not be saved");
      expect(saveButton(w)).toBeTruthy();
      expect(generateButton(w)).toBeFalsy();
      expect(w.findComponent({ name: "GenerationCostBadge" }).exists()).toBe(false);
    });

    it("is enabled with an empty concept and emits generate", async () => {
      const w = mountShell({ unsavedLabel: "feature", concept: "" });
      const btn = saveButton(w)!;
      expect(btn.attributes("disabled")).toBeUndefined();
      await btn.trigger("click");
      expect(w.emitted("generate")).toHaveLength(1);
    });

    it("emits discard", async () => {
      const w = mountShell({ unsavedLabel: "feature" });
      await w.findAll("button").find((b) => b.text() === "Discard")!.trigger("click");
      expect(w.emitted("discard")).toHaveLength(1);
    });

    it("shows no notice when there is nothing unsaved", () => {
      expect(mountShell().text()).not.toContain("could not be saved");
    });
  });
});
