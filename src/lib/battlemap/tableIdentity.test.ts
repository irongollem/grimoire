import { describe, expect, it } from "vitest";
import { parseTableMessage } from "@/lib/tableChannel/messages";
import { senderColor } from "./tableIdentity";

describe("senderColor", () => {
  it("gives the same member the same colour every time, so their strokes match on every screen", () => {
    expect(senderColor("5b0e-user")).toBe(senderColor("5b0e-user"));
  });
  // The receiver refuses a colour it does not recognise, which would silently drop every one of that member's marks.
  it("is a colour the table channel accepts", () => {
    const by = { id: "u", name: "Ayla", color: senderColor("u") };
    expect(parseTableMessage({ event: "ping", x: 1, y: 1, by, at: 1 })).not.toBeNull();
  });
});
