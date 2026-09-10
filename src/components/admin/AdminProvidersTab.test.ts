import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminProvidersTab from "./AdminProvidersTab.vue";
import type { ProviderConfig } from "@/composables/admin/useAdminProviders";

// Regression cover for #873's "Fast model" field: fast_text_model must flow
// through the same draft/save-payload/model-list-refresh path as text_model
// (see AdminProvidersTab.vue's watch that seeds draftProviders, and
// saveProvider, which sends the whole draft object).

const mocks = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

function providerRow(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: "openai",
    text_model: "gpt-5.6-luna",
    fast_text_model: null,
    image_model: null,
    image_quality: null,
    audio_model: null,
    embedding_model: null,
    text_multiplier: 1,
    image_multiplier: 1,
    audio_multiplier: 1,
    text_enabled: true,
    image_enabled: false,
    audio_enabled: false,
    embedding_enabled: false,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

vi.mock("@/composables/admin/useAdminKeys", () => ({
  PROVIDERS: [
    { id: "openai", label: "OpenAI", hint: "sk-…" },
    { id: "anthropic", label: "Anthropic", hint: "sk-ant-…" },
    { id: "gemini", label: "Google Gemini", hint: "AIza…" },
  ],
  useAdminKeys: () => ({
    keysQuery: { data: ref([{ provider: "openai", updated_at: "2026-09-01T00:00:00Z" }]) },
  }),
}));

vi.mock("@/composables/admin/useAdminProviders", () => ({
  PROVIDER_LABELS: { openai: "OpenAI", anthropic: "Anthropic", gemini: "Google Gemini" },
  useAdminProviders: () => ({
    query: { isPending: ref(false), isError: ref(false), data: ref([providerRow()]) },
    update: { mutateAsync: mocks.update },
  }),
}));

vi.mock("@/composables/admin/useAdminModelPricing", () => ({
  useAdminModelPricing: () => ({
    query: { data: ref([]) },
    upsert: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/composables/ai/useProviderModels", () => ({
  useProviderModels: () => ({ data: ref([]) }),
}));

vi.mock("@/composables/ai/useAiUsageStats", () => ({
  useAiUsageStats: () => ({ modelTotals: ref(new Map()) }),
}));

vi.mock("@/components/admin/SimulacrumConfig.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/admin/GithubIntegrationConfig.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/admin/EmbeddingVendorControl.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/admin/PlatformKeyField.vue", () => ({ default: { template: "<div />" } }));

describe("AdminProvidersTab — fast model field", () => {
  beforeEach(() => {
    mocks.update.mockClear();
  });

  it("renders a labelled Fast model input next to the text model", () => {
    const wrapper = mount(AdminProvidersTab);
    expect(wrapper.text()).toContain("Fast model");
    expect(wrapper.text()).toContain("Used by the quest designer's back-and-forth turns. Leave empty to use the text model.");
    expect(wrapper.find('input[placeholder="Falls back to the text model"]').exists()).toBe(true);
  });

  it("includes the edited fast_text_model in the save payload", async () => {
    const wrapper = mount(AdminProvidersTab);
    const fastInput = wrapper.find('input[placeholder="Falls back to the text model"]');
    await fastInput.setValue("gpt-5.6-luna-mini");
    await fastInput.trigger("change");

    await wrapper.find('button[aria-label="Save config"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mock.calls[0]![0] as Partial<ProviderConfig>;
    expect(payload.fast_text_model).toBe("gpt-5.6-luna-mini");
    expect(payload.text_model).toBe("gpt-5.6-luna");
  });

  it("saves a cleared Fast model as null, so the edge function falls back to the text model", async () => {
    const wrapper = mount(AdminProvidersTab);
    const fastInput = wrapper.find('input[placeholder="Falls back to the text model"]');
    await fastInput.setValue("   ");
    await fastInput.trigger("change");

    await wrapper.find('button[aria-label="Save config"]').trigger("click");
    await wrapper.vm.$nextTick();

    const payload = mocks.update.mock.calls[0]![0] as Partial<ProviderConfig>;
    expect(payload.fast_text_model).toBeNull();
  });
});
