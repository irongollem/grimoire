import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PeopleCompanyStrip from "./PeopleCompanyStrip.vue";

vi.mock("@/composables/party/useFormPortraits", () => ({
  useFormPortraits: () => () => ({ src: null, focalPoint: null, shaped: false }),
}));

function mountStrip(canAdd: boolean) {
  return mount(PeopleCompanyStrip, {
    props: { entries: [], viewerMemberId: canAdd ? "pm1" : null, showHp: () => false, canAdd },
    global: { stubs: { FocalImage: true } },
  });
}

describe("PeopleCompanyStrip", () => {
  // The add-companion "+" ends the company's rubric, and only for a viewer who
  // plays a character here: a companion belongs to a member, so without one the
  // form would open with nobody to attach it to.
  it("offers the add-companion button only when the viewer may add one, and emits add", async () => {
    expect(mountStrip(false).find('[aria-label="Add companion"]').exists()).toBe(false);

    const w = mountStrip(true);
    await w.find('[aria-label="Add companion"]').trigger("click");
    expect(w.emitted("add")).toHaveLength(1);
  });
});
