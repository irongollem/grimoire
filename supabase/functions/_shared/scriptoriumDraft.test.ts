import { describe, expect, it } from "vitest";
import {
  assembleContext,
  buildFactionBlock,
  buildLocationBlock,
  buildNpcBlock,
  buildSessionBlock,
  clip,
  factionLinkWord,
  CONTEXT_CHAR_LIMIT,
  isValidKindSubject,
  parseDraftOutput,
  sanitizeDraftHtml,
  sessionNoteAllowed,
  subjectRefusal,
  validateDraftRequest,
  type DraftFaction,
  type DraftLocation,
  type DraftNote,
  type DraftNpc,
  type FactionHolding,
  type FactionMember,
  type FactionRelationRow,
} from "./scriptoriumDraft";

const npc: DraftNpc = {
  id: "n1", name: "Mara Voss", race: "Human", occupation: "Harbourmaster",
  appearance: "Weathered, grey braid", personality: "Cold and exact", backstory: "Secretly sells maps",
  player_visible_to: ["p1"],
  player_visible_fields: ["name", "race", "occupation"],
  disguise_name: null, disguise_portrait_url: null, is_revealed: false, location_id: null,
};
const faction = (id: string, name: string, shared: boolean): DraftFaction => ({
  id, name, faction_type: "Guild", alignment: "Neutral", description: "A trading guild",
  player_visible_to: shared ? ["p1"] : [],
});
const loc = (shared: boolean): DraftLocation => ({
  id: "l1", name: "Saltgate", location_type: "City", description: "Hidden smuggler tunnels",
  is_description_shared: shared, player_visible_to: ["p1"],
});
const note = (id: string, shared: boolean, title = id): DraftNote => ({
  id, title, content: `content of ${id}`, session_id: "s1", session: { number: 3 }, session_real_date: "2026-09-01",
  player_visible_to: shared ? ["p1"] : [],
});

describe("validateDraftRequest", () => {
  const ok = { campaign_id: "c", kind: "handout", subject: { type: "npc", id: "n" }, audience: "players" };
  it("accepts a valid body and trims the steer", () => {
    const r = validateDraftRequest({ ...ok, prompt: "  a letter  " });
    expect(r).toMatchObject({ ok: true, value: { kind: "handout", subjectType: "npc", prompt: "a letter" } });
  });
  it("rejects bad kind, audience, subject and mismatched pairs", () => {
    expect(validateDraftRequest({ ...ok, kind: "poem" }).ok).toBe(false);
    expect(validateDraftRequest({ ...ok, audience: "everyone" }).ok).toBe(false);
    expect(validateDraftRequest({ ...ok, subject: { type: "npc" } }).ok).toBe(false);
    expect(validateDraftRequest({ ...ok, kind: "faction_dossier" }).ok).toBe(false);
    expect(validateDraftRequest({ ...ok, kind: "session_recap" }).ok).toBe(false);
    expect(validateDraftRequest(null).ok).toBe(false);
  });
  it("pairs kinds with subjects", () => {
    expect(isValidKindSubject("handout", "location")).toBe(true);
    expect(isValidKindSubject("faction_dossier", "faction")).toBe(true);
    expect(isValidKindSubject("session_recap", "session")).toBe(true);
    expect(isValidKindSubject("session_recap", "npc")).toBe(false);
  });
});

