import { describe, expect, it } from "vitest";
import {
  assembleContext,
  buildFactionBlock,
  buildLocationBlock,
  buildNpcBlock,
  buildSessionBlock,
  clip,
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
  id, title, content: `content of ${id}`, session_num: 3, session_real_date: "2026-09-01",
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
      [{ location: loc(true), notes: "secret vault" }],
      [{ target: faction("f2", "Black Ledger", false), relation_type: "enemy", notes: null }],
      "players",
    );
    expect(text).toContain("Mara Voss");
    expect(text).not.toContain("Hidden Spy");
    expect(text).toContain("Saltgate");
    expect(text).not.toContain("secret vault");
    expect(text).not.toContain("Black Ledger");
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
  it("caps blocks and the whole context", () => {
    expect(clip("x".repeat(5000)).length).toBeLessThanOrEqual(2001);
    expect(assembleContext(["y".repeat(9000), "z".repeat(9000)]).length).toBeLessThanOrEqual(CONTEXT_CHAR_LIMIT + 1);
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
  it("rejects malformed or empty output", () => {
    expect(parseDraftOutput("nope")).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ title: "T", html: "<script>x</script>" }))).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ title: "", html: "<p>x</p>" }))).toBeNull();
    expect(parseDraftOutput(JSON.stringify({ html: "<p>x</p>" }))).toBeNull();
  });
});
