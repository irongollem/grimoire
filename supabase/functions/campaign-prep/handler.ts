// Prep campaign (#1021 row 22). No Deno and no Supabase in here; I/O comes in through `PrepDeps`.
//
//   propose  the Dungeon Master asks what the campaign's story will need and does not have: one model call, charged
//            when it answers, and the proposals go back to the page. Nothing is made.
//   create   the Dungeon Master sends back the proposals they kept: each is checked again as if a stranger had
//            written it, nothing that exists by then is made twice, and the rest become ordinary campaign content
//            marked as made by AI. No model is called, so it costs nothing.

import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import { keptProposals, prepPrompt, PREP_SYSTEM, proposalInput, proposalsFromReply, type PrepDigest, type PrepExisting, type Proposal } from "../_shared/campaignPrep.ts";

export interface PrepCampaign {
  id: string;
  user_id: string;
  name: string;
  ai_enabled: boolean | null;
}

type Reservation = { ok: true; ids: string[] } | { ok: false; status: number; error: string };
type Log = { provider: string; model: string; input_tokens: number; output_tokens: number };

export interface PrepDeps {
  loadCampaign(campaignId: string): Promise<PrepCampaign | null>;
  isDm(campaign: PrepCampaign, userId: string): Promise<boolean>;
  /** What the model reads of the campaign. */
  loadDigest(campaign: PrepCampaign): Promise<PrepDigest>;
  /** What exists already by name: the campaign's own, and the library's hazards and items. */
  loadExisting(campaignId: string): Promise<PrepExisting>;
  resolveProvider(campaign: PrepCampaign): Promise<{ provider: string; model: string; isByok: boolean; callModel: CallModel | null } | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  reserve(userId: string, credits: number): Promise<Reservation>;
  release(ids: string[]): Promise<void>;
  charge(userId: string, isByok: boolean, credits: number, log: Log): Promise<void>;
  /** Makes one proposal a record of the campaign. Throws when it cannot be made (a plan's limit, a name taken meanwhile). */
  make(ctx: { campaign: PrepCampaign; userId: string }, proposal: Proposal): Promise<void>;
}

export const PREP_RESERVE_CREDITS = 4;
/** Room for the model to think the quests through and then write a dozen proposals. */
export const PREP_MAX_OUTPUT_TOKENS = 8_000;

export const PREP_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That campaign was not found.",
  aiOff: "AI is disabled for this campaign.",
  noProvider: "No AI provider is set up for this campaign.",
  noMetering: "The prep cannot be metered right now.",
  noAnswer: "The model gave no list. Nothing was charged.",
} as const;

export type PrepOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; kind: "proposed"; proposals: Array<Record<string, unknown>>; credits: number }
  | { ok: true; kind: "created"; made: string[]; skipped: Array<{ name: string; reason: string }> };

const refuse = (status: number, error: string): PrepOutcome => ({ ok: false, status, error });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function prepCampaign(input: { userId: string; body: unknown; deps: PrepDeps }): Promise<PrepOutcome> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse(400, PREP_MESSAGES.badBody);
  const body = raw as Record<string, unknown>;
  if ((body.action !== "propose" && body.action !== "create") || typeof body.campaignId !== "string" || !UUID_RE.test(body.campaignId)) return refuse(400, PREP_MESSAGES.badBody);

  const campaign = await deps.loadCampaign(body.campaignId);
  // Anyone but the campaign's DM is told it does not exist: a 403 would say it does.
  if (!campaign || !(await deps.isDm(campaign, userId))) return refuse(404, PREP_MESSAGES.notFound);
  if (campaign.ai_enabled === false) return refuse(403, PREP_MESSAGES.aiOff);

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
    return { ok: true, kind: "created", made, skipped };
  }

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return refuse(503, PREP_MESSAGES.noProvider);
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    price = await deps.loadPrice(provider.model);
    const found = await deps.loadCalibration();
    if (found && found.usdPerCredit !== null && Number.isFinite(found.usdPerCredit) && found.usdPerCredit > 0 && Number.isFinite(found.margin) && found.margin > 0) {
      calibration = { usdPerCredit: found.usdPerCredit, margin: found.margin };
    }
    if (!price || !calibration) return refuse(503, PREP_MESSAGES.noMetering);
  }

  const [digest, existing] = await Promise.all([deps.loadDigest(campaign), deps.loadExisting(campaign.id)]);
  let reservationIds: string[] = [];
  if (!provider.isByok) {
    const reservation = await deps.reserve(userId, PREP_RESERVE_CREDITS);
    if (!reservation.ok) return refuse(reservation.status, reservation.error);
    reservationIds = reservation.ids;
  }
  try {
    const step = await provider.callModel({
      system: PREP_SYSTEM,
      messages: [{ role: "user", blocks: [{ type: "text", text: prepPrompt(digest) }] }],
      // No tool: see `proposalsFromReply` for why the list is asked for as plain JSON.
      tools: [],
      maxOutputTokens: PREP_MAX_OUTPUT_TOKENS,
    });
    const reply = step.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
    const listed = step.stop === "refusal" ? null : proposalsFromReply(reply);
    // A reply with no list (a refusal, plain talk) is no answer: nothing came of it, nothing is charged.
    if (listed === null) return refuse(502, PREP_MESSAGES.noAnswer);
    const proposals = keptProposals(listed, existing);
    const usage = step.usage;
    // Whole credits, at least one: the list was written, whatever of it the DM keeps. Own-key play is logged, not charged.
    const credits = provider.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
    await deps.charge(userId, provider.isByok, credits, { provider: usage.provider, model: usage.model, input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, output_tokens: usage.outputTokens });
    return { ok: true, kind: "proposed", proposals: proposals.map(proposalInput), credits };
  } finally {
    await deps.release(reservationIds);
  }
}