describe("context blocks", () => {
  it("withholds NPC secrets and hidden factions from players", () => {
    const text = buildNpcBlock(npc, [faction("f1", "Tide Guild", true), faction("f2", "Black Ledger", false)], "players");
    expect(text).toContain("Harbourmaster");
    expect(text).not.toContain("Weathered");
    expect(text).toContain("Tide Guild");
    expect(text).not.toContain("Secretly");
    expect(text).not.toContain("Cold and exact");
    expect(text).not.toContain("Black Ledger");
  });
  it("gives the DM everything", () => {
    const text = buildNpcBlock(npc, [faction("f2", "Black Ledger", false)], "dm");
    expect(text).toContain("Secretly sells maps");
    expect(text).toContain("Black Ledger");
  });
  it("only describes a location to players when it is shared", () => {
    expect(buildLocationBlock(loc(false), "The Coast", "players")).not.toContain("tunnels");
    expect(buildLocationBlock(loc(true), "The Coast", "players")).toContain("tunnels");
    expect(buildLocationBlock(loc(false), null, "dm")).toContain("tunnels");
  });
  it("filters a faction's related entities for players", () => {
    const hidden: DraftNpc = { ...npc, id: "n2", name: "Hidden Spy", player_visible_to: [] };
    const text = buildFactionBlock(
      faction("f1", "Tide Guild", true),
      [{ npc, role: "Leader", status: "active", locationSharesNpcs: false },
        { npc: hidden, role: "Spy", status: "active", locationSharesNpcs: false }],
      [{ location: loc(true), word: "controls", notes: "secret vault" }],
      [{ target: faction("f2", "Black Ledger", false), word: "hostile to", notes: null }],
      "players",
    );
    expect(text).toContain("Mara Voss");
    expect(text).not.toContain("Hidden Spy");
    expect(text).toContain("Saltgate");
    expect(text).not.toContain("secret vault");
    expect(text).not.toContain("Black Ledger");
  });
  it("words a faction's holdings and stances from its own side", () => {
    const text = buildFactionBlock(
      faction("f1", "Tide Guild", true),
      [],
      [{ location: loc(true), word: "controls", notes: null }],
      [{ target: faction("f2", "Black Ledger", true), word: "seen as a rival by", notes: null }],
      "players",
    );
    expect(text).toContain("- controls Saltgate");
    expect(text).toContain("- seen as a rival by Black Ledger");
  });
  it("reads a link from the faction's end with the catalogue's words", () => {
    expect(factionLinkWord("location", "controls", true)).toBe("controls");
    expect(factionLinkWord("location", "controls", false)).toBe("controlled by");
    expect(factionLinkWord("faction", "rival", true)).toBe("rival of");
    expect(factionLinkWord("faction", "rival", false)).toBe("seen as a rival by");
    expect(factionLinkWord("faction", "no_such_type", true)).toBeNull();
    expect(factionLinkWord("location", "rival", true)).toBeNull();
  });
  it("shows a disguised NPC under its disguise to players, never the true name or backstory", () => {
    const disguised: DraftNpc = { ...npc, disguise_name: "Old Tobias", is_revealed: false };
    const text = buildNpcBlock(disguised, [], "players");
    expect(text).toContain("Old Tobias");
    expect(text).not.toContain("Mara Voss");
    expect(text).not.toContain("Secretly");
    const faction1 = buildFactionBlock(
      faction("f1", "Tide Guild", true),
      [{ npc: disguised, role: "Leader", status: "active", locationSharesNpcs: false }],
      [], [], "players",
    );
    expect(faction1).toContain("Old Tobias");
    expect(faction1).not.toContain("Mara Voss");
    // Once revealed, the true name shows; a DM draft always does.
    expect(buildNpcBlock({ ...disguised, is_revealed: true }, [], "players")).toContain("Mara Voss");
    expect(buildNpcBlock(disguised, [], "dm")).toContain("Mara Voss");
  });
  it("hides fields the projection does not share, and an unshared name", () => {
    const text = buildNpcBlock({ ...npc, player_visible_fields: ["occupation"] }, [], "players");
    expect(text).not.toContain("Mara Voss");
    expect(text).not.toContain("Human");
    expect(text).toContain("Harbourmaster");
  });
  it("shows a players draft the occupation only when that field is shared, and no alignment", () => {
    const nameOnly = buildNpcBlock({ ...npc, player_visible_fields: ["name"] }, [], "players");
    expect(nameOnly).toContain("Mara Voss");
    expect(nameOnly).not.toContain("Harbourmaster");
    const f = buildFactionBlock(faction("f1", "Tide Guild", true), [], [], [], "players");
    expect(f).not.toContain("Neutral");
    expect(buildFactionBlock(faction("f1", "Tide Guild", true), [], [], [], "dm")).toContain("Neutral");
  });

  it("gives a DM draft the unshared members, holdings and relations with their notes; a players draft none of them", () => {
    const hidden: DraftNpc = { ...npc, id: "n2", name: "Hidden Spy", player_visible_to: [] };
    const unsharedPlace: DraftLocation = { ...loc(true), name: "Smuggler Cove", player_visible_to: [] };
    const members: FactionMember[] = [{ npc: hidden, role: "Spy", status: null, locationSharesNpcs: false }];
    const holdings: FactionHolding[] = [{ location: unsharedPlace, word: "controls", notes: "tunnels under the quay" }];
    const relations: FactionRelationRow[] = [{ target: faction("f2", "Black Ledger", false), word: "hostile to", notes: "owes them money" }];
    const args = [faction("f1", "Tide Guild", true), members, holdings, relations] as const;
    const dm = buildFactionBlock(...args, "dm");
    expect(dm).toContain("Hidden Spy");
    expect(dm).toContain("controls Smuggler Cove: tunnels under the quay");
    expect(dm).toContain("hostile to Black Ledger: owes them money");
    const players = buildFactionBlock(...args, "players");
    for (const secret of ["Hidden Spy", "Smuggler Cove", "tunnels under the quay", "Black Ledger", "owes them money"]) {
      expect(players).not.toContain(secret);
    }
  });

  it("shows players a shared relation and holding without the DM's private notes on them", () => {
    const text = buildFactionBlock(
      faction("f1", "Tide Guild", true),
      [],
      [{ location: loc(true), word: "controls", notes: "tunnels under the quay" }],
      [{ target: faction("f2", "Black Ledger", true), word: "hostile to", notes: "owes them money" }],
      "players",
    );
    expect(text).toContain("- hostile to Black Ledger");
    expect(text).toContain("- controls Saltgate");
    expect(text).not.toContain("owes them money");
    expect(text).not.toContain("tunnels under the quay");
  });

  it("does not repeat the subject note when it also appears among its siblings", () => {
    const text = buildSessionBlock(note("a", true), [note("a", true), note("b", true)], "dm");
    expect(text.match(/content of a/g)).toHaveLength(1);
  });

  it("lists a member shared only through its location, and drops an unshared one", () => {
    const viaLocation: DraftNpc = { ...npc, id: "n3", name: "Via Location", player_visible_to: [] };
    const text = buildFactionBlock(
      faction("f1", "Tide Guild", true),
      [{ npc: viaLocation, role: null, status: null, locationSharesNpcs: true }],
      [], [], "players",
    );
    expect(text).toContain("Via Location");
  });
  it("refuses an unshared subject for players, never for the DM", () => {
    const unshared = { player_visible_to: [] };
    for (const t of ["npc", "location", "faction"] as const) {
      expect(subjectRefusal("players", t, unshared)).toContain("isn't shared with your players yet");
      expect(subjectRefusal("dm", t, unshared)).toBeNull();
      expect(subjectRefusal("players", t, { player_visible_to: ["p1"] })).toBeNull();
    }
    expect(subjectRefusal("players", "npc", unshared, true)).toBeNull();
  });
  it("keeps only shared session notes for players", () => {
    const text = buildSessionBlock(note("a", true), [note("b", false), note("c", true)], "players");
    expect(text).toContain("content of a");
    expect(text).toContain("content of c");
    expect(text).not.toContain("content of b");
    expect(sessionNoteAllowed(note("b", false), "players")).toBe(false);
    expect(sessionNoteAllowed(note("b", false), "dm")).toBe(true);
  });
  it("caps blocks and the whole context, cutting only what is over", () => {
    expect(clip("x".repeat(5000)).length).toBeLessThanOrEqual(2001);
    expect(clip("x".repeat(2000))).toBe("x".repeat(2000));
    expect(assembleContext(["y".repeat(9000), "z".repeat(9000)]).length).toBeLessThanOrEqual(CONTEXT_CHAR_LIMIT + 1);
    expect(assembleContext(["y".repeat(CONTEXT_CHAR_LIMIT)])).toBe("y".repeat(CONTEXT_CHAR_LIMIT));
  });
  it("flattens Tiptap JSON", () => {
    const json = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] });
    expect(clip(json)).toBe("Hello");
  });
});

