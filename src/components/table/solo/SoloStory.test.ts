import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloStory from "./SoloStory.vue";
import { assignSpeakerColours } from "@/lib/table/speakerColours";
import type { StoryItem } from "@/lib/table/soloTypes";

const items: StoryItem[] = [
  { id: "1", kind: "player", mode: "say", text: "Who are you?" },
  { id: "2", kind: "player", mode: "do", text: "I step closer." },
  { id: "3", kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Honeycomb. Apprentice, once." },
  { id: "4", kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Holds out the keys." },
  { id: "5", kind: "spoken", speaker: { id: null, name: "The sweeper" }, text: "Sweep." },
  { id: "6", kind: "narration", text: "Rain on the step." },
];

function story(portraits = new Map<string, { src: string; focalPoint: null }>()) {
  return mount(SoloStory, { props: { items, colours: assignSpeakerColours(items), portraits, character: "Inkling" } });
}

describe("SoloStory", () => {
  // Bug caught: speech and deeds drawn alike, or the player's say and do drawn alike (the distinction the page is for).
  it("draws a box for what is said aloud and none for what is done", () => {
    const w = story();
    expect(w.findAll('[data-line="spoken"]')).toHaveLength(2);
    expect(w.findAll('[data-line="acted"]')).toHaveLength(1);
    expect(w.get('[data-play-mode="say"]').attributes("data-boxed")).toBe("true");
    expect(w.get('[data-play-mode="do"]').attributes("data-boxed")).toBe("false");
    expect(w.get('[data-play-mode="say"]').text()).toContain("Inkling says");
    expect(w.get('[data-play-mode="do"]').text()).not.toContain("says");
  });

  // Bug caught: colour as the only clue; the name must always be there.
  it("always names the speaker, and gives each character their own pigment", () => {
    const w = story();
    const [first, second] = w.findAll('[data-line="spoken"]');
    expect(first.text()).toContain("Honeycomb");
    expect(second.text()).toContain("The sweeper");
    expect(first.attributes("data-pigment")).not.toBe(second.attributes("data-pigment"));
    expect(w.get('[data-line="acted"]').attributes("data-pigment")).toBe(first.attributes("data-pigment"));
  });

  // Bug caught: a plate drawn for a character with no art (an empty frame), or a portrait missing for one that has it.
  it("gives a plate only to a character who has art", () => {
    const w = story(new Map([["n1", { src: "https://cdn.example/h.webp", focalPoint: null }]]));
    const [withArt, without] = w.findAll('[data-line="spoken"]');
    expect(withArt.find('[role="img"]').exists()).toBe(true);
    expect(without.find('[role="img"]').exists()).toBe(false);
  });
});
