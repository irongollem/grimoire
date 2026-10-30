import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumExportDialog from "./ScriptoriumExportDialog.vue";


const mocks = vi.hoisted(() => ({
  exportPdf: vi.fn(),
  buildBundle: vi.fn(),
  items: {
    npcs: [{ id: "n1", label: "Mara" }, { id: "n2", label: "Oren" }],
    scriptorium_documents: [{ id: "doc-1", label: "The Book" }],
  } as Record<string, { id: string; label: string }[]>,
}));

vi.mock("@/composables/scriptorium/useScriptoriumPdf", () => ({
  pdfExportProgressLabel: () => "Laying out chapter 6 of 15…",
}));

vi.mock("@/composables/campaign/useWorldBundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/campaign/useWorldBundle")>();
  const { computed } = await import("vue");
  return {
    ...actual,
    buildBundle: (...args: unknown[]) => mocks.buildBundle(...args),
    useEntityPickerItems: (key: { value: string | null }) => ({
      data: computed(() => (key.value ? (mocks.items[key.value] ?? []) : [])),
      isLoading: ref(false),
    }),
  };
});

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ publicName: "Jeff" }) }));

function openDialog(preselection: Record<string, string[]>, extra: Record<string, unknown> = {}) {
  return mount(ScriptoriumExportDialog, {
    props: {
      kind: "book",
      campaignId: "camp-1",
      documentTitle: "The Book",
      chapterCount: 15,
      pageCount: 542,
      preselection,
      run: mocks.exportPdf,
      ...extra,
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
}

async function click(label: string) {
  button(label)!.click();
  await flushPromises();
}

/** Walk categories then every pick step to the details step. */
async function toDetails() {
  const attach = [...document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]")][0]!;
  attach.click();
  await flushPromises();
  await click("Choose the data");
  await click("Continue");
  for (let i = 0; i < 10 && !document.body.textContent?.includes("Bundle Details"); i++) {
    const next = button("Continue to Details") ?? button("Next");
    next!.click();
    await flushPromises();
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  mocks.exportPdf.mockReset().mockResolvedValue(true);
  mocks.buildBundle.mockReset().mockResolvedValue({ name: "bundle" });
});

describe("ScriptoriumExportDialog", () => {
  it("says what will be exported: every chapter, in order, as one PDF with its page count", async () => {
    openDialog({});
    await flushPromises();
    expect(document.body.querySelector("[data-testid=export-summary]")!.textContent).toBe(
      "All 15 chapters, in order, as one PDF of 542 pages.",
    );
  });

  it("exports without the campaign data when the box is left alone", async () => {
    const wrapper = openDialog({ npcs: ["n1"] });
    await flushPromises();
    await click("Export");
    expect(mocks.exportPdf).toHaveBeenCalledWith();
    expect(mocks.buildBundle).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("offers no campaign data for a book that belongs to no campaign", async () => {
    openDialog({}, { campaignId: null });
    await flushPromises();
    expect(document.body.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
  });

  it("is a Print dialog for a handout", async () => {
    openDialog({}, { kind: "handout", chapterCount: 1, pageCount: 1 });
    await flushPromises();
    expect(button("Print")).toBeDefined();
    expect(document.body.textContent).toContain("This handout, as a PDF of 1 page.");
  });

  it("starts with the preselected categories ticked", async () => {
    openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    const attach = [...document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]")][0]!;
    attach.click();
    await flushPromises();
    await click("Choose the data");
    const checked = [...document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]")]
      .filter((c) => c.checked).length;
    expect(checked).toBe(2);
  });

  it("drops a preselected id the picker does not offer", async () => {
    openDialog({ npcs: ["n1", "shared-lib-npc"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    expect(document.body.textContent).toContain("Bundle Details");
    expect(button("Export PDF")!.disabled).toBe(false);
    await click("Export PDF");
    const selection = mocks.buildBundle.mock.calls[0]![0].selection as Map<string, string[]>;
    expect(selection.get("npcs")).toEqual(["n1"]);
  });

  it("disables Export PDF when nothing is selected", async () => {
    openDialog({ npcs: ["gone"] });
    await flushPromises();
    await toDetails();
    expect(button("Export PDF")!.disabled).toBe(true);
  });

  it("builds the bundle from the document's campaign and exports with it", async () => {
    openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    await click("Export PDF");
    expect(mocks.buildBundle).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp-1", name: "The Book", author: "Jeff" }),
    );
    expect(mocks.exportPdf).toHaveBeenCalledWith({ name: "bundle" });
  });
  it("closes once the PDF was made, and stays open when the export failed", async () => {
    mocks.exportPdf.mockResolvedValueOnce(false);
    const wrapper = openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    await click("Export PDF");
    expect(wrapper.emitted("close")).toBeUndefined();
    await click("Export PDF");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("says why the campaign data could not be gathered, and exports nothing", async () => {
    mocks.buildBundle.mockRejectedValueOnce(new Error("Campaign not found"));
    const wrapper = openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    await click("Export PDF");
    expect(document.body.textContent).toContain("Campaign not found");
    expect(mocks.exportPdf).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("will not export a bundle whose name is only spaces", async () => {
    openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    const name = document.body.querySelector<HTMLInputElement>("#pdf-bundle-name")!;
    name.value = "   ";
    name.dispatchEvent(new Event("input"));
    await flushPromises();
    expect(button("Export PDF")!.disabled).toBe(true);
  });
  it("trims the bundle name, and drops the earlier build failure when the retry works", async () => {
    mocks.buildBundle.mockRejectedValueOnce(new Error("Campaign not found"));
    openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
    await toDetails();
    const name = document.body.querySelector<HTMLInputElement>("#pdf-bundle-name")!;
    name.value = "  The Book, abridged  ";
    name.dispatchEvent(new Event("input"));
    await flushPromises();
    await click("Export PDF");
    expect(document.body.textContent).toContain("Campaign not found");
    await click("Export PDF");
    expect(document.body.textContent).not.toContain("Campaign not found");
    expect(mocks.buildBundle).toHaveBeenLastCalledWith(expect.objectContaining({ name: "The Book, abridged" }));
  });
});
