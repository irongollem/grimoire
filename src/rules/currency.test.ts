import { describe, expect, it } from "vitest";
import { parseCoinText } from "./currency";

describe("parseCoinText", () => {
  it("reads simple and mixed prices", () => {
    expect(parseCoinText("5 gp")).toEqual({ pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 });
    expect(parseCoinText("1 gp 5 sp")).toEqual({ pp: 0, gp: 1, ep: 0, sp: 5, cp: 0 });
    expect(parseCoinText("150 gold")).toEqual({ pp: 0, gp: 150, ep: 0, sp: 0, cp: 0 });
  });

  it("reads thousands separators as part of the number", () => {
    expect(parseCoinText("1,500 gp").gp).toBe(1500);
    expect(parseCoinText("5,001 gp").gp).toBe(5001);
    expect(parseCoinText("1,000,000 cp").cp).toBe(1_000_000);
  });

  it("still reads an unseparated large number", () => {
    expect(parseCoinText("5001 gp").gp).toBe(5001);
  });
});
