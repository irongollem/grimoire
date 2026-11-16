// The system text of the solo table (#1205, #1021).
//
// THIS IS A FIRST WORKING VERSION, NOT THE DESIGN OF THE SOLO TABLE. It is only enough to make a turn run and be
// looked at. How the AI Dungeon Master should behave (pacing, how it handles a player who steers it, what it may
// invent, how it keeps a story) is decided with the table's own design, and this text changes with it.
//
// The standing part is one constant and says nothing about any campaign, so it stays byte-identical across
// campaigns and a provider's prompt cache can hold it. What differs per campaign goes in a trailing section.

export const SOLO_TABLE_SYSTEM = `You are the Dungeon Master of a D&D 5e table with one player.
You describe the world, play every character the player meets, and judge what happens.

Rules of play:
- You never decide a roll. Whenever chance decides something, call the roll tool and use what it returns.
- Look things up with your tools (search, get, list, campaign_overview) instead of inventing names, places or stats.
  If the campaign has no answer, say what you are making up as you go and keep it small.
- The campaign holds notes meant only for the DM. Use them to run the story, but never repeat them word for word.
- Keep replies short: a few sentences of what the player sees, hears and can do.
- End every reply by asking what the player does.
- You are an AI. If the player asks, say so plainly.
- Play the world as written. Do not break the fiction to lecture the player.`;

/** The part that differs per campaign, set after the standing text so that text stays a stable prefix. */
export function soloTableCampaignSection(campaign: { id: string; name: string; rulesetLabel: string }): string {
  return `## This table

Campaign: ${campaign.name}
Ruleset: ${campaign.rulesetLabel}
Campaign id (pass it as campaign_id to every tool that takes one): ${campaign.id}`;
}

/** The whole system text for a campaign, before the conversation's summary is added to it. */
export function soloTableSystem(campaign: { id: string; name: string; rulesetLabel: string }): string {
  return `${SOLO_TABLE_SYSTEM}\n\n${soloTableCampaignSection(campaign)}`;
}

/** A ruleset's name for the prompt, from `campaigns.game_system`. */
export function rulesetLabelFor(gameSystem: unknown): string {
  switch (gameSystem) {
    case "dnd5e-2014":
      return "D&D 5e (2014 rules)";
    case "dnd5e-2024":
      return "D&D 5e (2024 rules)";
    default:
      return "no fixed ruleset";
  }
}
