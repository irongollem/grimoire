import { describe, it, expect } from "vitest";
import { documentScopeOf, isDocumentUsableIn } from "./documentScope";

describe("documentScopeOf", () => {
  it("classifies an account-wide document as general", () => {
    expect(documentScopeOf({ campaign_id: null }, "campaign-a")).toBe("general");
    expect(documentScopeOf({ campaign_id: null }, null)).toBe("general");
  });

  it("classifies a document scoped to the active campaign as campaign", () => {
    expect(documentScopeOf({ campaign_id: "campaign-a" }, "campaign-a")).toBe("campaign");
  });

  it("classifies a document scoped to a different campaign as other_campaign", () => {
    expect(documentScopeOf({ campaign_id: "campaign-b" }, "campaign-a")).toBe("other_campaign");
  });

  it("classifies a campaign-scoped document as other_campaign when there is no active campaign", () => {
    expect(documentScopeOf({ campaign_id: "campaign-b" }, null)).toBe("other_campaign");
  });
});

describe("isDocumentUsableIn", () => {
  it("is usable when account-wide, regardless of active campaign", () => {
    expect(isDocumentUsableIn({ campaign_id: null }, "campaign-a")).toBe(true);
    expect(isDocumentUsableIn({ campaign_id: null }, null)).toBe(true);
  });

  it("is usable when scoped to the given campaign", () => {
    expect(isDocumentUsableIn({ campaign_id: "campaign-a" }, "campaign-a")).toBe(true);
  });

  it("is not usable when scoped to a different campaign", () => {
    expect(isDocumentUsableIn({ campaign_id: "campaign-b" }, "campaign-a")).toBe(false);
    expect(isDocumentUsableIn({ campaign_id: "campaign-b" }, null)).toBe(false);
  });
});
