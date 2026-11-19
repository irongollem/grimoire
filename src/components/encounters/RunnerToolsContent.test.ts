import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import RunnerToolsContent from "./RunnerToolsContent.vue";
import { useRunnerAutopilot } from "@/composables/encounters/useRunnerAutopilot";

const stubs = { RunnerSurprisePanel: true, RunnerBossMechanics: true, RunnerDmTools: true, RunnerSpawnPanel: true, DmNoteBox: true };

beforeEach(() => {
  setActivePinia(createPinia());
  useRunnerAutopilot().value = false;
});

// #1021 row 5a: on the phone and the Play screen this is the only Autopilot switch there is.
describe("RunnerToolsContent", () => {
  it("its Autopilot switch turns on the flag the runner's turn loop reads", async () => {
    const wrapper = mount(RunnerToolsContent, { props: { encounterId: "e1", selectedTrapId: null }, global: { stubs } });
    await wrapper.find('[data-testid="runner-autopilot"] input, input[data-testid="runner-autopilot"]').setValue(true);
    expect(useRunnerAutopilot().value).toBe(true);
  });
});
