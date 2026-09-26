import { describe, it, expect } from "vitest";
import { itemScopeOf } from "./itemScope";

const ACTIVE = "dddebe6d-10ca-4404-9df2-a6e447a6c9aa";
const OTHER = "aaaaaaaa-10ca-4404-9df2-a6e447a6c9aa";
const OWNED = "bbbbbbbb-10ca-4404-9df2-a6e447a6c9aa";
const LIBRARY_ID = "srd_grimoire_bundled_forgery_kit";

describe("itemScopeOf", () => {
  it("classifies a non-UUID id as library regardless of its stamped campaign_id", () => {
    // normalizeLibraryItem always stamps campaign_id: null, so id shape (not
    // scope) is what tells a library row apart from a general one.
    expect(itemScopeOf({ id: LIBRARY_ID, campaign_id: null }, ACTIVE)).toBe("library");
  });

  it("classifies a UUID row with no campaign as general", () => {
    expect(itemScopeOf({ id: OWNED, campaign_id: null }, ACTIVE)).toBe("general");
  });

  it("classifies a UUID row scoped to the active campaign as campaign", () => {
    expect(itemScopeOf({ id: OWNED, campaign_id: ACTIVE }, ACTIVE)).toBe("campaign");
  });

  it("classifies a UUID row scoped to a different campaign as other_campaign", () => {
    expect(itemScopeOf({ id: OWNED, campaign_id: OTHER }, ACTIVE)).toBe("other_campaign");
  });

  it("classifies a campaign-scoped row as other_campaign when there is no active campaign", () => {
    expect(itemScopeOf({ id: OWNED, campaign_id: OTHER }, null)).toBe("other_campaign");
  });
});
