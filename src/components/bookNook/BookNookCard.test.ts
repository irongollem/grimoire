// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const m = vi.hoisted(() => ({ confirm: vi.fn(), remove: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/bookNook/useBookNooks", () => ({ useDeleteBookNook: () => ({ mutateAsync: m.remove }) }));

import BookNookCard from "./BookNookCard.vue";
import type { BookNook } from "@/types/bookNook.types";

const Player = defineComponent({ name: "BookNookPlayer", render: () => h("div", { "data-testid": "player" }) });
const Menu = defineComponent({
  name: "OverflowMenu",
  emits: ["select"],
  render() {
    return h("button", { "data-testid": "menu", onClick: () => this.$emit("select", "delete") });
  },
});

const nook = { id: "n1", title: "The Gilded Stag", scene: {}, still_url: "https://cdn.example.invalid/s.webp" } as unknown as BookNook;

function mountCard(placeName: string | null = null) {
  return mount(BookNookCard, {
    props: { nook, placeName },
    global: { stubs: { BookNookPlayer: Player, OverflowMenu: Menu, RouterLink: { template: "<a><slot /></a>" } } },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("BookNookCard", () => {
  it("plays the nook only while the pointer or focus is on the card", async () => {
    const card = mountCard();
    expect(card.find("[data-testid=player]").exists()).toBe(false);
    expect(card.find("img").attributes("src")).toBe(nook.still_url);
    await card.trigger("pointerenter");
    expect(card.find("[data-testid=player]").exists()).toBe(true);
    await card.trigger("pointerleave");
    expect(card.find("[data-testid=player]").exists()).toBe(false);
    await card.trigger("focusin");
    expect(card.find("[data-testid=player]").exists()).toBe(true);
  });

  it("names the place that shows it, or says it is not shown", () => {
    expect(mountCard("The Stag").text()).toContain("Shown at The Stag");
    expect(mountCard(null).text()).toContain("Not shown at a place");
  });

  it("deletes only after the DM confirms", async () => {
    m.confirm.mockResolvedValueOnce(false);
    const card = mountCard();
    await card.find("[data-testid=menu]").trigger("click");
    await vi.waitFor(() => expect(m.confirm).toHaveBeenCalled());
    expect(m.remove).not.toHaveBeenCalled();

    m.confirm.mockResolvedValueOnce(true);
    await card.find("[data-testid=menu]").trigger("click");
    await vi.waitFor(() => expect(m.remove).toHaveBeenCalledWith("n1"));
  });
});
