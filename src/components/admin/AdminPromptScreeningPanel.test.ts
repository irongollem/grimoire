import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPromptScreeningPanel from "./AdminPromptScreeningPanel.vue";
import type {
  PromptScreeningCategoryHint,
  PromptScreeningHints,
  PromptScreeningRow,
  PromptScreeningTypeBreakdown,
} from "@/composables/admin/usePromptScreening";

const isPending = ref(false);
const isError = ref(false);
const data = ref<PromptScreeningHints | undefined>(undefined);

// Keep the real pure functions (diagnoseCategory, formatCategoryLabel,
// gaugePercent, PROMPT_SCREENING_WINDOWS) — only the network-backed query
// itself is faked, the same way AdminProvidersTab.test.ts mocks its composables
// at the module boundary.
vi.mock("@/composables/admin/usePromptScreening", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/admin/usePromptScreening")>();
  return {
    ...actual,
    usePromptScreening: () => ({ isPending, isError, data }),
  };
});

function breakdown(overrides: Partial<PromptScreeningTypeBreakdown> = {}): PromptScreeningTypeBreakdown {
  return { generation_type: "entity_image", screenings: 0, blocked: 0, refused_after_pass: 0, ...overrides };
}

function hints(overrides: Partial<PromptScreeningHints> = {}): PromptScreeningHints {
  const total = overrides.total ?? 0;
  const blocked = overrides.blocked ?? 0;
  const refused_after_pass = overrides.refused_after_pass ?? 0;
  return {
    since: "2026-08-16T00:00:00Z",
    total,
    blocked,
    refused_after_pass,
    rendered: 0,
    categories: [],
    rows: [],
    // By default mirrors total/blocked/refused_after_pass under one surface, so
    // existing tests that only set those three don't also have to fake a
    // breakdown — override `by_type` explicitly for composition/filter tests.
    by_type: total > 0 ? [breakdown({ screenings: total, blocked, refused_after_pass })] : [],
    ...overrides,
  };
}

function categoryHint(overrides: Partial<PromptScreeningCategoryHint> = {}): PromptScreeningCategoryHint {
  return {
    category: "sexual",
    threshold: 0.9,
    samples: 5,
    p50: 0.01,
    p95: 0.2,
    max_allowed: 0.3,
    blocked_here: 0,
    refused_after_pass: 0,
    ...overrides,
  };
}

function row(overrides: Partial<PromptScreeningRow> = {}): PromptScreeningRow {
  return {
    id: "r1",
    created_at: "2026-09-15T10:00:00Z",
    generation_type: "entity_image",
    image_provider: "openai",
    blocked: false,
    categories_over: [],
    provider_outcome: null,
    prompt: "a stern dwarven cleric in plate armor",
    scores: {},
    ...overrides,
  };
}

beforeEach(() => {
  isPending.value = false;
  isError.value = false;
  data.value = undefined;
});

