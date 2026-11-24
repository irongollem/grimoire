// Prep campaign (#1021 row 22). No Deno and no Supabase in here; I/O comes in through `PrepDeps`.
//
//   propose  the Dungeon Master asks what the campaign's story will need and does not have: one model call, charged
//            when it answers, and the proposals go back to the page. Nothing is made.
//   create   the Dungeon Master sends back the proposals they kept: each is checked again as if a stranger had
//            written it, nothing that exists by then is made twice, and the rest become ordinary campaign content
//            marked as made by AI. No model is called, so it costs nothing.

import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import { creditsForUsd, usableCalibration, usdForSteps, type ModelPrice } from "../_shared/agent/metering.ts";
import { keptProposals, prepPrompt, PREP_SYSTEM, proposalInput, proposalsFromReply, type PrepDigest, type PrepExisting, type Proposal } from "../_shared/campaignPrep.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";
import type { BaseCampaign, CampaignLoad } from "../_shared/pipeline/aiCampaign.ts";
import type { CreditHold } from "../_shared/pipeline/creditHold.ts";
import { json, jsonError } from "../_shared/pipeline/respond.ts";

export interface PrepCampaign extends BaseCampaign {
  name: string;
}

/** The ledger lines a proposing may queue; the hold itself (reserve, release, write) is `withCreditHold`'s. */
export type PrepHold = Pick<CreditHold, "charge" | "free">;

export interface PrepDeps {
  /** The campaign, or the refusal to answer with: anyone but its DM is told it does not exist, and AI must be on. */
  loadCampaign(campaignId: string, userId: string): Promise<CampaignLoad<PrepCampaign>>;
  /** What the model reads of the campaign. */
  loadDigest(campaign: PrepCampaign): Promise<PrepDigest>;
  /** What exists already by name: the campaign's own, and the library's hazards and items. */
  loadExisting(campaignId: string): Promise<PrepExisting>;
  resolveProvider(campaign: PrepCampaign): Promise<AgentProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  /** Holds `credits` (0 holds nothing), runs the proposing and releases the hold whatever happens. */
  withHold(credits: number, work: (hold: PrepHold) => Promise<Response>): Promise<Response>;
  /** Makes one proposal a record of the campaign. Throws when it cannot be made (a plan's limit, a name taken meanwhile). */
  make(ctx: { campaign: PrepCampaign; userId: string }, proposal: Proposal): Promise<void>;
}

export const PREP_RESERVE_CREDITS = 4;
/** Room for the model to think the quests through and then write a dozen proposals. */
export const PREP_MAX_OUTPUT_TOKENS = 8_000;

export const PREP_MESSAGES = {
  badBody: "The request is not valid.",
  noProvider: "No AI provider is set up for this campaign.",
  noMetering: "The prep cannot be metered right now.",
  noAnswer: "The model gave no list. Nothing was charged.",
} as const;


export async function prepCampaign(input: { userId: string; body: unknown; deps: PrepDeps }): Promise<Response> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return jsonError(400, "invalid_body", PREP_MESSAGES.badBody);
  const body = raw as Record<string, unknown>;
  if ((body.action !== "propose" && body.action !== "create") || typeof body.campaignId !== "string" || !UUID_RE.test(body.campaignId)) return jsonError(400, "invalid_body", PREP_MESSAGES.badBody);

  const load = await deps.loadCampaign(body.campaignId, userId);
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  if (body.action === "create") {
    // Checked again from nothing: the list comes from the page, and what exists may have changed since it was proposed.
    const kept = keptProposals(body.proposals, await deps.loadExisting(campaign.id));
    const asked = Array.isArray(body.proposals) ? body.proposals.length : 0;
    const made: string[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    for (const proposal of kept) {
      try {
        await deps.make({ campaign, userId }, proposal);
        made.push(proposal.name);
      } catch (error) {
        skipped.push({ name: proposal.name, reason: error instanceof Error ? error.message : "It could not be made." });
      }
    }
    if (kept.length < asked) skipped.push({ name: `${asked - kept.length} of the list`, reason: "Already in the campaign by now, or not something that can be made." });
    return json({ made, skipped });
  }

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return jsonError(503, "no_provider", PREP_MESSAGES.noProvider);
  const price = await deps.loadPrice(provider.model);
  const calibration = usableCalibration(await deps.loadCalibration());
  if (!price || !calibration) return jsonError(503, "metering_unavailable", PREP_MESSAGES.noMetering);

  const callModel = provider.callModel;
  const [digest, existing] = await Promise.all([deps.loadDigest(campaign), deps.loadExisting(campaign.id)]);
  return deps.withHold(PREP_RESERVE_CREDITS, async (hold) => {
    const step = await callModel({
      system: PREP_SYSTEM,
      messages: [{ role: "user", blocks: [{ type: "text", text: prepPrompt(digest) }] }],
      // No tool: see `proposalsFromReply` for why the list is asked for as plain JSON.
      tools: [],
      maxOutputTokens: PREP_MAX_OUTPUT_TOKENS,
    });
    const usage = step.usage;
    const log = { provider: usage.provider, model: usage.model, input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, output_tokens: usage.outputTokens };
    const reply = step.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
    const listed = step.stop === "refusal" ? null : proposalsFromReply(reply);
    // A reply with no list (a refusal, plain talk) is no answer: nothing came of it, nothing is charged. The call
    // was still paid for by us, so it is logged.
    if (listed === null) {
      hold.charge("campaign_prep", { cost: 0, log });
      return jsonError(502, "generation_failed", PREP_MESSAGES.noAnswer);
    }
    const proposals = keptProposals(listed, existing);
    // Whole credits, at least one: the list was written, whatever of it the DM keeps.
    const credits = Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
    hold.charge("campaign_prep", { cost: credits, log });
    return json({ proposals: proposals.map(proposalInput), credits });
  });
}
