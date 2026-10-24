import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConnectionSlip from "./ConnectionSlip.vue";

const RouterLink = { props: ["to"], template: "<a :href='to'><slot /></a>" };
function mountSlip(props: Record<string, unknown>, slots: Record<string, string> = {}) {
  return mount(ConnectionSlip, { props: { name: "Maera", ...props }, slots, global: { stubs: { RouterLink } } });
}

describe("ConnectionSlip", () => {
  it("shows the portrait, or the initial without one", () => {
    expect(mountSlip({ image: "/p.webp" }).find("img").attributes("src")).toBe("/p.webp");
    const bare = mountSlip({});
    expect(bare.find("img").exists()).toBe(false);
    expect(bare.text()).toContain("M");
  });

  it("makes the name a button that emits open when it opens in place", async () => {
    const w = mountSlip({ opens: true, to: "/npcs/1" });
    await w.find("button").trigger("click");
    expect(w.emitted("open")).toHaveLength(1);
    expect(w.find("a").exists()).toBe(false);
  });

  it("makes the name a link with `to`, and plain text otherwise", () => {
    expect(mountSlip({ to: "/factions/1" }).find("a").attributes("href")).toBe("/factions/1");
    const plain = mountSlip({});
    expect(plain.find("a").exists()).toBe(false);
    expect(plain.find("button").exists()).toBe(false);
  });

  it("renders tags, coloured only when given a colour, with the tags slot beside them", () => {
    const w = mountSlip(
      { tags: [{ label: "Ally", color: "rgb(1, 2, 3)" }, { label: "faction" }] },
      { tags: "<em data-testid='role'>Captain</em>" },
    );
    const spans = w.findAll("span").filter((s) => ["Ally", "faction"].includes(s.text()));
    expect(spans[0]?.attributes("style")).toContain("color");
    expect(spans[1]?.classes()).toContain("text-muted-foreground");
    expect(w.find("[data-testid='role']").exists()).toBe(true);
  });

  it("renders meta, notes, footer and actions only when given", () => {
    const empty = mountSlip({});
    expect(empty.find("p").exists()).toBe(false);
    const w = mountSlip(
      { meta: "1431 · PC", notes: "Owes a favour" },
      { footer: "<i data-testid='f' />", actions: "<b data-testid='a' />", meta: "<u data-testid='m' />" },
    );
    expect(w.text()).toContain("1431 · PC");
    expect(w.find("p").text()).toBe("Owes a favour");
    for (const id of ["f", "a", "m"]) expect(w.find(`[data-testid='${id}']`).exists()).toBe(true);
  });

  it("rings a PC's thumbnail and strikes a dead name", () => {
    const w = mountSlip({ pc: true, dead: true });
    expect(w.find("span[aria-hidden='true']").classes()).toContain("border-primary");
    expect(w.find("span.line-through").exists()).toBe(true);
    expect(w.attributes("data-dead")).toBe("true");
  });
});
