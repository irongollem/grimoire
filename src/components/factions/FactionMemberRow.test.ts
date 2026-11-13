import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import FactionMemberRow from "./FactionMemberRow.vue";
import { IconShield } from "@/lib/icons";
import { useLowArt } from "@/composables/useLowArt";

const mountRow = (portraitUrl: string | null) =>
  mount(FactionMemberRow, {
    props: { portraitUrl, fallbackIcon: IconShield, role: "Member", status: "Active", readonlyRole: true },
    global: { stubs: { AiImageBadge: true } },
  });

describe("FactionMemberRow", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("shows the member's portrait with low art off", () => {
    expect(mountRow("https://cdn.test/m.webp").find("img").exists()).toBe(true);
  });

  // Bug: a faction's member list still downloads every member's portrait in low art.
  it("draws no avatar box at all in low art, with or without a portrait", () => {
    useLowArt().setLowArt(true);
    expect(mountRow("https://cdn.test/m.webp").find("img").exists()).toBe(false);
    expect(mountRow(null).find(".rounded-full").exists()).toBe(false);
  });
});
