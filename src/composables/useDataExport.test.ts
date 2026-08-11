import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  click: vi.fn(),
  createObjectURL: vi.fn(() => "blob:fake"),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocked.invoke } },
}));

import { dataExportErrorMessage, exportFilename, useDataExport } from "./useDataExport";

const { invoke: invokeMock } = mocked;

/** Captures the anchor the download path builds, without a real object URL. */
function stubDownload() {
  const anchor = {
    href: "",
    download: "",
    style: {},
    click: mocked.click,
    remove: vi.fn(),
  } as unknown as HTMLAnchorElement;
  vi.spyOn(document, "createElement").mockReturnValue(anchor);
  vi.spyOn(document.body, "appendChild").mockReturnValue(anchor);
  Object.defineProperty(URL, "createObjectURL", { value: mocked.createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: mocked.revokeObjectURL, configurable: true });
  return anchor;
}

describe("dataExportErrorMessage", () => {
  it("maps known server codes to human copy", () => {
    expect(dataExportErrorMessage("rate_limited")).toMatch(/try again in an hour/i);
    expect(dataExportErrorMessage("export_failed")).toMatch(/could not be built/i);
  });

  it("passes an unrecognised code through verbatim", () => {
    expect(dataExportErrorMessage("some_new_code")).toBe("some_new_code");
  });
});

describe("exportFilename", () => {
  it("dates the file so a user can keep several", () => {
    expect(exportFilename(new Date("2026-08-11T13:45:00Z"))).toBe("grimoire-my-data-2026-08-11.json");
  });
});

describe("useDataExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    mocked.click.mockReset();
    mocked.createObjectURL.mockClear();
    mocked.revokeObjectURL.mockClear();
  });

  it("sends no body identifying the user — the edge function reads that from the JWT", async () => {
    stubDownload();
    invokeMock.mockResolvedValue({ data: { identity: {}, tables: {} }, error: null });

    await useDataExport().exportData();

    expect(invokeMock).toHaveBeenCalledWith("export-my-data", { body: {} });
  });

  it("downloads the returned document verbatim as pretty-printed JSON", async () => {
    const anchor = stubDownload();
    const payload = { identity: { user_id: "u1" }, tables: { notes: [{ id: "n1" }] } };
    invokeMock.mockResolvedValue({ data: payload, error: null });

    const result = await useDataExport().exportData();

    expect(result).toBe(true);
    expect(anchor.download).toBe(exportFilename(new Date()));
    expect(mocked.click).toHaveBeenCalledOnce();
    const [[blob]] = mocked.createObjectURL.mock.calls as unknown as [[Blob]];
    await expect(blob.text()).resolves.toBe(JSON.stringify(payload, null, 2));
  });

  // `a.click()` only queues the download; revoking in the same tick invalidates
  // the blob before the browser has read it, which for a multi-megabyte export
  // yields a zero-byte file while this code reports success.
  it("does not revoke the object URL in the same tick as the click", async () => {
    vi.useFakeTimers();
    try {
      stubDownload();
      invokeMock.mockResolvedValue({ data: { tables: {} }, error: null });

      await useDataExport().exportData();

      expect(mocked.click).toHaveBeenCalledOnce();
      expect(mocked.revokeObjectURL).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(mocked.revokeObjectURL).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps a functions-error JSON payload code to human copy and downloads nothing", async () => {
    stubDownload();
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "rate_limited" }) },
      },
    });

    const { error, exportData } = useDataExport();
    const result = await exportData();

    expect(result).toBe(false);
    expect(error.value).toBe(dataExportErrorMessage("rate_limited"));
    expect(mocked.click).not.toHaveBeenCalled();
  });

  it("falls back to the raw error message when the response has no JSON body", async () => {
    stubDownload();
    invokeMock.mockResolvedValue({ data: null, error: { message: "network error" } });

    const { error, exportData } = useDataExport();
    await exportData();

    expect(error.value).toBe("network error");
  });

  it("surfaces an `{ error }` body returned with a 2xx status the same way", async () => {
    stubDownload();
    invokeMock.mockResolvedValue({ data: { error: "export_failed" }, error: null });

    const { error, exportData } = useDataExport();
    const result = await exportData();

    expect(result).toBe(false);
    expect(error.value).toBe(dataExportErrorMessage("export_failed"));
    expect(mocked.click).not.toHaveBeenCalled();
  });

  it("sets exporting true while in flight and false once settled", async () => {
    stubDownload();
    let resolveInvoke!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));

    const { exporting, exportData } = useDataExport();
    const promise = exportData();
    expect(exporting.value).toBe(true);

    resolveInvoke({ data: { tables: {} }, error: null });
    await promise;

    expect(exporting.value).toBe(false);
  });
});
