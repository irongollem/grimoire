import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";

const generate = vi.fn();
const confirm = vi.fn();

vi.mock("@/ai/useChroniclerTextGeneration", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useChroniclerTextGeneration: () => ({ isGenerating: ref(false), error: ref(null), generate }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({
    mentionItems: ref([]), partyMembers: ref([]), npcs: ref([]), monsters: ref([]),
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ textMultiplierFor: () => 1 }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: { text_provider: "openai" }, decryptedApiKey: null }),
}));

import ChroniclerWriteDialog from "./ChroniclerWriteDialog.vue";

const passthrough = { template: "<div><slot /></div>" };
const AppModalStub = {
  props: ["open", "backdropDismiss"],
  template: '<div v-if="open"><slot /></div>',
};
const stubs = {
  AppModal: AppModalStub,
  ModalHeader: passthrough,
  GenerationCostBadge: true,
  SegmentedControl: true,
  RichTextViewer: true,
  MentionTextarea: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
};

function click(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll("button").find((b) => b.text().includes(label));
  if (!button) throw new Error(`no button labelled "${label}" — have: ${wrapper.findAll("button").map((b) => b.text()).join(" | ")}`);
  return button.trigger("click");
}

async function writeChronicle(wrapper: VueWrapper, facts = "The party fought the duke.") {
  await wrapper.find("textarea").setValue(facts);
  await click(wrapper, "Write Chronicle");
  await vi.waitFor(() => expect(wrapper.text()).toContain("Preview"));
}

beforeEach(() => {
  generate.mockReset();
  confirm.mockReset();
  generate.mockResolvedValue({
    chronicle: "# Session 4: The Duke's Blood\n\nThe party arrived at dusk.",
    ai_provenance: { generatorType: "chronicle_text", provider: "openai", model: "gpt-5", generatedAt: "2026-09-05T00:00:00Z", edited: false },
  });
});

describe("ChroniclerWriteDialog", () => {
  it("lifts the title and session number out of the body into their own fields", async () => {
    const wrapper = mount(ChroniclerWriteDialog, { props: { visible: true }, global: { stubs } });
    await writeChronicle(wrapper);

    const [title, session] = wrapper.findAll("input");
    expect((title.element as HTMLInputElement).value).toBe("The Duke's Blood");
    expect((session.element as HTMLInputElement).value).toBe("4");

    await click(wrapper, "Insert into Note");
    expect(wrapper.emitted("insert")?.[0]?.[0]).toEqual({
      markdown: "The party arrived at dusk.",
      title: "The Duke's Blood",
      sessionNum: 4,
      aiProvenance: expect.objectContaining({ model: "gpt-5" }),
    });
  });

  it("keeps a title the DM already wrote, and offers the model's as a suggestion", async () => {
    const wrapper = mount(ChroniclerWriteDialog, {
      props: { visible: true, noteTitle: "Blood in Waterdeep" },
      global: { stubs },
    });
    await writeChronicle(wrapper);

    expect((wrapper.findAll("input")[0].element as HTMLInputElement).value).toBe("Blood in Waterdeep");
    expect(wrapper.text()).toContain("Session 4: The Duke's Blood");

    await click(wrapper, "Use");
    expect((wrapper.findAll("input")[0].element as HTMLInputElement).value).toBe("The Duke's Blood");
  });

  it("keeps the draft when the DM steps back to the facts, so returning costs no second generation", async () => {
    const wrapper = mount(ChroniclerWriteDialog, { props: { visible: true }, global: { stubs } });
    await writeChronicle(wrapper);

    await click(wrapper, "Edit facts");
    expect(wrapper.find("textarea").exists()).toBe(true);
    // The facts they typed are still there, and so is the draft.
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("The party fought the duke.");

    await click(wrapper, "Back to draft");
    expect(wrapper.text()).toContain("Preview");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a generated chronicle, and stays open when refused", async () => {
    const wrapper = mount(ChroniclerWriteDialog, { props: { visible: true }, global: { stubs } });
    await writeChronicle(wrapper);

    confirm.mockResolvedValue(false);
    await click(wrapper, "Cancel");
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(wrapper.emitted("close")).toBeUndefined();

    confirm.mockResolvedValue(true);
    await click(wrapper, "Cancel");
    await vi.waitFor(() => expect(wrapper.emitted("close")).toHaveLength(1));
  });

  it("closes without a prompt when nothing has been generated yet", async () => {
    const wrapper = mount(ChroniclerWriteDialog, { props: { visible: true }, global: { stubs } });
    await click(wrapper, "Cancel");
    expect(confirm).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("never dismisses on a backdrop click", () => {
    const wrapper = mount(ChroniclerWriteDialog, { props: { visible: true }, global: { stubs } });
    expect(wrapper.findComponent(AppModalStub).props("backdropDismiss")).toBe(false);
  });
});
