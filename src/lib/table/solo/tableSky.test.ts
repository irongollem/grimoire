import { describe, expect, it } from "vitest";
import { parseSky } from "../../../../supabase/functions/_shared/agent/sky";
import { tableSky } from "./tableSky";

describe("tableSky", () => {
  // Bug caught: the hazard's sentence for a person ("three days of heavy snow, now thawing") sent along, which the
  // server refuses as words of the page's own, so every turn on a dangerous day fails.
  it("sends the sky and its dangers in the fixed words the server accepts", () => {
    const sent = tableSky({ temperature: "cool", precipitation: "snow", wind: "gale", fog: false }, [{ kind: "avalanche", level: "moderate", reason: "three days of heavy snow, now thawing" }]);
    expect(sent).toEqual({ temperature: "cool", precipitation: "snow", wind: "gale", fog: false, dangers: [{ kind: "avalanche", level: "moderate" }] });
    expect(parseSky(sent)).toEqual(sent);
  });

  // Bug caught: an underground scene told of rain overhead as if it fell on the party.
  it("sends nothing where there is no sky to tell", () => {
    expect(tableSky(null, [])).toBeNull();
  });
});
