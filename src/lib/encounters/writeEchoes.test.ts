import { describe, expect, it } from "vitest";
import { createWriteEchoes } from "./writeEchoes";

type Form = { beast_hp: number; beast_max_hp: number; name: string } | null;

const wolf = (hp: number): Form => ({ name: "Wolf", beast_hp: hp, beast_max_hp: 11 });
// The same form as Postgres hands it back: jsonb keys in its own order.
const wolfFromDb = (hp: number): Form => ({ beast_hp: hp, name: "Wolf", beast_max_hp: 11 });

describe("createWriteEchoes", () => {
  it("knows nothing of a row it never wrote", () => {
    const echoes = createWriteEchoes<Form>();
    expect(echoes.isOwn("pm", wolf(6))).toBe(false);
  });

  it("recognises an echo whatever order its keys come back in", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", wolf(6));
    expect(echoes.isOwn("pm", wolfFromDb(6))).toBe(true);
    // Consumed: a later identical value from elsewhere is a real change.
    expect(echoes.isOwn("pm", wolfFromDb(6))).toBe(false);
  });

  it("drops a stale echo that arrives after a newer write", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", wolf(6));
    echoes.sent("pm", wolf(2));
    expect(echoes.isOwn("pm", wolfFromDb(6))).toBe(true);
    expect(echoes.isOwn("pm", wolfFromDb(2))).toBe(true);
    expect(echoes.isOwn("pm", wolfFromDb(9))).toBe(false);
  });

  it("consumes older writes along with the echo of a newer one", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", wolf(6));
    echoes.sent("pm", wolf(2));
    expect(echoes.isOwn("pm", wolfFromDb(2))).toBe(true);
    expect(echoes.isOwn("pm", wolfFromDb(6))).toBe(false);
  });

  it("ignores other values while a write is unechoed, since that write supersedes them", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", wolf(2));
    expect(echoes.isOwn("pm", wolfFromDb(11))).toBe(true);
    expect(echoes.isOwn("pm", wolfFromDb(2))).toBe(true);
  });

  it("snapshots the value sent, so mutating the caller's object later changes nothing", () => {
    const echoes = createWriteEchoes<Form>();
    const form = wolf(6);
    echoes.sent("pm", form);
    form!.beast_hp = 1;
    // The echo of what was sent is 6, and consuming it empties the ledger, so
    // the 1 the caller later wrote into its own object is nothing of ours.
    expect(echoes.isOwn("pm", wolfFromDb(6))).toBe(true);
    expect(echoes.isOwn("pm", wolfFromDb(1))).toBe(false);
  });

  it("forgets a failed write, so it stops holding back changes from elsewhere", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", wolf(6));
    echoes.failed("pm", wolf(6));
    expect(echoes.isOwn("pm", wolfFromDb(9))).toBe(false);
  });

  it("treats null (leaving the form) like any other value", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("pm", null);
    expect(echoes.isOwn("pm", null)).toBe(true);
    expect(echoes.isOwn("pm", null)).toBe(false);
  });

  it("clear forgets every row", () => {
    const echoes = createWriteEchoes<Form>();
    echoes.sent("a", wolf(6));
    echoes.sent("b", wolf(6));
    echoes.clear();
    expect(echoes.isOwn("a", wolf(9))).toBe(false);
    expect(echoes.isOwn("b", wolf(9))).toBe(false);
  });
});
