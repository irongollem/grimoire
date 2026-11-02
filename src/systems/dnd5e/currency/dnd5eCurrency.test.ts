import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCurrency } from "@/lib/currency/currency";
import { DND5E_CURRENCY } from "./dnd5eCurrency";

describe("DND5E_CURRENCY", () => {
  it("is a valid currency (a typo in the default set would ship every campaign an invalid one)", () => {
    expect(validateCurrency(DND5E_CURRENCY)).toEqual([]);
  });
});

describe("DND5E_CURRENCY and private.dnd5e_currency()", () => {
  // Bug it fails on: "Reset to D&D 5e coins" saving different coins (colours, order, change rules)
  // from the ones a new campaign got, because the SQL preset and this constant are two copies.
  it("is the same set the migration gives a new campaign", () => {
    const sql = readFileSync(
      join(__dirname, "../../../../supabase/migrations/20261101161919_currency_is_campaign_config.sql"),
      "utf8",
    );
    const body = sql.match(/function private\.dnd5e_currency\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    expect(body).not.toBe("");
    const defaultKey = body.match(/'default_key',\s*'([^']+)'/)?.[1];
    const rows = [...body.matchAll(/jsonb_build_object\('key',([^)]*)\)/g)].map((m) => {
      const row: Record<string, string | number | boolean> = {};
      for (const [, k, v] of m[0].matchAll(/'(\w+)',\s*('[^']*'|[\w.]+)/g)) {
        row[k] = v.startsWith("'") ? v.slice(1, -1) : v === "true" ? true : v === "false" ? false : Number(v);
      }
      return row;
    });
    expect(rows.length).toBe(DND5E_CURRENCY.denominations.length);
    expect(defaultKey).toBe(DND5E_CURRENCY.default_key);
    expect(rows).toEqual(DND5E_CURRENCY.denominations.map((d) => ({ ...d })));
  });
});
