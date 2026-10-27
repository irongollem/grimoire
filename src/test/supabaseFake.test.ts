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
    expect((await db.from("quests").select("*")).error).toEqual({ message: "boom", code: "FAKE" });
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
