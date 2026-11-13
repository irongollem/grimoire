import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import CodexCard from "./CodexCard.vue";
import { useLowArt } from "@/composables/useLowArt";

const mountCard = () => mount(CodexCard, {
    props: { imageUrl: "/elf.webp", title: "Elf", subtitle: "Fey folk" },
    global: { stubs: { AiImageBadge: true } },
  });

describe("CodexCard low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("drops the picture plate in low art so the title leads the card", () => {
    expect(mountCard().find("img").exists()).toBe(true);
    useLowArt().setLowArt(true);
    const w = mountCard();
    expect(w.find("img").exists()).toBe(false);
    expect(w.find(".aspect-3\\/4").exists()).toBe(false);
    expect(w.text()).toContain("Elf");
  });
});
