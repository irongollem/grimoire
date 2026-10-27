import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseFake } from "./supabaseFake";

// The fake is only worth having if a filter that is wrong in the code under
// test shows up as a wrong result. Each test names the way the fake could lie.

const fake = createSupabaseFake();
const db = fake.client;

const quests = [
  { id: "q1", user_id: "u1", rank: 1, closed_at: null, title: "A" },
  { id: "q2", user_id: "u2", rank: 2, closed_at: "2026-01-01", title: "B" },
  { id: "q3", user_id: "u1", rank: 3, closed_at: null, title: "C" },
];

beforeEach(() => {
  fake.reset();
  fake.seed("quests", quests);
});

async function ids(query: PromiseLike<{ data: unknown }>): Promise<unknown[]> {
  const { data } = await query;
  return (data as { id: string }[]).map((row) => row.id);
}

describe("filters", () => {
  it("eq returns only the matching rows, so a missing scope filter shows up as a foreign row", async () => {
    expect(await ids(db.from("quests").select("*").eq("user_id", "u1"))).toEqual(["q1", "q3"]);
  });

  it("eq on a column no row has matches nothing instead of everything", async () => {
    expect(await ids(db.from("quests").select("*").eq("nope", "u1"))).toEqual([]);
  });

  it("neq drops the equal rows and, like SQL, any row where the column is null", async () => {
    expect(await ids(db.from("quests").select("*").neq("closed_at", "2026-01-01"))).toEqual([]);
    expect(await ids(db.from("quests").select("*").neq("user_id", "u1"))).toEqual(["q2"]);
  });

  it("in with an empty list returns nothing, not everything", async () => {
    expect(await ids(db.from("quests").select("*").in("id", []))).toEqual([]);
    expect(await ids(db.from("quests").select("*").in("id", ["q2", "q3", "ghost"]))).toEqual(["q2", "q3"]);
  });

  it("is(null) matches null columns and not set ones", async () => {
    expect(await ids(db.from("quests").select("*").is("closed_at", null))).toEqual(["q1", "q3"]);
  });

  it("not(is, null) keeps only rows whose column is set, and not(eq) drops the equal ones", async () => {
    expect(await ids(db.from("quests").select("*").not("closed_at", "is", null))).toEqual(["q2"]);
    expect(await ids(db.from("quests").select("*").not("user_id", "eq", "u1"))).toEqual(["q2"]);
  });

  it("contains matches rows whose array column holds every value asked for, and not a scalar or missing column", async () => {
    fake.seed("docs", [
      { id: "d1", shared: ["a", "b"] },
      { id: "d2", shared: ["b"] },
      { id: "d3", shared: null },
      { id: "d4", shared: "a" },
    ]);
    expect(await ids(db.from("docs").select("*").contains("shared", ["b"]))).toEqual(["d1", "d2"]);
    expect(await ids(db.from("docs").select("*").contains("shared", ["a", "b"]))).toEqual(["d1"]);
  });

  it("records the column list a read asked for, so a test can hold a read to named columns", async () => {
    await db.from("quests").select("id, title");
    await db.from("quests").select();
    expect(fake.calls.map((c) => c.columns)).toEqual(["id, title", null]);
  });

  it.each([
    ["gt", 2, ["q3"]],
    ["gte", 2, ["q2", "q3"]],
    ["lt", 2, ["q1"]],
    ["lte", 2, ["q1", "q2"]],
  ] as const)("%s treats the bound as exclusive or inclusive the way SQL does", async (op, bound, expected) => {
    expect(await ids(db.from("quests").select("*")[op]("rank", bound))).toEqual(expected);
  });

  it("a comparison never matches a null column", async () => {
    expect(await ids(db.from("quests").select("*").gte("closed_at", "2000-01-01"))).toEqual(["q2"]);
  });
});

