import { editionGameSystem } from "@/systems/registry";

type Row = Record<string, unknown>;

/**
 * Backups and bundles written before campaigns carried a game system (#934)
 * name the campaign's 5e edition as `ruleset` instead. Every campaign then was
 * 5e, so the edition names its system exactly, as migration 20261106093841
 * translated the stored rows: "2024" is 5e 2024, "2014" is 5e 2014. The old key
 * is dropped either way, because the column it would insert into is gone. A
 * holder with neither key is returned as it is, and the import's own check
 * refuses it.
 */
export function upgradeLegacyGameSystem<T extends object>(holder: T): T {
  if (!("ruleset" in holder)) return holder;
  const { ruleset, ...rest } = holder as Row;
  if (typeof rest.game_system === "string") return rest as T;
  if (ruleset !== "2014" && ruleset !== "2024") return rest as T;
  return { ...rest, game_system: editionGameSystem(ruleset) } as T;
}
