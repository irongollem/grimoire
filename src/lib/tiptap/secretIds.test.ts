import { describe, expect, it } from "vitest";
import { reMintSecretIds, secretIdsIn } from "./secretIds";

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

describe("reMintSecretIds", () => {
  const A = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
  const doc = { type: "doc", content: [secret(A), { type: "blockquote", content: [secret("b-id")] }] };

  it("gives every block a new id and leaves the original untouched", () => {
    const copy = reMintSecretIds(doc);
    const ids = secretIdsIn(copy);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(A);
    expect(ids).not.toContain("b-id");
    expect(secretIdsIn(doc)).toEqual([A, "b-id"]);
  });

  it("works on a JSON string and returns a string", () => {
    const copy = reMintSecretIds(JSON.stringify(doc));
    expect(typeof copy).toBe("string");
    expect(secretIdsIn(JSON.parse(copy))).not.toContain(A);
  });

  it("returns a string that merely mentions a secret block, and is not JSON, as it came", () => {
    expect(reMintSecretIds("notes about the secretBlock feature")).toBe("notes about the secretBlock feature");
  });

  it("returns anything without a secret block as it came", () => {
    const plain = { type: "doc", content: [{ type: "paragraph" }] };
    expect(reMintSecretIds(plain)).toBe(plain);
    expect(reMintSecretIds("plain text")).toBe("plain text");
    expect(reMintSecretIds(null)).toBeNull();
  });
});