describe("order, limit, range", () => {
  it("order descending reverses ascending", async () => {
    expect(await ids(db.from("quests").select("*").order("rank", { ascending: false }))).toEqual(["q3", "q2", "q1"]);
  });

  it("nulls sort last ascending and first descending, like Postgres", async () => {
    expect(await ids(db.from("quests").select("*").order("closed_at"))).toEqual(["q2", "q1", "q3"]);
    expect(await ids(db.from("quests").select("*").order("closed_at", { ascending: false }))).toEqual(["q1", "q3", "q2"]);
  });

  it("nullsFirst overrides the default, so a descending sort can keep nulls last", async () => {
    // Only q2 has a closed_at.
    expect(await ids(db.from("quests").select("*").order("closed_at", { ascending: false, nullsFirst: false }))).toEqual(["q2", "q1", "q3"]);
    expect(await ids(db.from("quests").select("*").order("closed_at", { nullsFirst: true }))).toEqual(["q1", "q3", "q2"]);
  });

  it("an exact count counts every matching row, not the page; head returns no rows", async () => {
    const page = await db.from("quests").select("*", { count: "exact" }).order("rank").range(0, 0);
    expect(page.count).toBe(3);
    expect((page.data as unknown[]).length).toBe(1);
    const head = await db.from("quests").select("*", { count: "exact", head: true }).eq("user_id", "u1");
    expect(head.data).toBeNull();
    expect(head.count).toBe(2); // q1 and q3
  });

  it("range is inclusive at both ends and limit caps the count", async () => {
    expect(await ids(db.from("quests").select("*").order("rank").range(1, 2))).toEqual(["q2", "q3"]);
    expect(await ids(db.from("quests").select("*").order("rank").limit(1))).toEqual(["q1"]);
  });
});

describe("single and maybeSingle", () => {
  it("single on two rows errors with PGRST116 instead of returning the first", async () => {
    const { data, error } = await db.from("quests").select("*").eq("user_id", "u1").single();
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST116");
  });

  it("single on no rows errors, maybeSingle on no rows is null without an error", async () => {
    expect((await db.from("quests").select("*").eq("id", "ghost").single()).error?.code).toBe("PGRST116");
    expect(await db.from("quests").select("*").eq("id", "ghost").maybeSingle()).toEqual({ data: null, error: null });
  });

  it("maybeSingle on two rows errors", async () => {
    expect((await db.from("quests").select("*").eq("user_id", "u1").maybeSingle()).error?.code).toBe("PGRST116");
  });
});

describe("writes", () => {
  it("update changes only the rows the filter matches", async () => {
    await db.from("quests").update({ title: "X" }).eq("user_id", "u2");
    expect(fake.rows("quests").map((r) => r.title)).toEqual(["A", "X", "C"]);
  });

  it("update whose filter matches nothing changes nothing", async () => {
    await db.from("quests").update({ title: "X" }).eq("id", "ghost");
    expect(fake.rows("quests")).toEqual(quests);
  });

  it("update with no filter at all is refused instead of rewriting the table", async () => {
    const { error } = await db.from("quests").update({ title: "X" });
    expect(error).not.toBeNull();
    expect(fake.rows("quests")).toEqual(quests);
  });

  it("update then select returns the changed row, not the table", async () => {
    const { data } = await db.from("quests").update({ title: "X" }).eq("id", "q1").select().single();
    expect(data).toMatchObject({ id: "q1", title: "X" });
  });

  it("a single update that matches two rows errors and changes neither", async () => {
    const { error } = await db.from("quests").update({ title: "X" }).eq("user_id", "u1").select().single();
    expect(error?.code).toBe("PGRST116");
    expect(fake.rows("quests").map((r) => r.title)).toEqual(["A", "B", "C"]);
  });

  it("delete removes only matching rows and refuses an unfiltered delete", async () => {
    expect((await db.from("quests").delete()).error).not.toBeNull();
    expect(fake.rows("quests")).toHaveLength(3);
    await db.from("quests").delete().in("id", ["q1", "q3"]);
    expect(fake.rows("quests").map((r) => r.id)).toEqual(["q2"]);
  });

  it("insert adds rows and returns copies, so the caller cannot edit the stored row", async () => {
    const row = { id: "q4", user_id: "u1" };
    const { data } = await db.from("quests").insert(row).select().single();
    (data as { user_id: string }).user_id = "hacked";
    row.user_id = "hacked";
    expect(fake.rows("quests").find((r) => r.id === "q4")?.user_id).toBe("u1");
  });

  it("upsert updates the row with the same id and inserts a new one", async () => {
    await db.from("quests").upsert([{ id: "q1", title: "A2" }, { id: "q9", title: "N" }]);
    const rows = fake.rows("quests");
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === "q1")).toMatchObject({ title: "A2", user_id: "u1" });
  });

  it("seed copies its input, so a later edit of the fixture does not change the table", () => {
    const fixture = { id: "z", n: 1 };
    fake.seed("other", [fixture]);
    fixture.n = 2;
    expect(fake.rows("other")).toEqual([{ id: "z", n: 1 }]);
  });
});

