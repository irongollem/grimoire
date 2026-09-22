import { describe, expect, it, vi } from "vitest";
import { usableDsn } from "./sentry";

describe("usableDsn", () => {
  it("accepts a real DSN", () => {
    const dsn = "https://abc123@o4511905700708352.ingest.de.sentry.io/4511905732231248";
    expect(usableDsn(dsn)).toBe(dsn);
  });

  it("treats absence as off, quietly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(usableDsn(undefined)).toBeNull();
    expect(usableDsn("")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  /**
   * The regression. Vercel writes this literal string for a Sensitive variable
   * because a CI build cannot read the real one, and it is truthy — so a bare
   * `if (!dsn)` admitted it, `Sentry.init` failed to parse it, and the client
   * disabled itself with no error. Production reported nothing from the
   * browser while looking fully instrumented.
   */
  it("rejects Vercel's [SENSITIVE] placeholder, loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(usableDsn("[SENSITIVE]")).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/not a URL/);
    expect(spy.mock.calls[0]![0]).toMatch(/Sensitive/);
    spy.mockRestore();
  });

  it("rejects anything else that is not a URL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of ["undefined", "null", "your-dsn-here", "o123.ingest.sentry.io/4", "ftp://x/1"]) {
      expect(usableDsn(bad), bad).toBeNull();
    }
    spy.mockRestore();
  });
});
