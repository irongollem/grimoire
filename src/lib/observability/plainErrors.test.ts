import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/vue";
import { classifyPlainError, matchesIgnored, plainErrorMessage } from "./plainErrors";

const IGNORED = [/NetworkError when attempting to fetch resource/, /Load failed/, "The operation was aborted"];

/** What the SDK builds for a thrown plain object, before `beforeSend`. */
function syntheticEvent(): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [{ type: "Error", value: "Object captured as exception with keys: code, details, hint, message" }],
    },
  };
}

/** The object postgrest-js returns when the fetch itself rejects (DUNGEON-GRIMOIRE-J). */
const transportFailure = {
  code: "",
  details: "",
  hint: "",
  message: "TypeError: NetworkError when attempting to fetch resource. (ypdokpdpvtmyzkltnmsq.supabase.co)",
};

describe("plainErrorMessage", () => {
  it("reads the message of an error-shaped plain object", () => {
    expect(plainErrorMessage(transportFailure)).toBe(transportFailure.message);
  });

  it("leaves real Errors, primitives and messageless objects to the SDK", () => {
    expect(plainErrorMessage(new Error("boom"))).toBeNull();
    expect(plainErrorMessage("boom")).toBeNull();
    expect(plainErrorMessage(null)).toBeNull();
    expect(plainErrorMessage({ code: "42501" })).toBeNull();
    expect(plainErrorMessage({ message: "" })).toBeNull();
  });
});

describe("matchesIgnored", () => {
  it("matches strings as substrings and RegExps by test, as ignoreErrors does", () => {
    expect(matchesIgnored("x The operation was aborted y", IGNORED)).toBe(true);
    expect(matchesIgnored("TypeError: Load failed", IGNORED)).toBe(true);
    expect(matchesIgnored("permission denied for table quests", IGNORED)).toBe(false);
  });
});

describe("classifyPlainError", () => {
  it("drops a dropped connection thrown as a plain object", () => {
    expect(classifyPlainError(syntheticEvent(), transportFailure, IGNORED)).toBeNull();
  });

  it("titles and groups any other plain object by its code and message", () => {
    const original = { code: "42501", details: "", hint: "", message: "permission denied for table quests" };
    const event = classifyPlainError(syntheticEvent(), original, IGNORED);
    expect(event?.exception?.values?.[0]).toMatchObject({
      type: "PostgrestError 42501",
      value: "permission denied for table quests",
    });
    expect(event?.fingerprint).toEqual(["plain-object-error", "42501", "permission denied for table quests"]);
  });

  it("leaves an event from a real Error untouched", () => {
    const event = syntheticEvent();
    expect(classifyPlainError(event, new Error("NetworkError when attempting to fetch resource"), IGNORED)).toBe(event);
    expect(event.fingerprint).toBeUndefined();
  });
});
