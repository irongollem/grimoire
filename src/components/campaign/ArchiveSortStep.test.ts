import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ArchiveSortStep from "./ArchiveSortStep.vue";
import type { ArchivePage, ArchivePageKind, ArchiveReadResult } from "@/lib/archiveImport/types";

function page(i: number, folder: string, kind: ArchivePageKind = "note"): ArchivePage {
  return {
    ref: `${folder}/p${i}.md`,
    path: `${folder}/p${i}.md`,
    title: `Page ${i}`,
    folders: [folder],
    parentRef: null,
    kind,
    kindReason: `folder: ${folder}`,
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

function result(pages: ArchivePage[], skipped = 0): ArchiveReadResult {
  return {
    source: "obsidian",
    sourceEvidence: ["a .obsidian folder"],
    pages,
    skipped: Array.from({ length: skipped }, (_, i) => ({ path: `img${i}.png`, reason: "image attachment" })),
  };
}

function mountStep(r: ArchiveReadResult, kinds = new Map<string, ArchivePageKind>()) {
  const wrapper = mount(ArchiveSortStep, {
    props: {
      result: r,
      kinds,
      displayName: "My vault",
      rightsAttested: true,
      "onUpdate:kinds": (next: Map<string, ArchivePageKind>) => wrapper.setProps({ kinds: next }),
      "onUpdate:displayName": (v: string) => wrapper.setProps({ displayName: v }),
      "onUpdate:rightsAttested": (v: boolean) => wrapper.setProps({ rightsAttested: v }),
    },
  });
  return wrapper;
}

describe("ArchiveSortStep", () => {
  it("names the app it detected, the evidence, and the count per kind", () => {
    const wrapper = mountStep(result([page(1, "NPCs", "npc"), page(2, "NPCs", "npc"), page(3, "Lore", "note")]));
    expect(wrapper.text()).toContain("3 pages found");
    expect(wrapper.text()).toContain("Obsidian");
    expect(wrapper.text()).toContain("a .obsidian folder");
    expect(wrapper.text()).toContain("2 NPCs");
    expect(wrapper.text()).toContain("1 Notes");
  });

  it("stays usable at two thousand pages: big folders start closed and no two thousand selects are drawn", () => {
    const pages = Array.from({ length: 2000 }, (_, i) => page(i, i < 1500 ? "Big" : `Small ${Math.floor(i / 10)}`));
    const wrapper = mountStep(result(pages));
    // One bulk select per group plus the rows of the small groups that fit the budget.
    expect(wrapper.findAll("select").length).toBeLessThan(250);
    expect(wrapper.text()).toContain("2000 pages found");
  });

  it("opens a closed group on demand, a hundred rows at a time", async () => {
    const pages = Array.from({ length: 250 }, (_, i) => page(i, "Big"));
    const wrapper = mountStep(result(pages));
    const rowSelects = () => wrapper.findAll("select").filter((s) => s.attributes("aria-label")?.startsWith("What "));
    expect(rowSelects()).toHaveLength(0);
    await wrapper.find("button[aria-expanded]").trigger("click");
    expect(rowSelects()).toHaveLength(100);
    const more = wrapper.findAll("button").find((b) => b.text().startsWith("Show 100 more"));
    await more?.trigger("click");
    expect(rowSelects()).toHaveLength(200);
  });

  it("sets every page of a folder with one bulk choice", async () => {
    const wrapper = mountStep(result([page(1, "NPCs", "note"), page(2, "NPCs", "note")]));
    const bulk = wrapper.find("select[aria-label^='Set every page']");
    await bulk.setValue("npc");
    const kinds = wrapper.props("kinds") as Map<string, ArchivePageKind>;
    expect([...kinds.values()]).toEqual(["npc", "npc"]);
    expect(wrapper.text()).toContain("2 NPCs");
  });

  it("lists the files it did not read, with the reason, behind a toggle", async () => {
    const wrapper = mountStep(result([page(1, "A")], 3));
    expect(wrapper.text()).not.toContain("img0.png");
    await wrapper.findAll("button").find((b) => b.text().includes("3 files not read"))?.trigger("click");
    expect(wrapper.text()).toContain("img0.png");
    expect(wrapper.text()).toContain("image attachment");
  });

  it("counts skipped pages out of what will be imported, and blocks Continue until the rights box is ticked", async () => {
    const kinds = new Map<string, ArchivePageKind>([["A/p1.md", "skip"]]);
    const wrapper = mountStep(result([page(1, "A"), page(2, "A")]), kinds);
    const continueBtn = () => wrapper.findAll("button").find((b) => b.text().startsWith("Continue"))!;
    expect(continueBtn().text()).toBe("Continue with 1 page");
    expect(continueBtn().attributes("disabled")).toBeUndefined();
    await wrapper.setProps({ rightsAttested: false });
    expect(continueBtn().attributes("disabled")).toBeDefined();
  });

  it("disables Continue when every page is skipped", () => {
    const kinds = new Map<string, ArchivePageKind>([["A/p1.md", "skip"]]);
    const wrapper = mountStep(result([page(1, "A")]), kinds);
    const btn = wrapper.findAll("button").find((b) => b.text().startsWith("Continue"))!;
    expect(btn.attributes("disabled")).toBeDefined();
  });
});
