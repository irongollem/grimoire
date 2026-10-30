/**
 * The Workshop episodes' scene, in the local demo copy only.
 *
 * Player side: the player's character can make Moonflower Essence. It is shared
 * with them, they hold Alchemist's Supplies and are proficient, and the
 * ingredients are in their pack. A take spends them, so every run puts them back.
 *
 * DM side: Moonflower Essence starts hidden from the table, so the DM can
 * reveal it on camera, and one player invention waits in the approval queue.
 * The invention is written here rather than generated (a real one costs an AI
 * call per take); its draft is shaped like the edge function's output and
 * passes `parseInvention`. Approving it on camera creates a recipe and an item,
 * which the next run deletes again.
 */
import { runSqlFile, PLAYER_EMAIL } from "../../lib/dev-campaign-io.ts";
import { quote } from "../../lib/dev-db.ts";
import { demoCampaignId, idByName, localDb, playerCharacter } from "./demo.ts";

const RECIPE = "Moonflower Essence";
const TOOL = "Alchemist's Supplies";
const TOOL_LIBRARY_ID = "srd_grimoire_bundled_alchemist_s_supplies";
const INVENTION = "Sugar-Glass Night-Light";

interface Scene {
  campaignId: string;
  character: { id: string; name: string };
  recipeId: string;
  petal: string;
  sugar: string;
  essence: string;
  glass: string;
  thread: string;
}

function scene(): Scene {
  const campaignId = demoCampaignId();
  return {
    campaignId,
    character: playerCharacter(campaignId),
    recipeId: idByName("crafting_recipes", campaignId, RECIPE),
    petal: idByName("items", campaignId, "Preserved Moonflower Petal"),
    sugar: idByName("items", campaignId, "Sack of Sugar Scraps"),
    essence: idByName("items", campaignId, "Moonflower Essence"),
    glass: idByName("items", campaignId, "Pane of Candy-Glass"),
    thread: idByName("items", campaignId, "Spool of Sugar-Thread"),
  };
}

/** Puts the character's pack and proficiency back to the start of the player episode. */
function packSql(s: Scene, owner: string): string {
  const c = quote(s.campaignId);
  const pm = quote(s.character.id);
  return `
    delete from public.party_inventory
     where carried_by = ${pm}
       and (item_id in (${[s.petal, s.sugar, s.essence].map(quote).join(", ")}) or library_item_id = ${quote(TOOL_LIBRARY_ID)});
    insert into public.party_inventory (campaign_id, user_id, carried_by, name, quantity, item_id, library_item_id)
    values (${c}, ${owner}, ${pm}, ${quote(TOOL)}, 1, null, ${quote(TOOL_LIBRARY_ID)}),
           (${c}, ${owner}, ${pm}, 'Sack of Sugar Scraps', 2, ${quote(s.sugar)}, null),
           (${c}, ${owner}, ${pm}, 'Preserved Moonflower Petal', 4, ${quote(s.petal)}, null);
    update public.party_members
       set tool_proficiencies = array_append(array_remove(tool_proficiencies, ${quote(TOOL)}), ${quote(TOOL)})
     where id = ${pm};`;
}

/** Removes the DM episode's invention and whatever approving it created. */
function clearInventionSql(s: Scene): string {
  const c = quote(s.campaignId);
  return `
    delete from public.crafting_inventions where campaign_id = ${c} and draft -> 'item' ->> 'name' = ${quote(INVENTION)};
    delete from public.crafting_recipes where campaign_id = ${c} and name = ${quote(INVENTION)};
    delete from public.items where campaign_id = ${c} and name = ${quote(INVENTION)};`;
}

function inventionDraft(s: Scene): Record<string, unknown> {
  return {
    item: {
      ref: null,
      new: {
        name: INVENTION,
        item_type: "gear",
        subtype: null,
        rarity: "mundane",
        cost: "4 gp",
        value_cp: 400,
        weight: 1,
        flavor: "A pane of candy-glass folded into a little lantern and stitched shut with sugar-thread. It glows the pink of a boiled sweet.",
        rules_text: "After a night's use the glass goes soft; set it somewhere cool for a day and it hardens again.",
        description: "After a night's use the glass goes soft; set it somewhere cool for a day and it hardens again.",
        requires_attunement: false,
        attunement_requirements: null,
        charges: null,
        recharge: null,
        damage_rolls: null,
        armor_class: null,
        properties: [],
        tags: ["sugarwell", "light"],
      },
      name: INVENTION,
      rarity: "mundane",
      item_type: "gear",
      value_cp: 400,
    },
    mechanics: [{ kind: "minor", text: "Dim light in a 10-foot radius for 8 hours." }],
    quantity: 1,
    recipe: {
      name: INVENTION,
      description: "Score the candy-glass while it is warm, fold it into a lantern and stitch the seams with sugar-thread.",
      dc: 11,
      crafting_time: 2,
      crafting_time_unit: "hours",
      requires_proficiency: false,
      requires_tools: true,
      special_requirement: null,
    },
    ingredients: [
      { ref: { item_id: s.glass }, new: null, name: "Pane of Candy-Glass", rarity: "mundane", value_cp: 100, quantity: 1 },
      { ref: { item_id: s.thread }, new: null, name: "Spool of Sugar-Thread", rarity: "mundane", value_cp: 100, quantity: 1 },
    ],
    materials_value_cp: 200,
    value_multiple: 2,
    value_limit_cp: 400,
    rarity_ceiling: "mundane",
    adjustments: [],
    warnings: [],
  };
}

export function setupWorkshopPlayer(): void {
  const s = scene();
  const db = localDb();
  const owner = `(select user_id from public.campaigns where id = ${quote(s.campaignId)})`;
  runSqlFile(
    db,
    `begin;
     ${packSql(s, owner)}
     update public.crafting_recipes
        set player_visible_to = array_append(array_remove(player_visible_to, ${quote(s.character.id)}::uuid), ${quote(s.character.id)}::uuid)
      where id = ${quote(s.recipeId)};
     commit;`,
  );
}

export function setupWorkshopDm(): void {
  const s = scene();
  const db = localDb();
  const draft = JSON.stringify(inventionDraft(s));
  runSqlFile(
    db,
    `begin;
     ${clearInventionSql(s)}
     update public.crafting_recipes set player_visible_to = '{}' where id = ${quote(s.recipeId)};
     insert into public.crafting_inventions (campaign_id, party_member_id, user_id, discipline, mode, wish, bench, draft, status, ai_provenance)
     values (${quote(s.campaignId)}, ${quote(s.character.id)},
             (select id from auth.users where email = ${quote(PLAYER_EMAIL)}),
             'tinkering', 'idea', 'A night-light for the bakery loft, made from leftover candy-glass',
             '[]'::jsonb, ${quote(draft)}::jsonb, 'pending',
             '{"generatorType":"recipe_invention","provider":"promo-fixture","model":"promo-fixture","generatedAt":"2026-10-29T00:00:00Z","edited":false}'::jsonb);
     commit;`,
  );
}
