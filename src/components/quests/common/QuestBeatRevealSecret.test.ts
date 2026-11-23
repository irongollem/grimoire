import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ reveal: vi.fn() }));
const entries = ref<CanonEntry[]>([]);
const ready = ref(true);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/canon/useRevealSecret", () => ({ useRevealSecret: () => ({ ready, revealSecret: mocks.reveal }) }));
import QuestBeatRevealSecret from "./QuestBeatRevealSecret.vue";

const secret = (over: Partial<CanonEntry> = {}) => canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter.", ...over });
const mountIt = () => mount(QuestBeatRevealSecret, { props: { secretId: "s1" } });

describe("QuestBeatRevealSecret", () => {
  beforeEach(() => {
    mocks.reveal.mockReset().mockReturnValue(true);
    entries.value = [secret()];
    ready.value = true;
  });

  // Bug caught: the prompt offered itself for a secret the party already read, asking the DM to reveal it twice.
  it("offers nothing when the secret is already revealed", () => {
    entries.value = [secret({ revealed_at: "2026-11-23T10:00:00Z" })];
    expect(mountIt().find("[data-testid=beat-reveal-secret]").exists()).toBe(false);
  });

  // Bug caught: "Reveal it" never reached the shared reveal, or reached it for another secret.
  it("reveals the secret on Reveal it and then closes", async () => {
    const w = mountIt();
    await w.find("[data-testid=beat-reveal-secret-yes]").trigger("click");
    expect(mocks.reveal).toHaveBeenCalledWith("s1");
    expect(w.emitted("done")).toHaveLength(1);
  });

  // Bug caught: "Not yet" revealed the secret anyway, showing the party what the DM meant to keep back.
  it("leaves the secret hidden on Not yet", async () => {
    const w = mountIt();
    await w.find("[data-testid=beat-reveal-secret-no]").trigger("click");
    expect(mocks.reveal).not.toHaveBeenCalled();
    expect(w.emitted("done")).toHaveLength(1);
  });

  // Bug caught: closing the prompt when the reveal was refused (party not loaded), so the DM thought it was shared.
  it("stays open when the reveal could not be made", async () => {
    mocks.reveal.mockReturnValue(false);
    const w = mountIt();
    await w.find("[data-testid=beat-reveal-secret-yes]").trigger("click");
    expect(w.emitted("done")).toBeUndefined();
  });
});