describe("rpc and failures", () => {
  it("an rpc nobody registered is an error, not a silent success", async () => {
    const { error } = await db.rpc("mystery", {});
    expect(error?.code).toBe("PGRST202");
  });

  it("a registered rpc returns its handler's data, null when it returns nothing", async () => {
    fake.onRpc("two", () => 2);
    fake.onRpc("nothing", () => undefined);
    expect(await db.rpc("two")).toEqual({ data: 2, error: null });
    expect(await db.rpc("nothing")).toEqual({ data: null, error: null });
  });

  it("failNext fails exactly one call and the next succeeds", async () => {
    fake.failNext("quests", { message: "boom" });
    const { error } = await db.from("quests").select("*");
    expect(error).toMatchObject({ message: "boom", code: "FAKE" });
    expect((await db.from("quests").select("*")).error).toBeNull();
  });

  it("failNext with after lets earlier calls through and fails the chosen one", async () => {
    fake.failNext("quests", { message: "second" }, { after: 1 });
    expect((await db.from("quests").select("*")).error).toBeNull();
    expect((await db.from("quests").select("*")).error?.message).toBe("second");
    expect((await db.from("quests").select("*")).error).toBeNull();
  });

  it("a failed write changes nothing", async () => {
    fake.failNext("quests", { message: "boom" });
    await db.from("quests").delete().eq("id", "q1");
    expect(fake.rows("quests")).toHaveLength(3);
  });

  it("calls records the filters and insert options of a request", async () => {
    await db.from("quests").insert([{ id: "q5" }], { defaultToNull: false });
    expect(fake.calls[0]).toMatchObject({ target: "quests", op: "insert", options: { defaultToNull: false } });
  });
});

describe("arguments that are Vue reactive proxies", () => {
  it("an rpc handler receives the array a ref held, instead of the fake throwing a DataCloneError", async () => {
    const { ref } = await import("vue");
    const slugs = ref(["srd-2024"]);
    fake.onRpc("browse", (args) => args.p_slugs);
    const { data, error } = await db.rpc("browse", { p_slugs: slugs.value });
    expect(error).toBeNull();
    expect(data).toEqual(["srd-2024"]);
  });
});

describe("match", () => {
  it("requires every pair, so dropping one key shows up as a foreign row", async () => {
    expect(await ids(db.from("quests").select("*").match({ user_id: "u1", rank: 3 }))).toEqual(["q3"]);
    expect(await ids(db.from("quests").select("*").match({ user_id: "u1" }))).toEqual(["q1", "q3"]);
  });

  it("filters an update to the matching row", async () => {
    await db.from("quests").update({ title: "changed" }).match({ user_id: "u1", rank: 1 });
    expect(fake.rows("quests").map((row) => row.title)).toEqual(["changed", "B", "C"]);
  });
});

describe("not() on a path into a json column", () => {
  it("not(col->key, is, null) matches only rows that hold that key, so a claim on a marker succeeds once", async () => {
    fake.seed("sheets", [
      { id: "s1", choices: { marker: { a: 1 }, other: true } },
      { id: "s2", choices: { other: true } },
      { id: "s3", choices: null },
    ]);
    const { data } = await db.from("sheets").select("*").not("choices->marker", "is", null);
    expect((data as { id: string }[]).map((row) => row.id)).toEqual(["s1"]);
  });
});

describe("like and ilike", () => {
  const names = [
    { id: "n1", name: "Rain Barrel" },
    { id: "n2", name: "brain" },
    { id: "n3", name: "100% sure" },
    { id: "n4", name: null },
    { id: "n5", name: "rXn" },
    { id: "n6", name: "rXXn" },
  ];
  beforeEach(() => fake.seed("names", names));

  it("ilike ignores case and treats % as any run, so a substring pattern finds the row wherever the text sits", async () => {
    expect(await ids(db.from("names").select("*").ilike("name", "%RAIN%"))).toEqual(["n1", "n2"]);
  });

  it("like is case sensitive, so ilike cannot be passed off as it", async () => {
    expect(await ids(db.from("names").select("*").like("name", "%rain%"))).toEqual(["n2"]);
  });

  it("_ is exactly one character and a pattern is anchored, not a substring test", async () => {
    expect(await ids(db.from("names").select("*").ilike("name", "r_n"))).toEqual(["n5"]);
    expect(await ids(db.from("names").select("*").ilike("name", "rain"))).toEqual([]);
  });

  it("a backslash makes % literal, so a typed percent sign does not become a wildcard", async () => {
    expect(await ids(db.from("names").select("*").ilike("name", "100\\% %"))).toEqual(["n3"]);
    expect(await ids(db.from("names").select("*").ilike("name", "100\\_%"))).toEqual([]);
  });

  it("a null column never matches, even the match-everything pattern", async () => {
    expect(await ids(db.from("names").select("*").ilike("name", "%"))).not.toContain("n4");
  });
});

