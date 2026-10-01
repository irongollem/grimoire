import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import RulesetBounceDialog from "./RulesetBounceDialog.vue";

const convertCopy = vi.hoisted(() => vi.fn());
// A plain function, not the spy: a spy that returns a rejected promise is reported by the runner as an unhandled error even when the caller handles it.
let convertFails = false;
async function mutateAsync(input: { partyMemberId: string; ruleset: string }): Promise<string> {
  if (convertFails) throw new Error("No credits");
  return convertCopy(input);
}
vi.mock("@/composables/party/useCharacterRuleset", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/party/useCharacterRuleset")>();
  return { ...actual, useConvertCharacterCopy: () => ({ mutateAsync }) };
});

const Shell = defineComponent({ template: "<div><slot /></div>" });
const Header = defineComponent({
  props: { title: String, subtitle: String },
  template: "<header><h2>{{ title }}</h2><p>{{ subtitle }}</p></header>",
});

function mountDialog(bring: (id: string) => Promise<void>) {
  return mount(RulesetBounceDialog, {
    props: {
      open: true,
      character: { id: "c1", name: "Mira", ruleset: "2024" as const },
      campaignRuleset: "2014" as const,
      campaignName: null,
      bring,
    },
    global: { stubs: { AppModal: Shell, ModalHeader: Header } },
  });
}

function button(wrapper: ReturnType<typeof mountDialog>, label: string) {
  const found = wrapper.findAll("button").find((b) => b.text().includes(label));
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

describe("RulesetBounceDialog", () => {
  beforeEach(() => {
    convertCopy.mockReset();
    convertFails = false;
  });

  it("names both editions", () => {
    const wrapper = mountDialog(vi.fn());
    expect(wrapper.text()).toContain("This table plays the 2014 rules");
    expect(wrapper.text()).toContain("Mira is built with the 2024 rules");
    expect(wrapper.text()).toContain("plays the 2014 rules and does not take characters built with the 2024 rules");
    expect(wrapper.text()).not.toContain("D&D 5e");
  });

  it("converts a copy, brings it, then emits joined with the new id", async () => {
    const order: string[] = [];
    convertCopy.mockImplementation(async () => {
      order.push("convert");
      return "copy-1";
    });
    const bring = vi.fn(async (id: string) => {
      order.push(`bring:${id}`);
    });
    const wrapper = mountDialog(bring);
    await button(wrapper, "Convert a copy and join").trigger("click");
    await flushPromises();
    expect(convertCopy).toHaveBeenCalledWith({ partyMemberId: "c1", ruleset: "2014" });
    expect(order).toEqual(["convert", "bring:copy-1"]);
    expect(wrapper.emitted("joined")).toEqual([["copy-1"]]);
  });

  it("says the copy is in the pool when bring fails after the copy was made", async () => {
    convertCopy.mockResolvedValue("copy-1");
    const wrapper = mountDialog(vi.fn().mockRejectedValue(new Error("Seat taken")));
    await button(wrapper, "Convert a copy and join").trigger("click");
    await flushPromises();
    const message = wrapper.get("[data-testid='bounce-error']").text();
    expect(message).toContain("is in your pool");
    expect(message).toContain("Seat taken");
    expect(wrapper.emitted("joined")).toBeUndefined();
  });

  it("shows a failed copy inline and does not bring", async () => {
    convertFails = true;
    const bring = vi.fn();
    const wrapper = mountDialog(bring);
    await button(wrapper, "Convert a copy and join").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid='bounce-error']").text()).toContain("could not be made");
    expect(bring).not.toHaveBeenCalled();
  });

  it("emits chooseAnother", async () => {
    const wrapper = mountDialog(vi.fn());
    await button(wrapper, "Choose another character").trigger("click");
    expect(wrapper.emitted("chooseAnother")).toHaveLength(1);
  });
});