describe("AdminPromptScreeningPanel", () => {
  it("shows a loading state", () => {
    isPending.value = true;
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Loading the screening log");
  });

  it("shows an error state", () => {
    isError.value = true;
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Failed to load the prompt screening log.");
  });

  it("shows a deliberate empty state on day one, not a bare zero", () => {
    data.value = hints();
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("No screenings recorded in the last 30 days.");
    expect(wrapper.text()).toContain("this fills in as soon as one runs");
  });

  it("surfaces refused_after_pass as the emphasized headline stat", () => {
    data.value = hints({ total: 10, refused_after_pass: 2, blocked: 1, rendered: 7 });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Refused after pass");
    const headline = wrapper.findAll("p").find((p) => p.text() === "2");
    expect(headline?.classes()).toContain("text-tone-danger");
  });

  it("does not emphasize the other stats even when non-zero", () => {
    data.value = hints({ total: 10, refused_after_pass: 0, blocked: 4, rendered: 6 });
    const wrapper = mount(AdminPromptScreeningPanel);
    const blockedTile = wrapper.findAll("p").find((p) => p.text() === "4");
    expect(blockedTile?.classes()).not.toContain("text-tone-danger");
  });

  it("flags too_high when the renderer disagreed, outranking apparent headroom", () => {
    data.value = hints({
      total: 5,
      categories: [categoryHint({ max_allowed: 0.1, refused_after_pass: 1 })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Too high");
  });

  it("flags headroom when nothing disagreed but the ceiling sits well under the threshold", () => {
    data.value = hints({
      total: 5,
      categories: [categoryHint({ threshold: 0.9, max_allowed: 0.1, refused_after_pass: 0 })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Headroom");
  });

  it("renders a null p50/p95/max_allowed as an explicit 'no data' marker, never as zero", () => {
    data.value = hints({
      total: 3,
      categories: [
        categoryHint({ p50: null, p95: null, max_allowed: null, samples: 3, blocked_here: 3 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("no data");
    expect(wrapper.text()).not.toContain("0.0000");
  });

  it("highlights a disagreement row — allowed by us, refused by the renderer", () => {
    data.value = hints({
      total: 1,
      rows: [row({ blocked: false, provider_outcome: "refused", prompt: "a scene the renderer balked at" })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Refused by renderer");
    expect(wrapper.text()).toContain("a scene the renderer balked at");
    expect(wrapper.find(".border-tone-danger\\/40").exists()).toBe(true);
  });

  it("labels a blocked row as blocked before render rather than as a renderer outcome", () => {
    data.value = hints({
      total: 1,
      rows: [row({ blocked: true, provider_outcome: null, categories_over: ["sexual/minors"] })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Blocked before render");
    expect(wrapper.text()).toContain("Sexual / minors");
  });
});

describe("AdminPromptScreeningPanel — composition and the surface filter", () => {
  it("renders the whole window's composition from by_type, tagging a bulk surface", () => {
    data.value = hints({
      total: 3,
      by_type: [breakdown({ generation_type: "tile_pack", screenings: 3 })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Tile Pack · bulk (3)");
  });

  it("does not tag an ordinary per-request surface as bulk", () => {
    data.value = hints({
      total: 3,
      by_type: [breakdown({ generation_type: "entity_image", screenings: 3 })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Entity Image (3)");
    expect(wrapper.text()).not.toContain("bulk");
  });

  it("warns when a bulk surface dominates the window, naming the skew it causes", () => {
    data.value = hints({
      total: 100,
      by_type: [
        breakdown({ generation_type: "tile_pack", screenings: 70 }),
        breakdown({ generation_type: "entity_image", screenings: 30 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Tile Pack is 70% of this window");
    expect(wrapper.text()).toContain("templated and near-duplicate");
  });

  it("gives a softer note when a non-bulk surface merely happens to dominate", () => {
    data.value = hints({
      total: 100,
      by_type: [
        breakdown({ generation_type: "entity_image", screenings: 80 }),
        breakdown({ generation_type: "npc_portrait", screenings: 20 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("Entity Image is 80% of this window");
    expect(wrapper.text()).not.toContain("templated and near-duplicate");
    expect(wrapper.text()).toContain("mostly reflect this one surface already");
  });

  it("does not warn when no single surface dominates", () => {
    data.value = hints({
      total: 100,
      by_type: [
        breakdown({ generation_type: "entity_image", screenings: 40 }),
        breakdown({ generation_type: "npc_portrait", screenings: 35 }),
        breakdown({ generation_type: "tile_pack", screenings: 25 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).not.toContain("of this window");
  });

  it("hides the dominance note once a surface filter is applied", async () => {
    data.value = hints({
      total: 70,
      by_type: [
        breakdown({ generation_type: "tile_pack", screenings: 70 }),
        breakdown({ generation_type: "entity_image", screenings: 30 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("is 70% of this window");

    await wrapper.find('select[aria-label="Filter by surface"]').setValue("tile_pack");

    expect(wrapper.text()).not.toContain("is 70% of this window");
  });

  it("filters by clicking a composition chip, showing Clear, and toggles off on a second click", async () => {
    data.value = hints({
      total: 30,
      by_type: [breakdown({ generation_type: "entity_image", screenings: 30 })],
    });
    const wrapper = mount(AdminPromptScreeningPanel);
    const chip = wrapper.findAll("button").find((b) => b.text().includes("Entity Image"));
    expect(chip).toBeTruthy();

    await chip!.trigger("click");
    expect(wrapper.text()).toContain("Clear");

    await chip!.trigger("click");
    expect(wrapper.find('button[aria-label="Clear"]').exists()).toBe(false);
  });

  it("shows a filtered-empty state (not the day-one empty state) once a filter matches nothing", async () => {
    // by_type (never narrowed by the filter) still shows tile_pack activity —
    // only `total`, which the filter DOES narrow, drops to zero once entity_image
    // is selected and has nothing in this window.
    data.value = hints({
      total: 30,
      by_type: [
        breakdown({ generation_type: "tile_pack", screenings: 30 }),
        breakdown({ generation_type: "entity_image", screenings: 0 }),
      ],
    });
    const wrapper = mount(AdminPromptScreeningPanel);

    await wrapper.find('select[aria-label="Filter by surface"]').setValue("entity_image");
    // The mocked query does not actually re-run against the new filter, so
    // simulate the server response that selecting it would produce: total
    // narrowed to zero, by_type (whole-window) unchanged.
    data.value = hints({
      total: 0,
      by_type: [
        breakdown({ generation_type: "tile_pack", screenings: 30 }),
        breakdown({ generation_type: "entity_image", screenings: 0 }),
      ],
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("this fills in as soon as one runs");
    expect(wrapper.text()).toContain("No Entity Image screenings in the last 30 days.");
    expect(wrapper.text()).toContain("Clear filter");
  });

  it("still treats a truly empty window (no data anywhere) as the day-one empty state", () => {
    data.value = hints({ total: 0, by_type: [] });
    const wrapper = mount(AdminPromptScreeningPanel);
    expect(wrapper.text()).toContain("No screenings recorded in the last 30 days.");
    expect(wrapper.text()).toContain("this fills in as soon as one runs");
  });
});
