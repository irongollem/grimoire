/**
 * Ask Grimoire (#1253): the NPC generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useNpcQuote`'s (the one `NpcGeneratorPanel` shows), the
 * gates are the page's (`useAskGate`), and the run is `useGenerateNpc`, the generate-and-create step the page calls.
 * What it adds is reading the proposal: `proposal.inputs` through the schema (`readAskInputs`), so only what the
 * contract lists reaches the generator.
 *
 * The likeness notice for an alter ego is not a block here: the workflow itself asks for it (`useNpcGeneration`
 * calls `ensureLikenessAck`), and the notice dialog is mounted app-wide, so it opens over the Ask panel exactly as it
 * does over the page. Declining it makes nothing and costs nothing, and the result says so.
 *
 * Linking: the generator's page can tie a new NPC to an existing one (family, or a bond such as rival or mentor), to a
 * party member, to a faction (with a role) and to a place, and Ask offers the same through `related_npc_id`,
 * `related_pc_id`, `relation`, `second_parent_id`, `faction_id`, `faction_role` and `location_id`. Every id is looked
 * up in this campaign's own lists and an id that is not there is ignored, so the model cannot tie an NPC to another
 * campaign's row; the word becomes the page's own form field (`npcRelations`), so the page's workflow writes the kin
 * link or the world link, and the related people reach the model's context with their birth years. A related person
 * named with no word is a contact, the page's own default tie.
 *
 * Every other tie goes through `links` (a list of `{kind, id, relation}`): a god they worship, a place they work at, a
 * faction they are allied with, an item they seek, a character they are bonded to. The records are looked up in this
 * campaign (`useAskLinkRecords`), a record that is not there is ignored, and the ties are written by the same
 * `applyGeneratorLinks` the page's "Tie it to…" field uses.
 *
 * A failed picture never costs the NPC: the row and its text are saved first, the portrait is its own part, and it
 * carries `retry`, which paints the saved NPC once with the page's own paint flow.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskChoices, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askChoice, askLinkLines, chosenAskLinks, conceptBlock, failedRun, picturePart, readAskLinks, resolveAskLinks, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useKinLinks } from "@/composables/kinship/useKinLinks";
import { kinOfferKey, kinOffers, type KinOffer } from "@/lib/npcGenerator/kinOffers";
import { GENERATOR_KIN_LABELS } from "@/lib/npcGenerator/kinPrompt";
import { useAskLinkRecords } from "@/ai/ask/adapters/askLinkRecords";
import type { AskLink } from "@edge-shared/agent/askLinks";
import { askFlag, askInteger, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { DEFAULT_RELATION, npcRelation } from "@/ai/ask/adapters/npcRelations";
import { parsePersonKey, personKey } from "@/lib/kinship/keys";
import { useNpcQuote } from "@/composables/ai/quotes/npcQuote";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { npcSpecies } from "@/lib/canon/npcSpecies";
import { buildNpcAiContext, useGenerateNpc, type NpcGenerateForm } from "@/composables/npcs/useGenerateNpc";
import { isQuotaExceeded } from "@/lib/quotaError";
import { DEFAULT_ASSOCIATE } from "@/lib/npcGenerator/associate";

/** The form's way to say "not given" is an empty string. */
function blankIfUnsaid(value: string | null): string {
  return value === null ? "" : value;
}

