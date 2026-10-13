import { describe, expect, it } from "vitest";
import { disclosedSecretLabels } from "./disclosedSecrets";

const names: Record<string, string> = { n1: "Bram", n2: "Wren" };
const label = (id: string) => names[id];
const sessions = [{ id: "s14", number: 14 }, { id: "s15", number: 15 }];

describe("disclosedSecretLabels", () => {
  it("names the session and the NPC", () => {
    const map = disclosedSecretLabels([{ secret_id: "x", npc_id: "n1", session_id: "s14", created_at: "2026-01-02" }], sessions, label);
    expect(map.get("x")).toBe("known since Session 14 (Bram)");
  });

  it("keeps the earliest memory when a secret is disclosed twice", () => {
    const map = disclosedSecretLabels(
      [
        { secret_id: "x", npc_id: "n2", session_id: "s15", created_at: "2026-02-01" },
        { secret_id: "x", npc_id: "n1", session_id: "s14", created_at: "2026-01-01" },
      ],
      sessions,
      label,
    );
    expect(map.get("x")).toBe("known since Session 14 (Bram)");
  });

  it("falls back to the party when there is no session or it is unknown", () => {
    const map = disclosedSecretLabels(
      [
        { secret_id: "a", npc_id: "n1", session_id: null, created_at: "2026-01-01" },
        { secret_id: "b", npc_id: "n1", session_id: "gone", created_at: "2026-01-01" },
      ],
      sessions,
      label,
    );
    expect(map.get("a")).toBe("known to the party (Bram)");
    expect(map.get("b")).toBe("known to the party (Bram)");
  });

  it("omits the parenthesis for an unknown NPC", () => {
    const map = disclosedSecretLabels([{ secret_id: "x", npc_id: "zz", session_id: null, created_at: "2026-01-01" }], sessions, label);
    expect(map.get("x")).toBe("known to the party");
  });
});
