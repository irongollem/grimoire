import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { DocumentImport } from "@/types/documentImport.types";

const mocks = vi.hoisted(() => ({ active: { value: null as unknown }, aiEnabled: true }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled; } }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, f: string) => f, info: vi.fn() }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(false) }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
vi.mock("@/composables/campaign/useDocumentImport", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
  return {
    useActiveDocumentImport: () => ({ data: computed(() => mocks.active.value), isPending: ref(false) }),
    useCreateDocumentImport: mutation,
    useStartExtraction: mutation,
    useRetryDocumentImport: mutation,
    useAbandonDocumentImport: mutation,
    useImportCost: () => ({ estimate: ref(null), isLoading: ref(false), isError: ref(false) }),
  };
});
vi.mock("@/components/campaign/DocumentImportWizard.vue", () => ({ default: { name: "DocumentImportWizard", template: "<div class='wizard' />" } }));
vi.mock("@/components/campaign/DocumentImportPasteStep.vue", () => ({ default: { name: "DocumentImportPasteStep", template: "<div class='paste' />" } }));
vi.mock("@/components/campaign/ArchiveImportPanel.vue", () => ({
  default: { name: "ArchiveImportPanel", props: ["importRow"], template: "<div class='archive' />" },
}));

import DocumentImportTab from "./DocumentImportTab.vue";

function row(over: Partial<DocumentImport>): DocumentImport {
  return {
    id: "r1",
    user_id: "u",
    campaign_id: "c",
    display_name: "Import",
    page_count: 3,
    status: "review",
    source_paths: [],
    rights_attested_at: "2026-10-07T00:00:00Z",
    error: null,
    expires_at: "2026-11-07T00:00:00Z",
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  } as DocumentImport;
}

describe("DocumentImportTab and a wiki export", () => {
  it("offers Wiki export as a third source", () => {
    mocks.active.value = null;
    const wrapper = mount(DocumentImportTab);
    expect(wrapper.text()).toContain("Wiki export");
    expect(wrapper.text()).toContain("Paste text");
  });

  it("offers only the wiki export, and says why, when the campaign has AI off", () => {
    mocks.active.value = null;
    mocks.aiEnabled = false;
    const wrapper = mount(DocumentImportTab);
    expect(wrapper.findComponent({ name: "ArchiveImportPanel" }).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Paste text");
    expect(wrapper.text()).toContain("uses AI, which is off for this campaign");
    mocks.aiEnabled = true;
  });

  it("never hands an archive row in review to the AI wizard: it goes to the archive panel", () => {
    mocks.active.value = row({
      source_kind: "archive",
      extracted: { archive: { version: 1, source: "obsidian", pages: [] } },
      imported_counts: {},
      ai_provenance: null,
    });
    const wrapper = mount(DocumentImportTab);
    expect(wrapper.findComponent({ name: "DocumentImportWizard" }).exists()).toBe(false);
    const panel = wrapper.findComponent({ name: "ArchiveImportPanel" });
    expect(panel.exists()).toBe(true);
    expect(panel.props("importRow")).toMatchObject({ id: "r1", source_kind: "archive" });
  });

  it("still hands an AI row in review to the wizard", () => {
    mocks.active.value = row({ source_kind: "text", extracted: {}, imported_counts: {}, ai_provenance: null });
    const wrapper = mount(DocumentImportTab);
    expect(wrapper.findComponent({ name: "DocumentImportWizard" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "ArchiveImportPanel" }).exists()).toBe(false);
  });
});
