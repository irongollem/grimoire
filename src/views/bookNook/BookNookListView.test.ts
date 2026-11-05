// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const m = vi.hoisted(() => ({ nooks: undefined as unknown, loading: false }));
vi.mock("@/composables/bookNook/useBookNooks", async () => {
  const { ref } = await import("vue");
  return { useBookNooks: () => ({ data: ref(m.nooks), isLoading: ref(m.loading) }) };
});
vi.mock("@/composables/locations/useLocations", async () => {
  const { ref } = await import("vue");
  return { useAllLocations: () => ({ data: ref([{ id: "p1", name: "The Stag", book_nook_id: "n1" }]) }) };
});
vi.mock("@/composables/useGridColumns", () => ({ useBreakpointColumns: () => ref(2) }));

import BookNookListView from "./BookNookListView.vue";

const stubs = {
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  ListActionButton: { props: ["label"], template: "<button data-testid='new' @click=\"$emit('click')\">{{ label }}</button>" },
  ListSkeleton: { template: "<div data-testid='skeleton' />" },
  EmptyState: { template: "<div data-testid='empty'><slot name='action' /></div>" },
  EntityCollection: { props: ["items"], template: "<div data-testid='grid'><slot name='card' v-for='i in items' :item='i' /></div>" },
  BookNookCard: { props: ["nook", "placeName"], template: "<i data-testid='card'>{{ nook.id }}:{{ placeName }}</i>" },
  NewNookDialog: { name: "NewNookDialog", props: ["open"], template: "<div data-testid='dialog' :data-open='open' />" },
  AppButton: { template: "<button data-testid='first' @click=\"$emit('click')\" />" },
};

beforeEach(() => {
  m.nooks = undefined;
  m.loading = false;
});

describe("BookNookListView", () => {
  it("shows a skeleton while loading, not the empty state", () => {
    m.loading = true;
    const v = mount(BookNookListView, { global: { stubs } });
    expect(v.find("[data-testid=skeleton]").exists()).toBe(true);
    expect(v.find("[data-testid=empty]").exists()).toBe(false);
  });

  it("hands each card the name of the place that shows it", () => {
    m.nooks = [{ id: "n1" }, { id: "n2" }];
    const v = mount(BookNookListView, { global: { stubs } });
    expect(v.findAll("[data-testid=card]").map((c) => c.text())).toEqual(["n1:The Stag", "n2:"]);
  });

  it("opens the new-nook dialog from the header and from the empty state", async () => {
    m.nooks = [];
    const v = mount(BookNookListView, { global: { stubs } });
    expect(v.find("[data-testid=dialog]").attributes("data-open")).toBe("false");
    await v.find("[data-testid=new]").trigger("click");
    expect(v.find("[data-testid=dialog]").attributes("data-open")).toBe("true");
    await v.findComponent({ name: "NewNookDialog" }).vm.$emit("close");
    expect(v.find("[data-testid=dialog]").attributes("data-open")).toBe("false");
    await v.find("[data-testid=first]").trigger("click");
    expect(v.find("[data-testid=dialog]").attributes("data-open")).toBe("true");
  });
});
