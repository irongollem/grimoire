import { describe, expect, it } from "vitest";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
import { ASK_LISTS, ASK_RECORD_PICKERS, isRecordPicker } from "./askOptions";

const inputs = ASK_GENERATORS.flatMap((g) => Object.entries(g.inputs).map(([key, schema]) => ({ id: g.id, key, schema })));

describe("the contract's form metadata", () => {
  // Bug caught: an input naming a list the browser does not have, which would render as an empty pick the DM cannot fill.
  it("names only lists the option registry has", () => {
    for (const { id, key, schema } of inputs) {
      if (schema.type === "string" && schema.list !== undefined) expect(Object.keys(ASK_LISTS), `${id}.${key}`).toContain(schema.list);
    }
  });

  // Bug caught: a record input naming a kind no picker serves, so the id could only be typed by hand.
  it("names only records a picker serves", () => {
    for (const { id, key, schema } of inputs) {
      if (schema.type === "string" && schema.record !== undefined) expect(isRecordPicker(schema.record), `${id}.${key}`).toBe(true);
    }
    expect(ASK_RECORD_PICKERS.length).toBeGreaterThan(0);
  });

  // Bug caught: a `when` hanging on an input the generator does not have, which would hide the input for ever.
  it("hangs every show-when on an input of the same generator", () => {
    for (const g of ASK_GENERATORS) {
      for (const [key, schema] of Object.entries(g.inputs)) {
        if (!schema.when) continue;
        for (const on of typeof schema.when.key === "string" ? [schema.when.key] : schema.when.key) expect(Object.keys(g.inputs), `${g.id}.${key}`).toContain(on);
      }
    }
  });

  // Bug caught: a button-opened card whose defaults the schema would then drop as unknown.
  it("opens a card only with inputs the generator has", () => {
    for (const g of ASK_GENERATORS) for (const key of Object.keys(g.opened ?? {})) expect(Object.keys(g.inputs), `${g.id}.${key}`).toContain(key);
  });
});
