import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
}));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: ref([]) }) }));

import SecretsSection from "./SecretsSection.vue";

const mountSection = () => mount(SecretsSection, { props: { secrets: [], questions: [] }, global: { stubs: { QuestionsList: true } } });

describe("SecretsSection", () => {
  beforeEach(() => { mocks.create.mockReset(); });

  it("adds a secret, empties the box and opens the new secret", async () => {
    mocks.create.mockResolvedValue({ id: "s9" });
    const w = mountSection();
    const input = w.find("input[aria-label='A new secret']");
    await input.setValue("  Sift is the guild master's daughter. ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "secret", title: "Sift is the guild master's daughter.", sort_order: 0 });
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(w.emitted("select")?.[0]).toEqual(["s9"]);
  });

  it("keeps the words and selects nothing when the create fails", async () => {
    mocks.create.mockImplementation(() => Promise.reject(new Error("no")));
    const w = mountSection();
    const input = w.find("input[aria-label='A new secret']");
    await input.setValue("The Stain is a wound.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("The Stain is a wound.");
    expect(w.emitted("select")).toBeUndefined();
  });
});
