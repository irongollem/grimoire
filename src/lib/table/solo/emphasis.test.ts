import { describe, expect, it } from "vitest";
import { emphasisRuns } from "./emphasis";

const plain = (text: string) => ({ text, strong: false, em: false });

describe("emphasisRuns", () => {
  // Bug caught live (17 Nov 2026): "Je bent in **The Middle**" printed with its stars.
  it("sets words between two stars in strong print, without the stars", () => {
    expect(emphasisRuns("You are in **The Middle**, in The Well.")).toEqual([
      plain("You are in "),
      { text: "The Middle", strong: true, em: false },
      plain(", in The Well."),
    ]);
  });

  it("sets words between single stars or underscores in emphasis", () => {
    expect(emphasisRuns("She says it *softly* and _slowly_.").filter((r) => r.em).map((r) => r.text)).toEqual(["softly", "slowly"]);
  });

  // Bug caught: a lone star or a multiplication ("2 * 3 * 4") swallowing the text between as emphasis.
  it("leaves stars that mark nothing as they were written", () => {
    expect(emphasisRuns("2 * 3 * 4 is 24, and a lone * too")).toEqual([plain("2 * 3 * 4 is 24, and a lone * too")]);
  });

  // Bug caught: an underscore inside a word (snake_case, a file_name) read as emphasis.
  it("leaves underscores inside words alone", () => {
    expect(emphasisRuns("the file_name_here stays")).toEqual([plain("the file_name_here stays")]);
  });

  it("returns text with no marks as one plain run, and nothing for empty text", () => {
    expect(emphasisRuns("Rain starts to fall.")).toEqual([plain("Rain starts to fall.")]);
    expect(emphasisRuns("")).toEqual([]);
  });
});