describe("or", () => {
  const rows = [
    { id: "r1", ruleset: null, owner: "u1", campaign_id: "c1", tags: ["rain", "calm"], title: "Heavy Rain" },
    { id: "r2", ruleset: "2024", owner: "u2", campaign_id: null, tags: ["fire"], title: 'Say "hi"' },
    { id: "r3", ruleset: "2014", owner: "u1", campaign_id: null, tags: [], title: "Quiet, please (soft)" },
    { id: "r4", ruleset: "2024", owner: null, campaign_id: "c2", tags: null, title: "x" },
  ];
  beforeEach(() => fake.seed("o", rows));
  const pick = async (expression: string) => ids(db.from("o").select("*").or(expression));

  it("with one matching clause returns the row, not every row", async () => {
    expect(await pick("owner.eq.u2")).toEqual(["r2"]);
  });

  it("passes a row when ANY clause matches, so ruleset null-or-equal keeps the other edition out", async () => {
    expect(await pick("ruleset.is.null,ruleset.eq.2024")).toEqual(["r1", "r2", "r4"]);
  });

  it("chained or() calls narrow each other, like PostgREST's repeated or= parameters", async () => {
    const result = await ids(db.from("o").select("*").or("ruleset.is.null,ruleset.eq.2024").or("campaign_id.is.null"));
    expect(result).toEqual(["r2"]);
  });

  it("neq never matches a null column", async () => {
    expect(await pick("ruleset.is.null,ruleset.neq.2024")).toEqual(["r1", "r3"]);
  });

  it("in reads (a,b) lists, with a quoted member keeping its comma", async () => {
    expect(await pick("owner.in.(u1,u9)")).toEqual(["r1", "r3"]);
    expect(await pick('title.in.("Quiet, please (soft)",x)')).toEqual(["r3", "r4"]);
  });

  it("nested and() needs every inner clause, so the personal-library branch does not leak another user's row", async () => {
    expect(await pick("campaign_id.eq.c2,and(campaign_id.is.null,owner.in.(u1))")).toEqual(["r3", "r4"]);
    expect(await pick("campaign_id.eq.c2,and(campaign_id.is.null,owner.in.(u3))")).toEqual(["r4"]);
  });

  it("a quoted ilike value with escaped quotes matches the title literally", async () => {
    expect(await pick('title.ilike."%say \\"hi\\"%"')).toEqual(["r2"]);
    expect(await pick('title.ilike."%rain%",title.ilike."%fire%"')).toEqual(["r1"]);
  });

  it("cs on an array column matches when every element is present and ignores null or missing arrays", async () => {
    expect(await pick('tags.cs.{"rain"}')).toEqual(["r1"]);
    expect(await pick('tags.cs."{\\"rain\\",\\"calm\\"}"')).toEqual(["r1"]);
    expect(await pick('tags.cs.{"rain","fire"}')).toEqual([]);
  });

  it("comparison operators order numbers as numbers, not as strings", async () => {
    fake.seed("n", [{ id: "a", rank: 9 }, { id: "b", rank: 10 }]);
    expect(await ids(db.from("n").select("*").or("rank.gt.9"))).toEqual(["b"]);
    expect(await ids(db.from("n").select("*").or("rank.lte.9,rank.gte.10"))).toEqual(["a", "b"]);
  });

  it("not. negates a clause but still excludes a null column", async () => {
    expect(await pick("ruleset.not.eq.2024")).toEqual(["r3"]);
  });

  it.each([
    ["a bare word", "ruleset"],
    ["an unknown operator", "ruleset.matches.x"],
    ["an empty clause", "ruleset.is.null,,owner.eq.u1"],
    ["an unbalanced paren", "and(owner.eq.u1"],
    ["is with a non-null value", "owner.is.maybe"],
  ])("%s throws naming the expression instead of matching every row", (_label, expression) => {
    expect(() => db.from("o").select("*").or(expression)).toThrow(/cannot interpret or\(\) clause/);
  });
});

describe("errors", () => {
  it("every error the fake returns is an Error carrying code, details and hint, so instanceof Error behaves as in production", async () => {
    fake.failNext("quests", { message: "boom", code: "23505" });
    fake.failNext("quests", { message: "boom2" });
    fake.onRpc("known", () => 1);
    const results = [
      await db.from("quests").select("*"),
      await db.from("quests").select("*"),
      await db.from("quests").select("*").eq("user_id", "u1").single(),
      await db.from("quests").update({ title: "x" }),
      await db.rpc("mystery"),
    ];
    for (const { error } of results) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ details: null, hint: null });
      expect(typeof error?.code).toBe("string");
      expect(error?.message).not.toBe("");
    }
    expect(results[0].error?.code).toBe("23505");
  });
});
