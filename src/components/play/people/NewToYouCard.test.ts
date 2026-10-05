import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import NewToYouCard from "@/components/play/people/NewToYouCard.vue";

const person = {
  name: "Mira Thorne",
  what: "Human, apothecary",
  portraitUrl: null,
  focalPoint: null,
  relationship: "friendly" as const,
};

function mountCard(props: Record<string, unknown> = {}) {
  return mount(NewToYouCard, {
    props: { kind: "new", person, place: "Market Square", ...props },
    global: { stubs: { FocalImage: true } },
  });
}

async function finishTurn(wrapper: ReturnType<typeof mountCard>) {
  const layer = wrapper.find(".transform-3d");
  const event = new Event("transitionend");
  Object.defineProperty(event, "propertyName", { value: "transform" });
  await layer.element.dispatchEvent(event);
}

describe("NewToYouCard", () => {
  it("shows Someone new and the place face down, with the name hidden", () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("Someone new");
    expect(wrapper.text()).toContain("Market Square");
    expect(wrapper.attributes("aria-label")).toBe("Someone new, met at Market Square. Turn over");
    const faces = wrapper.findAll(".backface-hidden");
    expect(faces[0]?.attributes("aria-hidden")).toBeUndefined();
    expect(faces[1]?.attributes("aria-hidden")).toBe("true");
  });

  it("turns on click and emits turned once the transition ends", async () => {
    const wrapper = mountCard();
    await wrapper.trigger("click");
    expect(wrapper.find(".transform-3d").attributes("style")).toContain("rotateY(180deg)");
    expect(wrapper.attributes("aria-label")).toBe("Mira Thorne. Open");
    expect(wrapper.emitted("turned")).toBeUndefined();
    await finishTurn(wrapper);
    await finishTurn(wrapper);
    expect(wrapper.emitted("turned")).toHaveLength(1);
  });

  it("emits turned straight away under reduced motion", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as typeof window.matchMedia;
    try {
      const wrapper = mountCard();
      await wrapper.trigger("click");
      expect(wrapper.emitted("turned")).toHaveLength(1);
    } finally {
      window.matchMedia = original;
    }
  });

  it("opens the person when a turned card is clicked", async () => {
    const wrapper = mountCard();
    await wrapper.trigger("click");
    expect(wrapper.emitted("open")).toBeUndefined();
    await wrapper.trigger("click");
    expect(wrapper.emitted("open")).toHaveLength(1);
  });

  it("shows the cover first and 'You knew them as' once unmasked", async () => {
    const wrapper = mountCard({
      kind: "unmasked",
      cover: { name: "Brother Aldous", portraitUrl: null, focalPoint: null },
    });
    expect(wrapper.text()).toContain("Unmasked");
    expect(wrapper.text()).toContain("Brother Aldous");
    expect(wrapper.attributes("aria-label")).toBe("Brother Aldous, unmasked. Turn over");
    await wrapper.trigger("click");
    expect(wrapper.text()).toContain("You knew them as Brother Aldous");
    expect(wrapper.attributes("aria-label")).toBe("Mira Thorne, unmasked. Open");
  });

  it("renders ??? for a person whose name is not known", () => {
    const wrapper = mountCard({ person: { ...person, name: null } });
    expect(wrapper.text()).toContain("???");
  });
});
