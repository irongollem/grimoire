import { describe, it, expect, afterEach } from "vitest";
import { computed, defineComponent, h, provide } from "vue";
import { mount } from "@vue/test-utils";
import EntityListRow from "./EntityListRow.vue";
import { LEDGER_TEMPLATE_KEY } from "@/components/common/list/ledger";
import { useLowArt } from "@/composables/useLowArt";

const Icon = defineComponent({ render: () => h("svg", { "data-fallback": "" }) });
const stubs = { RouterLink: { template: "<a><slot /></a>" }, FocalImage: { template: "<img data-focal />" } };

function mountRow(props: Record<string, unknown>, ledger: string | null) {
  const Host = defineComponent({
    setup() {
      provide(LEDGER_TEMPLATE_KEY, computed(() => ledger));
      return () =>
        h(EntityListRow, { to: "/x", title: "Owlbear", fallbackIcon: Icon, ...props }, { body: () => h("p", { "data-body": "" }, "two lines of description") });
    },
  });
  return mount(Host, { global: { stubs } });
}

describe("EntityListRow low art", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: the picture is a record's, and low art still draws it in the emblem.
  it("draws no picture in low art, only the fallback icon", () => {
    useLowArt().setLowArt(true);
    const w = mountRow({ imageUrl: "https://x/y.webp" }, null);
    expect(w.find("[data-focal]").exists()).toBe(false);
    expect(w.find("[data-fallback]").exists()).toBe(true);
  });

  it("draws the picture with low art off", () => {
    expect(mountRow({ imageUrl: "https://x/y.webp" }, null).find("[data-focal]").exists()).toBe(true);
  });

  it("fills a ledger line with its cells and a tab cell's text", () => {
    useLowArt().setLowArt(true);
    const w = mountRow({ cells: ["Beast", { tab: { text: "3" } }, "Forest"] }, "1fr 8rem 3rem 2.5rem");
    expect(w.text()).toContain("Beast");
    expect(w.text()).toContain("Forest");
    expect(w.text()).toContain("3");
    expect(w.find("[data-fallback]").exists()).toBe(false);
  });

  // Bug: the ledger line shows outside low art, whatever the list injected.
  it("stays a card row with low art off even if a ledger is injected", () => {
    const w = mountRow({ cells: ["Beast"] }, "1fr 8rem");
    expect(w.text()).not.toContain("Beast");
  });

  // Bug: a body slot (a two-line description, a Standing mark) rendered beside the name and broke the 40px line.
  it("does not render the body slot in a ledger line", () => {
    useLowArt().setLowArt(true);
    const w = mountRow({ cells: ["Beast"] }, "1fr 8rem");
    expect(w.find("[data-body]").exists()).toBe(false);
  });
});
