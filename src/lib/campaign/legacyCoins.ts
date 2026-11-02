/**
 * Backups and bundles written before currency became campaign config (#934)
 * carry the five fixed D&D coins as loose keys (pp/gp/ep/sp/cp). The database
 * no longer has those columns, so a file that still has them is translated
 * into coin maps on the way in, exactly as migration 20261101161919 translated
 * the stored rows: positive whole counts only, the five keys dropped. The
 * keys are the 5e ones on purpose: an old file's coins are 5e coins, and a
 * campaign restored from it gets the 5e default currency.
 */

type Row = Record<string, unknown>;

const LEGACY_COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLegacyKeys(obj: Row): boolean {
  return LEGACY_COIN_KEYS.some((key) => key in obj);
}

/** The positive whole counts of the five legacy keys, as a coin map. */
export function legacyCoins(obj: Row): Record<string, number> {
  const coins: Record<string, number> = {};
  for (const key of LEGACY_COIN_KEYS) {
    const count = obj[key];
    if (typeof count === "number" && Math.floor(count) > 0) coins[key] = Math.floor(count);
  }
  return coins;
}

function withoutLegacyKeys(obj: Row): Row {
  const copy = { ...obj };
  for (const key of LEGACY_COIN_KEYS) delete copy[key];
  return copy;
}

/** `{...obj, coins}` with the five keys gone; a row that never had them is returned as it is. */
function toCoins(obj: Row): Row {
  if (!hasLegacyKeys(obj)) return obj;
  return { ...withoutLegacyKeys(obj), coins: legacyCoins(obj) };
}

/** A character's purse columns become `coins`. */
export function upgradePartyMemberCoins(member: Row): Row {
  return toCoins(member);
}

/** A loot table's currency entries carry `coins` instead of the five keys. */
export function upgradeLootTableEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  return entries.map((entry) => (isRow(entry) && entry.type === "currency" ? toCoins(entry) : entry));
}

/** An encounter's reward pools are `{ id, label, coins }`. */
export function upgradeRewardCurrencyPools(pools: unknown): unknown {
  if (!Array.isArray(pools)) return pools;
  return pools.map((pool) => (isRow(pool) ? toCoins(pool) : pool));
}

export function upgradeEncounterCoins(encounter: Row): Row {
  if (!("reward_currency_pools" in encounter)) return encounter;
  return { ...encounter, reward_currency_pools: upgradeRewardCurrencyPools(encounter.reward_currency_pools) };
}

export function upgradeLootTableCoins(table: Row): Row {
  if (!("entries" in table)) return table;
  return { ...table, entries: upgradeLootTableEntries(table.entries) };
}