export function useNpcAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useNpcQuote();
  const { blockFor } = useAskGate("npcs", "NPC");
  const { generateAndCreateNpc } = useGenerateNpc();
  const { peoples } = useCampaignPeoples();
  const missing = useMissingPortrait("npc");

  // The places and factions are read only once a proposal names one: this adapter lives as long as the panel, which
  // is mounted on every page, and a closed panel must cost no egress.
  const lookupsWanted = ref(false);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  const { data: factions } = useAllFactions(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && (locations.value === undefined || factions.value === undefined));
  // The people are read only when a proposal ties the NPC to one, for the same reason.
  const peopleWanted = ref(false);
  const { data: npcs } = useNpcs(() => peopleWanted.value);
  const { data: party } = useParty(() => peopleWanted.value);
  // The family, to offer the rest of it (a new parent's other children); read with the people, for the same reason.
  const { data: kinLinks } = useKinLinks(() => peopleWanted.value);
  const peopleLoading = computed(() => peopleWanted.value && (npcs.value === undefined || party.value === undefined || kinLinks.value === undefined));

  // The records the ties name, read only once a proposal has some.
  const wantedLinks = ref<AskLink[]>([]);
  const linkRecords = useAskLinkRecords(() => wantedLinks.value);

  /** What Ask understood of the proposal, with ids only when they name a row this campaign has. */
  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("npc", proposal.inputs);
    const locationId = askString(inputs, "location_id");
    const factionId = askString(inputs, "faction_id");
    if (locationId !== null || factionId !== null) lookupsWanted.value = true;
    const location = locationId === null ? null : locations.value?.find((l) => l.id === locationId) ?? null;
    const faction = factionId === null ? null : factions.value?.find((f) => f.id === factionId) ?? null;

    const relatedNpcId = askString(inputs, "related_npc_id");
    const relatedPcId = askString(inputs, "related_pc_id");
    const secondParentId = askString(inputs, "second_parent_id");
    if (relatedNpcId !== null || relatedPcId !== null || secondParentId !== null) peopleWanted.value = true;
    const relatedNpc = relatedNpcId === null ? null : npcs.value?.find((n) => n.id === relatedNpcId) ?? null;
    const relatedPc = relatedPcId === null ? null : party.value?.find((p) => p.id === relatedPcId) ?? null;
    // A character beats an NPC when both are named, as the page's own kin code does.
    const related = relatedPc ? { kind: "pc" as const, row: relatedPc } : relatedNpc ? { kind: "npc" as const, row: relatedNpc } : null;
    const relation = related === null ? null : npcRelation(askString(inputs, "relation")) ?? DEFAULT_RELATION;
    // The other parent exists only for a child, and is one of this campaign's NPCs (or characters).
    // Looked up among the NPCs, then the party: the page's own field takes either, as a person key.
    let secondParent: { kind: "npc" | "pc"; row: { id: string; name: string } } | null = null;
    if (relation?.kind === "kin" && relation.kin === "child" && secondParentId !== null) {
      const npc = npcs.value?.find((n) => n.id === secondParentId);
      const pc = npc ? undefined : party.value?.find((p) => p.id === secondParentId);
      secondParent = npc ? { kind: "npc", row: npc } : pc ? { kind: "pc", row: pc } : null;
    }
    const askedLinks = readAskLinks("npc", proposal.inputs);
    // Set only on a change, so reading a quote never re-triggers itself.
    if (askedLinks.map((l) => `${l.kind}:${l.id}:${l.relation}`).join() !== wantedLinks.value.map((l) => `${l.kind}:${l.id}:${l.relation}`).join()) {
      wantedLinks.value = askedLinks;
    }
    const links = linkRecords.names.value ? resolveAskLinks("npc", askedLinks, linkRecords.names.value) : [];
    // The rest of the family, offered and never assumed (half-siblings exist): each starts at no on the quote.
    const offers: { offer: KinOffer; name: string }[] = [];
    if (related && relation?.kind === "kin") {
      const relatedKey = personKey(related.kind, related.row.id);
      const exclude = secondParent ? [personKey(secondParent.kind, secondParent.row.id)] : [];
      for (const offer of kinOffers(kinLinks.value ?? [], relatedKey, relation.kin, exclude)) {
        const { type, id } = parsePersonKey(offer.key);
        const row = type === "npc" ? npcs.value?.find((n) => n.id === id) : party.value?.find((p) => p.id === id);
        if (row) offers.push({ offer, name: row.name });
      }
    }
    return {
      links,
      offers,
      related,
      relation,
      secondParent,
      name: askString(inputs, "name"),
      race: askString(inputs, "race"),
      age: askInteger(inputs, "age"),
      alignment: askString(inputs, "alignment"),
      role: askString(inputs, "role"),
      location,
      faction,
      factionRole: askString(inputs, "faction_role"),
      portrait: askFlag(inputs, "portrait"),
      alterEgo: askFlag(inputs, "alter_ego"),
      concept: proposal.concept.trim(),
    };
  }

  /**
   * What the DM left at yes. Every line that ties the NPC to something that exists is a yes or no; what the proposal
   * named starts at yes, the family Ask offers on its own starts at no, and without the relative there is no family
   * to offer.
   */
  function decided(read: ReturnType<typeof understand>, choices: AskChoices | undefined) {
    const related = read.related && askChoice(choices, "related", true).on ? read.related : null;
    return {
      location: read.location && askChoice(choices, "location", true).on ? read.location : null,
      faction: read.faction && askChoice(choices, "faction", true).on ? read.faction : null,
      related,
      secondParent: related && read.secondParent && askChoice(choices, "second_parent", true).on ? read.secondParent : null,
      alsoKin: related ? read.offers.filter((o) => askChoice(choices, kinOfferKey(o.offer), false).on).map((o) => o.offer) : [],
      links: chosenAskLinks(read.links, choices),
    };
  }

  function quote(proposal: AskProposal, choices?: AskChoices): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ portrait: read.portrait, alterEgo: read.alterEgo });

    const who = [read.race, read.age === null ? null : `about ${read.age}`].filter((part) => part !== null).join(", ");
    const lines: AskQuoteLine[] = [];
    if (read.name) lines.push({ label: "Name", value: read.name, credits: null });
    lines.push({ label: "Who", value: who || "As the description says", credits: null });
    if (read.role) lines.push({ label: "Role", value: read.role, credits: null });
    if (read.location) lines.push({ label: "Lives in", value: read.location.name, credits: null, choice: askChoice(choices, "location", true) });
    if (read.faction) {
      const value = read.factionRole ? `${read.faction.name}, as ${read.factionRole}` : read.faction.name;
      lines.push({ label: "Faction", value, credits: null, choice: askChoice(choices, "faction", true) });
    }
    if (read.related && read.relation) lines.push({ label: read.relation.label, value: read.related.row.name, credits: null, choice: askChoice(choices, "related", true) });
    const relatedOn = read.related !== null && askChoice(choices, "related", true).on;
    if (read.secondParent && relatedOn) lines.push({ label: "Other parent", value: read.secondParent.row.name, credits: null, choice: askChoice(choices, "second_parent", true) });
    if (relatedOn) {
      for (const { offer, name } of read.offers) {
        lines.push({ label: `Also ${GENERATOR_KIN_LABELS[offer.relation].toLowerCase()}`, value: name, credits: null, choice: askChoice(choices, kinOfferKey(offer), false) });
      }
    }
    lines.push(...askLinkLines(read.links, choices));
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.portrait) lines.push({ label: "Portrait", value: "None", credits: null });

    let block = blockFor({ total: priced.total });
    block = block ?? conceptBlock(read.concept, "NPC");
    if (!block && lookupsLoading.value) {
      block = { reason: "missing", message: "Still reading this campaign's places and factions." };
    }
    if (!block && linkRecords.loading.value) {
      block = { reason: "missing", message: "Still reading the records it is tied to." };
    }
    if (!block && peopleLoading.value) {
      block = { reason: "missing", message: "Still reading this campaign's people." };
    }
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal, choices);
    if (current.block) return failedRun("NPC text", current.block.message);
    const read = understand(proposal);
    const chosen = decided(read, choices);
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return failedRun("NPC text", "No active campaign selected.");

    // The species asked for, else one rolled at the world's shares, as the page does (#1255 item 30).
    const species = npcSpecies(blankIfUnsaid(read.race), peoples.value);
    const form: NpcGenerateForm = {
      name: blankIfUnsaid(read.name),
      race: species.race,
      alignment: blankIfUnsaid(read.alignment),
      relationship: "unknown",
      templateId: "auto",
      location_id: chosen.location?.id ?? null,
      faction_id: chosen.faction?.id ?? null,
      faction_role: blankIfUnsaid(read.factionRole) || "Member",
      related_npc_id: chosen.related?.kind === "npc" ? chosen.related.row.id : null,
      related_npc_tie: chosen.related && read.relation?.kind === "tie" ? read.relation.choice : DEFAULT_ASSOCIATE,
      related_npc_kin: chosen.related && read.relation?.kind === "kin" ? read.relation.kin : null,
      related_pc_id: chosen.related?.kind === "pc" ? chosen.related.row.id : null,
      second_parent: chosen.secondParent ? personKey(chosen.secondParent.kind, chosen.secondParent.row.id) : null,
      also_kin: chosen.alsoKin,
    };
    // The schema's age and role have no field on the page's form; the model reads them as constraint lines.
    const extra = [
      read.age === null ? null : `Age: about ${read.age}`,
      read.role ? `Occupation: ${read.role}` : null,
    ].filter((line) => line !== null);
    const context = [
      ...extra,
      buildNpcAiContext(form, form.location_id, [], {
        locations: chosen.location ? [chosen.location] : [],
        factions: chosen.faction ? [chosen.faction] : [],
        npcs: [
          chosen.related?.kind === "npc" ? chosen.related.row : null,
          chosen.secondParent?.kind === "npc" ? chosen.secondParent.row : null,
          ...chosen.alsoKin.map((o) => personRow(o, "npc")),
        ].filter((row) => row !== null),
        party: [
          chosen.related?.kind === "pc" ? chosen.related.row : null,
          chosen.secondParent?.kind === "pc" ? chosen.secondParent.row : null,
          ...chosen.alsoKin.map((o) => personRow(o, "pc")),
        ].filter((row) => row !== null),
        todayYear: campaign.todayYear,
      }, chosen.links, species.lines),
    ].filter((line) => line !== "").join("\n");

    const textCredits = spent(current.lines.find((l) => l.label === "NPC text"));
    const portraitCredits = spent(current.lines.find((l) => l.label === "Portrait"));
    // What the true portrait alone cost, for a run where only the alter ego's picture failed.
    const truePortraitCredits = spent(quoteFor({ portrait: true, alterEgo: false }).lines.find((l) => l.label === "Portrait"));

    let outcome;
    try {
      outcome = await generateAndCreateNpc({
        concept: read.concept,
        prompt: read.concept,
        context,
        generateAlterEgo: read.alterEgo,
        generateImage: read.portrait,
        form,
        locationId: form.location_id,
        inventoryItems: [],
        // The workflow writes a bond only when it is told who the associate is, in this campaign.
        associate: chosen.related && read.relation?.kind === "tie" ? { id: chosen.related.row.id, name: chosen.related.row.name } : null,
        links: chosen.links,
      });
    } catch (e) {
      // A quota race on the create, or a save that failed: the generated text is lost, so say so plainly.
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of NPCs on this plan."
        : e instanceof Error ? e.message : "The NPC could not be saved.";
      return failedRun("NPC text", message);
    }
    if (!outcome.id || outcome.name === null) {
      // `error` is null when the DM declined the likeness notice.
      return failedRun("NPC text", outcome.error ?? "The likeness notice was not accepted, so nothing was made.");
    }

    const id = outcome.id;
    const name = outcome.name;
    const parts: AskRunPart[] = [{ label: "NPC text", ok: true, credits: textCredits }];
    if (read.portrait) parts.push(portraitPart(outcome.portrait, outcome.disguisePortrait, read.alterEgo, portraitCredits, truePortraitCredits, id, `${name}. ${read.concept}`));
    if (outcome.linkErrors.length) {
      parts.push({ label: "Connections", ok: false, credits: 0, error: `Some connections could not be added: ${outcome.linkErrors.join("; ")}` });
    }
    if (outcome.inventoryError) parts.push({ label: "Starter items", ok: false, credits: 0, error: outcome.inventoryError });
    const picture = outcome.portrait === "saved" && outcome.portraitUrl ? { picture: outcome.portraitUrl } : {};
    return { record: { type: "npc", id, name }, route: `/npcs/${id}`, ...picture, parts };
  }

  /** A ticked relative's row, for the prompt's ages and people. */
  function personRow(offer: KinOffer, type: "npc" | "pc") {
    const { type: is, id } = parsePersonKey(offer.key);
    if (is !== type) return null;
    return (type === "npc" ? npcs.value : party.value)?.find((row) => row.id === id) ?? null;
  }

  function portraitPart(
    portrait: "none" | "saved" | "failed",
    disguise: "none" | "saved" | "failed",
    alterEgo: boolean,
    credits: number,
    truePortraitCredits: number,
    npcId: string,
    paintContext: string,
  ): AskRunPart {
    if (portrait === "saved" && (!alterEgo || disguise === "saved")) return { label: "Portrait", ok: true, credits };
    if (portrait === "saved") {
      // The true portrait is saved; only the alter ego's picture is missing, and the paint flow repaints the true one.
      return { label: "Portrait", ok: false, credits: truePortraitCredits, error: "The alter ego's picture could not be painted. The NPC is saved with their portrait." };
    }
    return picturePart({
      label: "Portrait",
      saved: false,
      // A repaint whose price is unknown reports nothing spent here; the quote's figure belongs to the first try.
      credits: 0,
      noun: "NPC",
      retry: { credits: missing.cost.value, paint: () => missing.paint(npcId, paintContext), error: () => missing.error.value },
    });
  }

  return { id: "npc", quote, run };
}

export default useNpcAskAdapter;
