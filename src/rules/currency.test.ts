import { describe, expect, it } from "vitest";
import { fromCP, parseCoinText, toCP } from "./currency";

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

// PHB 2014 "Coinage": 1 pp = 10 gp = 100 sp = 1,000 cp, and 1 ep = 50 cp
describe("coin conversion", () => {
  it("values every denomination in copper", () => {
    // 1000 + 100 + 50 + 10 + 1
    expect(toCP(1, 1, 1, 1, 1)).toBe(1161);
  });

  it("converts copper back to the largest coins, electrum left out", () => {
    // 1161 cp = 1 pp (1000) + 1 gp (100) + 6 sp (60) + 1 cp
    expect(fromCP(1161)).toEqual({ pp: 1, gp: 1, ep: 0, sp: 6, cp: 1 });
  });

  it("reads every denomination out of price text", () => {
    expect(parseCoinText("2 pp 3 ep 4 silver 5 copper")).toEqual({ pp: 2, gp: 0, ep: 3, sp: 4, cp: 5 });
  });
});