describe("sanitizeDraftHtml", () => {
  it("keeps allowed tags and strips attributes", () => {
    expect(sanitizeDraftHtml('<h1 class="x" onclick="evil()">Title</h1><p style="color:red">Hi <strong>you</strong></p>'))
      .toBe("<h1>Title</h1><p>Hi <strong>you</strong></p>");
  });
  it("drops scripts and styles with their content", () => {
    const out = sanitizeDraftHtml("<p>ok</p><script>alert(1)</script><style>p{}</style>");
    expect(out).toBe("<p>ok</p>");
  });
  it.each(["iframe", "object", "embed", "noscript", "template", "svg", "math"])(
    "drops <%s> with everything inside it",
    (tag) => {
      expect(sanitizeDraftHtml(`<p>ok</p><${tag}>payload</${tag}>`)).toBe("<p>ok</p>");
    },
  );

  it("writes a line break once and ignores a stray closing one", () => {
    expect(sanitizeDraftHtml("<p>a<br>b</br>c</p>")).toBe("<p>a<br>bc</p>");
  });

  it("removes non-whitelisted tags but keeps their text", () => {
    expect(sanitizeDraftHtml('<div><a href="javascript:x">link</a><img src=x onerror=y></div>')).toBe("link");
  });
  it("escapes stray angle brackets and drops comments", () => {
    expect(sanitizeDraftHtml("<p>a < b <!-- hidden --></p>")).toBe("<p>a &lt; b </p>");
  });
  it("rejects empty output", () => {
    expect(sanitizeDraftHtml("")).toBeNull();
    expect(sanitizeDraftHtml("<script>x</script><p>  </p>")).toBeNull();
    expect(sanitizeDraftHtml("<hr>")).toBeNull();
    expect(sanitizeDraftHtml("<p>a</p><hr><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });
});

describe("parseDraftOutput", () => {
  it("parses and sanitises", () => {
    expect(parseDraftOutput(JSON.stringify({ title: " A Letter ", html: "<p onclick=x>Dear friend</p>" })))
      .toEqual({ title: "A Letter", html: "<p>Dear friend</p>" });
  });
  it("cuts a title at 120 characters and strips markup from it", () => {
    const out = parseDraftOutput(JSON.stringify({ title: `<b>${"t".repeat(300)}</b>`, html: "<p>x</p>" }));
    expect(out?.title).toBe("t".repeat(120));
  });

  it("rejects malformed or empty output", () => {
    expect(parseDraftOutput("nope")).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ title: "T", html: "<script>x</script>" }))).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ title: "", html: "<p>x</p>" }))).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ html: "<p>x</p>" }))).toBeNull();
  });
});
