import { describe, expect, it } from "vitest";
import { hpTextClass } from "@/components/player/hpDisplay";

describe("hpTextClass", () => {
  it("is green when healthy, amber when hurt, red when low or at 0", () => {
    expect(hpTextClass(40, 40)).toBe("text-elven-green");
    expect(hpTextClass(20, 40)).toBe("text-ink-caution");
    expect(hpTextClass(10, 40)).toBe("text-destructive");
    expect(hpTextClass(0, 40)).toBe("text-destructive");
    expect(hpTextClass(0, 0)).toBe("text-destructive");
  });
});
