import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), reorder: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useUpdateCanonEntry: () => ({ mutateAsync: mocks.reorder }),
}));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: ref([]) }) }));

import SecretsSection from "./SecretsSection.vue";

const mountSection = () => mount(SecretsSection, { props: { secrets: [], questions: [] }, global: { stubs: { QuestionsList: true } } });

describe("SecretsSection", () => {
  beforeEach(() => setActivePinia(createPinia()));
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

describe("SecretsSection find and order (#1255 item 11)", () => {
  beforeEach(() => { setActivePinia(createPinia()); mocks.reorder.mockReset(); mocks.reorder.mockResolvedValue(undefined); });
  const secret = (id: string, order: number, revealed = false) => canonEntry({ id, part: "secret", title: id, sort_order: order, revealed_at: revealed ? "t" : null });
  const list = [secret("s1", 0), secret("s2", 1, true), secret("s3", 2)];
  const mountList = (props: Record<string, unknown> = {}) => mount(SecretsSection, { props: { secrets: list, questions: [], ...props }, global: { stubs: { QuestionsList: true } } });

  // Bug caught: a secret moving past a revealed one, where the ledger (revealed after the rest) would show no change.
  it("moves a secret among those in its own state, never past a revealed one", async () => {
    await mountList().find("button[aria-label='Move s3 up']").trigger("click");
    await flushPromises();
    expect(mocks.reorder.mock.calls.map(([c]) => [c.id, c.patch.sort_order])).toEqual([["s3", 0], ["s1", 2]]);
  });

  it("gives the last unrevealed secret no Down, since the revealed one after it is not in its group", () => {
    expect(mountList().find("button[aria-label='Move s3 down']").attributes("disabled")).toBeDefined();
  });

  it("offers no move buttons under an arc", () => {
    expect(mountList({ arcLabel: "The guild" }).find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  it("narrows by title once there are more than five secrets", async () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((t, i) => secret(`x-${t}`, i));
    const w = mountList({ secrets: many });
    await w.find("input[type=search]").setValue("x-d");
    expect(w.findAll("[data-testid=secret-ledger] li")).toHaveLength(1);
  });
});
