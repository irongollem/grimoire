import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { OpenBookRelease } from "@/types/openBook.types";
import OpenBookReleaseHistory from "./OpenBookReleaseHistory.vue";

const release = (id: string, number: number, pdf_url: string | null): OpenBookRelease =>
  ({ id, number, note: null, pdf_url, created_at: "2026-10-23T10:00:00Z" }) as OpenBookRelease;

const props = { liveId: "r2", busy: false, exportingId: null, phaseLabel: "", pdfError: "" };

function labels(w: ReturnType<typeof mount>): string[] {
  return w.findAll("button, a").map((b) => b.text().trim()).filter(Boolean);
}

describe("OpenBookReleaseHistory PDFs", () => {
  const releases = [release("r2", 2, "https://cdn/open-book-pdfs/u/c/r2.pdf"), release("r1", 1, null)];

  it("offers Export PDF where there is none, and a link plus Replace PDF where there is one", () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases } });
    expect(labels(w)).toEqual(expect.arrayContaining(["PDF", "Replace PDF", "Export PDF"]));
    const link = w.find('a[href="https://cdn/open-book-pdfs/u/c/r2.pdf"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes("target")).toBe("_blank");
  });

  it("asks for the export of the release whose button was pressed", async () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases } });
    const button = w.findAll("button").find((b) => b.text().includes("Export PDF"));
    await button?.trigger("click");
    expect(w.emitted("exportPdf")?.[0]).toEqual([releases[1]]);
  });

  it("shows progress on the release being made and holds the other buttons", () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases, exportingId: "r1", phaseLabel: "Printing…" } });
    expect(w.text()).toContain("Printing…");
    const replace = w.findAll("button").find((b) => b.text().includes("Replace PDF"));
    expect(replace?.attributes("disabled")).toBeDefined();
  });

  it("shows an export error inline", () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases, pdfError: "PDF export is not set up on this server yet." } });
    expect(w.find('[role="alert"]').text()).toBe("PDF export is not set up on this server yet.");
  });
});

describe("OpenBookReleaseHistory putting a release back", () => {
  const releases = [release("r2", 2, null), release("r1", 1, null)];

  it("marks the live release and offers Put back on every other", async () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases } });
    expect(w.text()).toContain("Live");
    const putBack = w.findAll("button").filter((b) => b.text() === "Put back");
    expect(putBack).toHaveLength(1);
    await putBack[0]!.trigger("click");
    expect(w.emitted("putBack")).toEqual([["r1"]]);
  });

  it("holds Put back while another change is in flight", () => {
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases, busy: true } });
    expect(w.findAll("button").find((b) => b.text() === "Put back")?.attributes("disabled")).toBeDefined();
  });

  it("says nothing is live when no release is, and says so when there are none", () => {
    const none = mount(OpenBookReleaseHistory, { props: { ...props, releases: [], liveId: null } });
    expect(none.text()).toContain("Nothing released yet.");
    const unlive = mount(OpenBookReleaseHistory, { props: { ...props, releases, liveId: null } });
    expect(unlive.text()).not.toContain("Live");
    expect(unlive.findAll("button").filter((b) => b.text() === "Put back")).toHaveLength(2);
  });

  it("shows a release's own note, or 'No note'", () => {
    const noted = { ...release("r3", 3, null), note: "Added the harbour" };
    const w = mount(OpenBookReleaseHistory, { props: { ...props, releases: [noted, release("r1", 1, null)], liveId: null } });
    expect(w.text()).toContain("Added the harbour");
    expect(w.text()).toContain("No note");
  });
});
