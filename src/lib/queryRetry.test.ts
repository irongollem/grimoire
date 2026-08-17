import { describe, it, expect } from "vitest";
import {
  isAbortError,
  isMissingRowError,
  queryRetryDelay,
  shouldRetryQuery,
} from "./queryRetry";

const missingRow = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };
const abort = new DOMException("aborted", "AbortError");
const network = new Error("network down");

describe("isMissingRowError", () => {
  it("recognises PostgREST's zero-row answer to .single()", () => {
    expect(isMissingRowError(missingRow)).toBe(true);
  });

  it("does not mistake other Postgres errors for it", () => {
    expect(isMissingRowError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRowError({ code: "PGRST301" })).toBe(false);
  });

  it("survives the shapes an error can actually arrive as", () => {
    expect(isMissingRowError(null)).toBe(false);
    expect(isMissingRowError(undefined)).toBe(false);
    expect(isMissingRowError("PGRST116")).toBe(false);
    expect(isMissingRowError(network)).toBe(false);
  });
});

describe("shouldRetryQuery", () => {
  it("never retries a definitive missing row", () => {
    // The bug this guards: a stale campaign id in localStorage after a session
    // expires turned an instant 406 into 1s + 2s + 4s of held loading screen.
    expect(shouldRetryQuery(0, missingRow)).toBe(false);
  });

  it("still retries genuine failures", () => {
    expect(shouldRetryQuery(0, network)).toBe(true);
    expect(shouldRetryQuery(2, network)).toBe(true);
    expect(shouldRetryQuery(3, network)).toBe(false);
  });

  it("gives aborts a shorter leash than other failures", () => {
    expect(shouldRetryQuery(1, abort)).toBe(true);
    expect(shouldRetryQuery(2, abort)).toBe(false);
    expect(shouldRetryQuery(2, network)).toBe(true);
  });
});

describe("queryRetryDelay", () => {
  it("backs off exponentially, capped", () => {
    expect(queryRetryDelay(0, network)).toBe(1000);
    expect(queryRetryDelay(2, network)).toBe(4000);
    expect(queryRetryDelay(99, network)).toBe(30_000);
  });

  it("retries an abort sooner — it is usually the app's own navigation", () => {
    expect(queryRetryDelay(0, abort)).toBe(600);
    expect(queryRetryDelay(1, abort)).toBe(1200);
  });
});

describe("isAbortError", () => {
  it("matches only a DOMException named AbortError", () => {
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new DOMException("nope", "OtherError"))).toBe(false);
    expect(isAbortError(network)).toBe(false);
  });
});
