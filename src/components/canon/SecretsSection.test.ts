import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

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

  // Bug caught: below a desktop the open secret's detail rendered after the whole section, past the open questions, so tapping a secret seemed to do nothing.
  it("renders slot content before the open questions list", () => {
    const w = mount(SecretsSection, {
      props: { secrets: [], questions: [] },
      slots: { default: "<div data-testid='inline'>detail</div>" },
      global: { stubs: { QuestionsList: { template: "<div data-testid='questions' />" } } },
    });
    const html = w.html();
    expect(html).toContain("data-testid=\"inline\"");
    expect(html.indexOf("data-testid=\"inline\"")).toBeLessThan(html.indexOf("data-testid=\"questions\""));
  });

  // Bug caught (#1255 item 10): revealed secrets stayed in the middle of the ledger, so it did not read "still to find" first.
  it("lists revealed secrets after the ones still to find", () => {
    const secrets = [
      canonEntry({ id: "a", part: "secret", title: "Revealed one", revealed_at: "t" }),
      canonEntry({ id: "b", part: "secret", title: "Hidden one" }),
    ];
    const w = mount(SecretsSection, { props: { secrets, questions: [] }, global: { stubs: { QuestionsList: true } } });
    const rows = w.get("[data-testid=secret-ledger]").findAll("li");
    expect(rows[0].text()).toContain("Hidden one");
    expect(rows[1].text()).toContain("Revealed one");
  });
});
