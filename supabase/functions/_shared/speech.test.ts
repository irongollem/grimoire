import { describe, expect, it } from "vitest";
import { hasSpeechService, speechEnvFrom, voicesOn } from "./speech.ts";

const noEnv = () => undefined;

describe("speechEnvFrom (#1021): the admin's keys turn voices on", () => {
  it("an Inworld key alone does not turn voices on, but Inworld can speak", () => {
    const env = speechEnvFrom({ inworld: "iw" }, noEnv);
    expect(voicesOn(env)).toBe(false);
    expect(hasSpeechService(env, "inworld")).toBe(true);
    expect(hasSpeechService(env, "elevenlabs")).toBe(false);
  });

  it("an ElevenLabs key turns voices on without Inworld", () => {
    const env = speechEnvFrom({ elevenlabs: "el" }, noEnv);
    expect(voicesOn(env)).toBe(true);
    expect(hasSpeechService(env, "inworld")).toBe(false);
  });
});
