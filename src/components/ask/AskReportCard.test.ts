// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskReportDraft } from "@edge-shared/agent/askContract";
import AskReportCard from "./AskReportCard.vue";

const bug: AskReportDraft = { kind: "bug", where: "Encounters", action: "Pressed next", expected: "Next turn", actual: "Nothing happened" };
const feature: AskReportDraft = { kind: "feature", where: "", summary: "Dark mode", problem: "Eyes hurt" };

describe("AskReportCard", () => {
  // Bug caught: the button not handing the DM to the form, so a drafted report goes nowhere.
  it("emits review when the button is pressed, and only then", async () => {
    const w = mount(AskReportCard, { props: { report: bug } });
    expect(w.emitted("review")).toBeUndefined();
    await w.get('[data-testid="ask-report-review"]').trigger("click");
    expect(w.emitted("review")).toHaveLength(1);
  });

  // Bug caught: a feature drawn with bug labels (or the reverse), so the DM reviews the wrong kind of report.
  it("labels each kind with its own fields", () => {
    const b = mount(AskReportCard, { props: { report: bug } });
    expect(b.text()).toContain("Bug report");
    expect(b.text()).toContain("What happened");
    expect(b.text()).toContain("Nothing happened");
    const f = mount(AskReportCard, { props: { report: feature } });
    expect(f.text()).toContain("Feature request");
    expect(f.text()).toContain("What you want");
    expect(f.text()).toContain("Why");
    // An empty optional "Where" is not drawn as a blank row.
    expect(f.text()).not.toContain("Where");
  });

  // Bug caught: the card dropping the line that says it files nothing.
  it("says nothing is sent until the form's Send", () => {
    expect(mount(AskReportCard, { props: { report: bug } }).text()).toContain("Nothing is sent until you press Send in the form.");
  });
});
