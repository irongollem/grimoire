import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumExportDialog from "./ScriptoriumExportDialog.vue";
import type { PdfDocumentOptions } from "@/composables/scriptorium/useScriptoriumPdf";

const mocks = vi.hoisted(() => ({
  exportPdf: vi.fn(),
  buildBundle: vi.fn(),
  items: {
    npcs: [{ id: "n1", label: "Mara" }, { id: "n2", label: "Oren" }],
    scriptorium_documents: [{ id: "doc-1", label: "The Book" }],
  } as Record<string, { id: string; label: string }[]>,
}));

vi.mock("@/composables/scriptorium/useScriptoriumPdf", async () => {
  const { ref } = await import("vue");
  const isExporting = ref(false);
  const exportError = ref<string | null>(null);
  return {
    useScriptoriumPdf: () => ({ isExporting, exportError, exportPdf: mocks.exportPdf }),
  };
});

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

const pdfOptions: PdfDocumentOptions = {
  bodyHtml: "<p>hi</p>",
  title: "The Book",
  theme: "phb2014",
  pageSize: "Letter",
  inkFriendly: false,
  isTwoColumn: false,
  showPageNumbers: true,
  footerText: "",
  pageNumberStart: 1,
  furniture: [],
};

function openDialog(preselection: Record<string, string[]>) {
  return mount(ScriptoriumExportDialog, {
    props: { campaignId: "camp-1", documentTitle: "The Book", preselection, pdfOptions },
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
  it("starts with the preselected categories ticked", async () => {
    openDialog({ npcs: ["n1"], scriptorium_documents: ["doc-1"] });
    await flushPromises();
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
    expect(mocks.exportPdf).toHaveBeenCalledWith({ ...pdfOptions, bundle: { name: "bundle" } });
  });
});
