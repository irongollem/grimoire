// encounter-options (#1202, story 3b): the whole-turn options of one creature in a live fight. Read-only.
//
// Who may ask is `_shared/fightAccess.ts`, the same as `encounter-command`: only the campaign's DM, because the
// options reveal what monsters can do and where they can stand. Every read below is scoped to the campaign derived
// from the encounter; nothing here writes.
import { serve } from "std/http/server.ts";
import type { FactionSides } from "../../../src/rules/fight/sides.ts";
import { DEFAULT_FACTIONS } from "../../../src/types/encounter.types.ts";
import { withCors } from "../_shared/cors.ts";
import { adminClient, callerUserId, loadEncounterAsDm } from "../_shared/fightAccess.ts";
import { loadFightMapInput } from "../_shared/fightMap.ts";
import { loadStatBlocks } from "../_shared/fightStatBlocks.ts";
import { loadSpellsListed } from "../_shared/fightSpells.ts";
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { DEFAULT_RULESET } from "../../../src/types/ruleset.types.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import { computeOptions, MAX_BODY_CHARACTERS, OptionsError, validateOptionsRequest, type OptionsDeps } from "./handler.ts";

const admin = adminClient();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const userId = await callerUserId(req);
  if (userId === null) return new Response("Unauthorized", { status: 401 });

  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARACTERS) throw new OptionsError(400, "The request is too large.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OptionsError(400, "The request body is not JSON.");
    }
    const request = validateOptionsRequest(body);

    const access = await loadEncounterAsDm<{ id: string; campaign_id: string | null; factions: FactionSides | null }>(admin, userId, request.encounterId, "id, campaign_id, factions");
    if (!access.ok) return access.response;
    const campaignId = access.campaign.id;

    const deps: OptionsDeps = {
      async loadFight() {
        const { data, error } = await admin
          .from("encounter_state")
          .select("version, combatants_live, current_round")
          .eq("encounter_id", request.encounterId)
          .eq("campaign_id", campaignId)
          .maybeSingle();
        if (error) throw new Error(`encounter_state: ${error.message}`);
        if (!data) return null;
        return {
          version: data.version as number,
          combatants: data.combatants_live as RunCombatant[],
          round: Number(data.current_round),
          ruleset: gameSystemEdition(access.campaign.game_system) ?? DEFAULT_RULESET,
          factions: access.encounter.factions && access.encounter.factions.length > 0 ? access.encounter.factions : DEFAULT_FACTIONS,
        };
      },
      loadStatBlocks: (ids) => loadStatBlocks(admin, campaignId, ids),
      async loadMemberSpeeds(memberIds) {
        const { data, error } = await admin.from("party_members").select("id, speed").eq("campaign_id", campaignId).in("id", memberIds);
        if (error) throw new Error(`party_members: ${error.message}`);
        return data as { id: string; speed: number }[];
      },
      loadMapInput: () => loadFightMapInput(admin, campaignId, request.encounterId),
      loadSpellsListed: (names) => loadSpellsListed(admin, campaignId, access.campaign.user_id, names),
    };

    return json(await computeOptions(request, deps));
  } catch (e) {
    if (e instanceof OptionsError) return json({ error: e.message }, e.status);
    throw e; // withCors reports it and answers 500
  }
}));
