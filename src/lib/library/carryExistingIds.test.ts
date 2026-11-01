import { describe, expect, it } from "vitest";
import { carryExistingIds } from "./carryExistingIds";

const row = (id: string, doc: string | null, record: string | null) => ({ id, source_document_key: doc, source_record_key: record, name: id });

describe("carryExistingIds", () => {
  it("keeps the stored id when a seed would mint a different one for the same record (a v1-era id survives the re-key)", () => {
    const out = carryExistingIds([row("srd_aboleth", "srd-2014", "srd-2014_aboleth")], [row("srd_aboleth_bf", "srd-2014", "srd-2014_aboleth")]);
    expect(out[0]?.id).toBe("srd_aboleth_bf");
  });

  it("leaves a record with no stored twin on its minted id", () => {
    const out = carryExistingIds([row("srd_new", "bfrd", "bfrd_new")], [row("srd_other", "bfrd", "bfrd_other")]);
    expect(out[0]?.id).toBe("srd_new");
  });

  it("matches on document AND record key: the same record key in another document is a different row", () => {
    const out = carryExistingIds([row("minted", "ccdx", "owlbear")], [row("old", "tob", "owlbear")]);
    expect(out[0]?.id).toBe("minted");
  });

  it("does not touch the other columns of the row", () => {
    const out = carryExistingIds([row("minted", "ccdx", "x")], [row("old", "ccdx", "x")]);
    expect(out[0]?.name).toBe("minted");
  });
});
