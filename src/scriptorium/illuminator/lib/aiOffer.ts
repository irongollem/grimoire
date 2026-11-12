/*
 * When the Illuminator offers an AI action (#1176 story 10, #1181). AI is a campaign setting, so an action exists
 * only for a book of the active campaign with AI on there; a price not known yet never blocks, a known one must be
 * affordable. One rule for every AI action in the workbench (Ask the Illuminator, Describe a brush).
 */

export function aiOffered(campaignId: string | null, campaign: { activeCampaignId: string | null; isAiEnabled: boolean }): campaignId is string {
  return campaignId !== null && campaignId === campaign.activeCampaignId && campaign.isAiEnabled;
}

export function canPayFor(credits: number | null, affordable: (credits: number) => boolean): boolean {
  return credits === null || affordable(credits);
}
