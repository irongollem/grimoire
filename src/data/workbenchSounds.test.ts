import { describe, expect, it } from "vitest";
import { WORKBENCH_BENCH_FOR, WORKBENCH_BENCHES } from "@/data/workbenchArt";
import { WORKBENCH_STINGS, WORKBENCH_WORK_SOUNDS } from "@/data/workbenchSounds";

describe("workbench sounds", () => {
  it("has a work sound for every bench a discipline uses", () => {
    expect(Object.keys(WORKBENCH_WORK_SOUNDS).sort()).toEqual(Object.keys(WORKBENCH_BENCHES).sort());
    for (const bench of Object.values(WORKBENCH_BENCH_FOR)) expect(WORKBENCH_WORK_SOUNDS[bench]).toBeDefined();
  });

  it("has the three stings", () => {
    expect(Object.keys(WORKBENCH_STINGS).sort()).toEqual(["critical", "failure", "success"]);
  });
});
