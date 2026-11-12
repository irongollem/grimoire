import { describe, expect, it } from "vitest";
import type { ImportedBrush } from "../import/types";
import { STOCK_BRUSHES } from "./stockBrushes";
import { transferBuffers } from "./transferBuffers";

const brush = (tip: ImportedBrush["tip"], grain: ImportedBrush["grain"] = null): ImportedBrush => ({ preset: STOCK_BRUSHES[0], tip, grain, notes: [] });

describe("transferBuffers", () => {
  it("lists a buffer once however many brushes share its picture", () => {
    // Fails on: a duplicate in the transfer list, which makes postMessage throw and silently loses a whole file's import.
    const shared = { width: 2, height: 2, alpha: new Uint8Array(4) };
    const own = { width: 2, height: 2, alpha: new Uint8Array(4) };
    const grain = { width: 1, height: 1, value: new Uint8Array(1) };
    const list = transferBuffers({ brushes: [brush(shared), brush(shared, grain), brush(own), brush(null)], skipped: [] });
    expect(list).toHaveLength(3);
    expect(() => structuredClone({ shared, own, grain }, { transfer: list })).not.toThrow();
  });
});
