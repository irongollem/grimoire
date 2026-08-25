import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  FREE_PAGE_LIMIT,
  MAX_UPLOAD_BYTES,
  validateTotalUploadBytes,
  MAX_IMPORT_BYTES,
  PRO_PAGE_LIMIT,
  pageLimitFor,
  validateUpload,
  type UploadCandidate,
} from "./limits";

const baseCandidate: UploadCandidate = {
  pageCount: 5,
  byteSize: 1024,
  mimeType: "application/pdf",
  isPro: false,
};

describe("pageLimitFor", () => {
  it("returns the free limit for a free account", () => {
    expect(pageLimitFor(false)).toBe(FREE_PAGE_LIMIT);
  });

  it("returns the pro limit for a pro-equivalent account", () => {
    expect(pageLimitFor(true)).toBe(PRO_PAGE_LIMIT);
  });
});

describe("validateUpload — page cap boundary", () => {
  it("passes a free upload exactly at the free limit", () => {
    const result = validateUpload({ ...baseCandidate, pageCount: FREE_PAGE_LIMIT, isPro: false });
    expect(result).toEqual({ ok: true });
  });

  it("fails a free upload one page over the free limit", () => {
    const result = validateUpload({
      ...baseCandidate,
      pageCount: FREE_PAGE_LIMIT + 1,
      isPro: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too_many_pages");
      expect(result.message).toMatch(/pro/i);
    }
  });

  it("passes a pro upload exactly at the pro limit", () => {
    const result = validateUpload({ ...baseCandidate, pageCount: PRO_PAGE_LIMIT, isPro: true });
    expect(result).toEqual({ ok: true });
  });

  it("fails a pro upload one page over the pro limit", () => {
    const result = validateUpload({
      ...baseCandidate,
      pageCount: PRO_PAGE_LIMIT + 1,
      isPro: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too_many_pages");
    }
  });

  it("lets a pro upload through at a page count that would fail on free", () => {
    const proResult = validateUpload({
      ...baseCandidate,
      pageCount: FREE_PAGE_LIMIT + 1,
      isPro: true,
    });
    expect(proResult).toEqual({ ok: true });
  });
});

describe("validateUpload — byte cap", () => {
  it("passes a file exactly at MAX_UPLOAD_BYTES", () => {
    const result = validateUpload({ ...baseCandidate, byteSize: MAX_UPLOAD_BYTES });
    expect(result).toEqual({ ok: true });
  });

  it("fails a file one byte over MAX_UPLOAD_BYTES with reason too_large", () => {
    const result = validateUpload({ ...baseCandidate, byteSize: MAX_UPLOAD_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too_large");
    }
  });
});

describe("validateTotalUploadBytes — aggregate byte cap", () => {
  it("passes a combined upload exactly at the limit", () => {
    expect(validateTotalUploadBytes(MAX_IMPORT_BYTES)).toEqual({ ok: true });
  });

  it("rejects a batch whose individual files fit but combined size does not", () => {
    const result = validateTotalUploadBytes(MAX_IMPORT_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");
  });

  // The regression this constant exists for: reusing the 25 MB per-object cap
  // as the aggregate made the page limits unreachable, because a batch at the
  // free tier's own 10-page allowance already exceeded it.
  it("admits a full free-tier batch of downscaled page photos", () => {
    const tenPagesAtHalfAMegabyte = 10 * 512 * 1024;
    expect(validateTotalUploadBytes(tenPagesAtHalfAMegabyte)).toEqual({ ok: true });
  });

  it("admits a full Pro batch of downscaled page photos", () => {
    const fiftyPagesAtHalfAMegabyte = 50 * 512 * 1024;
    expect(validateTotalUploadBytes(fiftyPagesAtHalfAMegabyte)).toEqual({ ok: true });
  });
});

describe("validateUpload — MIME type", () => {
  it("accepts every type in ACCEPTED_MIME_TYPES", () => {
    for (const mimeType of ACCEPTED_MIME_TYPES) {
      expect(validateUpload({ ...baseCandidate, mimeType })).toEqual({ ok: true });
    }
  });

  it("rejects an unsupported type with reason unsupported_type", () => {
    const result = validateUpload({
      ...baseCandidate,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported_type");
    }
  });
});

describe("validateUpload — failure reasons are mutually distinct", () => {
  it("produces a different reason for each of the three failure modes", () => {
    const tooManyPages = validateUpload({ ...baseCandidate, pageCount: FREE_PAGE_LIMIT + 1 });
    const tooLarge = validateUpload({ ...baseCandidate, byteSize: MAX_UPLOAD_BYTES + 1 });
    const unsupportedType = validateUpload({ ...baseCandidate, mimeType: "application/msword" });

    const reasons = [tooManyPages, tooLarge, unsupportedType].map((result) =>
      result.ok ? null : result.reason,
    );
    expect(reasons).toEqual(["too_many_pages", "too_large", "unsupported_type"]);
    expect(new Set(reasons).size).toBe(3);
  });
});
