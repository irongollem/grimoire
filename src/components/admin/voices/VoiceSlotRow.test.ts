// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { SpeechVoice } from "@/types/speechVoice.types";
import VoiceSlotRow from "./VoiceSlotRow.vue";

function voice(overrides: Partial<SpeechVoice> = {}): SpeechVoice {
  return {
    id: "s1", name: "Ooru", description: "", design_prompt: null, preview_text: null, sex: null, age: null, kind: "own", origin: "designed",
    service: "elevenlabs", voice_id: "v1", library_voice_id: null, sample_key: null, binding: null, active: true, created_at: "", updated_at: "", ...overrides,
  };
}
const labels = (w: ReturnType<typeof mount>) => w.findAll("button").map((b) => b.text());

describe("VoiceSlotRow", () => {
  // Bug caught: a Remove button on the Narrator or Ooru, which the server refuses with bound_voice (or worse, silences).
  it("offers no Remove on a bound slot, but still Edit and Design", () => {
    const w = mount(VoiceSlotRow, { props: { voice: voice({ binding: "familiar" }), playing: false, loading: false } });
    expect(labels(w).some((l) => l.includes("Remove"))).toBe(false);
    expect(labels(w).some((l) => l.includes("Edit"))).toBe(true);
    expect(labels(w).some((l) => l.includes("Design"))).toBe(true);
  });

  it("keeps Remove on a character's slot", () => {
    const w = mount(VoiceSlotRow, { props: { voice: voice(), playing: false, loading: false } });
    expect(labels(w).some((l) => l.includes("Remove"))).toBe(true);
  });

  // Bug caught: a bound slot looking like any other voice, so nobody knows Narrators and Ooru live there.
  it("says what a bound slot is for", () => {
    const w = mount(VoiceSlotRow, { props: { voice: voice({ binding: "narrator-man-inworld", service: "inworld" }), playing: false, loading: false } });
    expect(w.get('[data-testid="voice-binding"]').text()).toContain("The Narrator (man)");
  });
});
