import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RelationshipMark from "./RelationshipMark.vue";

describe("RelationshipMark", () => {
  it("names the relationship and tints it from the shared ramp", () => {
    const w = mount(RelationshipMark, { props: { relationship: "hostile" } });
    expect(w.text()).toBe("hostile");
    expect(w.classes().join(" ")).toContain("relationship-hostile");
  });
});
