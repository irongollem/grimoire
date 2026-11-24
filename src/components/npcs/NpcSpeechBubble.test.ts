import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const lowArt = vi.hoisted(() => ({ on: false }));
vi.mock("@/composables/useLowArt", () => ({ useLowArt: () => ({ lowArt: { get value() { return lowArt.on; } } }) }));
vi.mock("@/components/common/media/FocalImage.vue", () => ({
  default: { props: ["src", "focalPoint"], template: '<img data-testid="portrait" :src="src" />' },
}));

import NpcSpeechBubble from "./NpcSpeechBubble.vue";

const mountBubble = (props: Record<string, unknown>, slots: Record<string, string> = {}) => mount(NpcSpeechBubble, { props: { name: "Old Tam", line: "Move along.", ...props }, slots });

describe("NpcSpeechBubble", () => {
  it("shows the name, the line and the portrait", () => {
    const w = mountBubble({ portrait: "https://cdn.example/tam.webp" });
    expect(w.get("[data-testid=npc-speech-name]").text()).toBe("Old Tam");
    expect(w.get("[data-testid=npc-speech-line]").text()).toBe("Move along.");
    expect(w.get("[data-testid=portrait]").attributes("src")).toBe("https://cdn.example/tam.webp");
  });

  // Bug caught: an address from message metadata (a javascript: or data: URL) drawn as the avatar's src.
  it("draws no picture for an address that is not http(s), leaving the initial", () => {
    const w = mountBubble({ portrait: "javascript:alert(1)" });
    expect(w.find("[data-testid=portrait]").exists()).toBe(false);
    expect(w.get("[data-testid=npc-speech-initial]").text()).toBe("O");
    expect(mountBubble({ portrait: null }).find("[data-testid=portrait]").exists()).toBe(false);
  });

  // Bug caught: low art ignored, a record's face still drawn for the viewer who turned pictures off.
  it("draws the initial only while low art is on", () => {
    lowArt.on = true;
    expect(mountBubble({ portrait: "https://cdn.example/tam.webp" }).find("[data-testid=portrait]").exists()).toBe(false);
    lowArt.on = false;
  });

  // Bug caught: the AI mark missing on a model-written line (AI Act Art. 50), or shown on a DM's own.
  it("marks the line as AI only when asked", () => {
    expect(mountBubble({ ai: true }).find("[data-testid=npc-speech-ai]").exists()).toBe(true);
    expect(mountBubble({}).find("[data-testid=npc-speech-ai]").exists()).toBe(false);
  });

  it("holds actions in the default slot", () => {
    expect(mountBubble({}, { default: "<button>Said it</button>" }).text()).toContain("Said it");
  });
});
