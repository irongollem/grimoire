import { describe, expect, it } from "vitest";
import { secretIdsIn } from "./secretIds";

const secret = (secretId: unknown) => ({ type: "secretBlock", attrs: { secretId }, content: [] });

describe("secretIdsIn", () => {
  it("finds ids at any depth, in order", () => {
    const doc = {
      type: "doc",
      content: [secret("a"), { type: "blockquote", content: [secret("b")] }],
    };
    expect(secretIdsIn(doc)).toEqual(["a", "b"]);
  });

  it("skips blocks without an id and non-documents", () => {
    expect(secretIdsIn({ type: "doc", content: [secret(null), secret(""), { type: "secretBlock" }] })).toEqual([]);
    expect(secretIdsIn(null)).toEqual([]);
    expect(secretIdsIn("text")).toEqual([]);
  });
});
