/**
 * The real effects behind nameRepairRun.ts for a generator's edge function
 * (#1061): the platform's TypeSafe key, one Jev call, and the free-spend row
 * (`entity_judgment`, the same type and shape import-match records).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordFreeGeneration } from "./credits.ts";
import { fetchPlatformKeys } from "./platform-keys.ts";
import { judge, JEV_MODEL } from "./typesafe.ts";
import type { RepairInput } from "./nameRepair.ts";
import { repairWhenKeyed } from "./nameRepairRun.ts";

/** Per group, output name to the exact offered name, for the confident repairs only. */
export function repairGeneratedNames(
  admin: SupabaseClient,
  userId: string,
  groups: RepairInput[],
): Promise<Map<string, string>[]> {
  return repairWhenKeyed(groups, {
    getKey: async () => (await fetchPlatformKeys(admin, ["typesafe"])).typesafe,
    judge: (request, apiKey, signal) => judge(request, { apiKey, signal }),
    record: (inputTokens) =>
      recordFreeGeneration(admin, userId, "entity_judgment", {
        model: JEV_MODEL,
        provider: "typesafe",
        input_tokens: inputTokens,
      }),
  });
}
