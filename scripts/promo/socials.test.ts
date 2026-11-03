import { describe, expect, it } from "vitest";
import { isTrustedWrite, orderReels } from "./socials";

const real = { host: "127.0.0.1:5182", origin: "http://127.0.0.1:5182", "x-promo-socials": "1" };

describe("isTrustedWrite", () => {
  it("accepts the recorder page's own request", () => {
    expect(isTrustedWrite(real, 5182)).toBe(true);
    expect(isTrustedWrite({ host: "localhost:5182", origin: "http://localhost:5182", "x-promo-socials": "1" }, 5182)).toBe(true);
    expect(isTrustedWrite({ host: "127.0.0.1:5182", "x-promo-socials": "1" }, 5182)).toBe(true);
  });

  it("refuses a foreign Origin (a website posting to 127.0.0.1)", () => {
    expect(isTrustedWrite({ ...real, origin: "https://evil.example" }, 5182)).toBe(false);
    expect(isTrustedWrite({ ...real, origin: "http://127.0.0.1:9999" }, 5182)).toBe(false);
  });

  it("refuses a request without the custom header (a cross-site form)", () => {
    expect(isTrustedWrite({ host: real.host, origin: real.origin }, 5182)).toBe(false);
    expect(isTrustedWrite({ ...real, "x-promo-socials": "0" }, 5182)).toBe(false);
  });

  it("refuses a foreign Host (DNS rebinding)", () => {
    expect(isTrustedWrite({ ...real, host: "evil.example:5182", origin: undefined }, 5182)).toBe(false);
    expect(isTrustedWrite({ ...real, host: undefined }, 5182)).toBe(false);
    expect(isTrustedWrite({ ...real, host: "127.0.0.1:9999", origin: undefined }, 5182)).toBe(false);
  });
});

describe("orderReels", () => {
  const posted = (postedAt: string) => ({ postedAt });
  it("puts scheduled by time, then unscheduled by id, then posted newest first", () => {
    const rows = [
      { id: "p-old", scheduledAt: null, posted: posted("2026-10-01T10:00:00Z") },
      { id: "z-plain", scheduledAt: null, posted: null },
      { id: "late", scheduledAt: "2026-12-02T10:00:00+01:00", posted: null },
      { id: "p-new", scheduledAt: null, posted: posted("2026-11-01T10:00:00Z") },
      { id: "a-plain", scheduledAt: null, posted: null },
      { id: "soon", scheduledAt: "2026-11-05T10:00:00+01:00", posted: null },
    ];
    expect(orderReels(rows).map((r) => r.id)).toEqual(["soon", "late", "a-plain", "z-plain", "p-new", "p-old"]);
  });

  it("orders scheduled times by instant, not by the text", () => {
    const rows = [
      { id: "b", scheduledAt: "2026-11-05T10:00:00+05:00", posted: null },
      { id: "a", scheduledAt: "2026-11-05T09:00:00-05:00", posted: null },
    ];
    expect(orderReels(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("lists a posted Reel after the unposted even if it still has a schedule entry", () => {
    const rows = [
      { id: "done", scheduledAt: "2026-11-01T10:00:00Z", posted: posted("2026-11-01T10:05:00Z") },
      { id: "todo", scheduledAt: null, posted: null },
    ];
    expect(orderReels(rows).map((r) => r.id)).toEqual(["todo", "done"]);
  });
});
