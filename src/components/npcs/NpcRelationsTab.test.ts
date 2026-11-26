import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { Connection } from "@/types/connections.types";
import NpcRelationsTab from "./NpcRelationsTab.vue";

const stub = { name: "ConnectionsSection", props: ["subject", "hide"], template: "<div />" };
const conn = (other_kind: Connection["other_kind"]) => ({ other_kind }) as Connection;

describe("NpcRelationsTab", () => {
  // Bug (#1279 item 13): the canon ties listed on the Relations tab and again in "In the canon".
  it("hides the canon ties from the Connections block and keeps every other", () => {
    const w = mount(NpcRelationsTab, { props: { npcId: "n1", npcName: "Maera" }, global: { stubs: { FamilyBlock: true, NpcFavorsSection: true, ConnectionsSection: stub } } });
    const hide = w.findComponent({ name: "ConnectionsSection" }).props("hide") as (c: Connection) => boolean;
    expect(hide(conn("canon"))).toBe(true);
    expect(hide(conn("npc"))).toBe(false);
    expect(hide(conn("location"))).toBe(false);
  });
});
