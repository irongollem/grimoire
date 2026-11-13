import { describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import SpellGridCard from "./SpellGridCard.vue";
import type { SpellBrowseRow } from "@/types/spell.types";

// The card's source badge reads book titles through TanStack Query, which a card test has no client for.
vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) => (source ? (title ?? source) : null),
  }),
}));

const spell = {
  id: "s1",
  name: "Firebolt",
  school: "evocation",
  level: 0,
  image_url: "https://example.test/firebolt.webp",
  image_focal_point: null,
  components: ["V", "S"],
  tags: [],
} as unknown as SpellBrowseRow;

// AiImageBadge is stubbed: it reads provenance through TanStack Query, which a card test has no client for.
const global = { stubs: { RouterLink: RouterLinkStub, FocalImage: true, AiImageBadge: true } };

describe("SpellGridCard AI label", () => {
  it("takes the bottom-right corner when no overlay renders", () => {
    const badge = mount(SpellGridCard, { props: { spell }, global }).find("ai-image-badge-stub");
    expect(badge.attributes("corner")).toBe("right");
  });

  it("moves left when the Learn overlay holds the bottom-right corner", () => {
    const wrapper = mount(SpellGridCard, { props: { spell }, slots: { overlay: "<button>Learn</button>" }, global });
    expect(wrapper.find("ai-image-badge-stub").attributes("corner")).toBe("left");
  });
});
