import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const matches = ref<string[]>([]);
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useAbove: (bp: string) => ({ get value() { return matches.value.includes(bp); } }),
}));

import { pickBreakpointColumns, useBreakpointColumns } from "./useGridColumns";

describe("useBreakpointColumns", () => {
  it("follows the matching breakpoints", () => {
    const cols = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
    matches.value = [];
    expect(cols.value).toBe(1);
    matches.value = ["sm", "md"];
    expect(cols.value).toBe(2);
    matches.value = ["sm", "md", "lg", "xl"];
    expect(cols.value).toBe(4);
  });
});

describe("pickBreakpointColumns", () => {
  const spec = { base: 1, sm: 2, lg: 3, xl: 4 };
  const at = (...on: string[]) => (bp: string) => on.includes(bp);

  it("uses base below every breakpoint", () => {
    expect(pickBreakpointColumns(spec, at())).toBe(1);
  });
  it("takes the largest matching breakpoint, skipping ones the spec omits", () => {
    expect(pickBreakpointColumns(spec, at("sm"))).toBe(2);
    expect(pickBreakpointColumns(spec, at("sm", "md"))).toBe(2);
    expect(pickBreakpointColumns(spec, at("sm", "md", "lg"))).toBe(3);
    expect(pickBreakpointColumns(spec, at("sm", "md", "lg", "xl", "2xl"))).toBe(4);
  });
});
