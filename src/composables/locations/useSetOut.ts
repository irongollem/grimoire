import { useSetCampaignLocation, useSetCampaignToday } from "@/composables/campaign/useCampaigns";
import { useCreateCalendarEvent, useDeleteCalendarEvent } from "@/composables/calendar/useCalendarEvents";
import { useAddInventoryItem, useRemoveInventoryItem, useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { addDays } from "@/lib/calendar/dayMath";
import { routeEventPrefill, type RouteSummary } from "@/lib/locations/mapRoute";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { isRationRow, takeFromRows, type ProvisionPlan } from "@/lib/travel/provisions";
import { getExhaustionLevel, setExhaustionLevel } from "@/rules/conditions";
import { useCampaignStore } from "@/stores/campaign";
import type { CalendarAdapter } from "@/types/calendar.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { AppliedCondition } from "@/types/condition.types";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";

type Traveller = Pick<PartyMember, "id" | "current_location_id" | "conditions" | "days_without_food">;

export interface SetOutPlan {
  destination: { id: string; name: string };
  summary: RouteSummary;
  /** The travel event's words; Markdown, stored as Tiptap JSON. */
  description: string;
  /** The members who go, as they stand now. */
  travellers: readonly Traveller[];
  /** Whether the party's own place moves too (it does when the party stands where the journey starts or inside it). */
  movesParty: boolean;
  adapter: CalendarAdapter;
  /** Only where the campaign counts food (the optional rule): what the journey eats, worked out by `planProvisions`. */
  provisions: null | { plan: ProvisionPlan; inventory: readonly PartyInventoryItem[] };
}

/**
 * Making the journey (#1222 decision 4): the travel event, the travellers and the party at the destination, the
 * day advanced and, where food is counted, the rations eaten and the hunger earned. One act with one Undo: what it
 * is about to change is read first, a failing step takes back the steps before it, and the Undo on the success
 * toast puts all of it back, the event deleted with it.
 */
export function useSetOut() {
  const campaign = useCampaignStore();
  const toast = useToast();
  const createEvent = useCreateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const updateMember = useUpdatePartyMember();
  const setLocation = useSetCampaignLocation();
  const setToday = useSetCampaignToday();
  const updateItem = useUpdateInventoryItem();
  const removeItem = useRemoveInventoryItem();
  const addItem = useAddInventoryItem();

  async function setOut(plan: SetOutPlan): Promise<void> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId || !campaign.activeCampaign) throw new Error("There is no campaign to set out in.");
    const start = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
    const arrival = addDays(plan.adapter, start, plan.summary.time.calendarDays);
    const partyWas = campaign.activeCampaign.current_location_id;
    const inventoryRows = new Map(plan.provisions?.inventory.map((r) => [r.id, r]));

    // What the rations take, decided before anything is written so the snapshot holds every row it will touch.
    const ration = new Map<string, number>(); // row id -> quantity after
    if (plan.provisions) {
      const rows = plan.provisions.inventory.filter(isRationRow);
      const draw = (from: readonly PartyInventoryItem[], count: number): void => {
        for (const taken of takeFromRows(from, count)) ration.set(taken.id, taken.newQuantity);
      };
      for (const t of plan.provisions.plan.travellers) {
        draw(rows.filter((r) => r.carried_by === t.id), t.fromOwn);
      }
      draw(rows.filter((r) => r.carried_by === null), plan.provisions.plan.fromStash);
    }

    const undos: (() => Promise<void>)[] = [];
    /** Takes back every step done, newest first, going on past one that will not undo; returns the first such failure. */
    const rollBack = async (): Promise<unknown> => {
      let failed: unknown = null;
      for (const undo of [...undos].reverse()) {
        try {
          await undo();
        } catch (cause) {
          failed ??= cause;
        }
      }
      return failed;
    };

    let eventId: string;
    try {
      const prefill = routeEventPrefill(plan.summary, start, plan.adapter, plan.travellers.map((t) => t.id));
      const event = await createEvent.mutateAsync({ ...prefill, description: toTiptapJson(plan.description) } as Parameters<typeof createEvent.mutateAsync>[0]);
      eventId = event.id;
      undos.push(async () => void (await deleteEvent.mutateAsync(eventId)));

      for (const t of plan.travellers) {
        const eaten = plan.provisions?.plan.travellers.find((p) => p.id === t.id);
        const was: { current_location_id: string | null; conditions?: AppliedCondition[]; days_without_food?: number } = { current_location_id: t.current_location_id };
        const next: typeof was = { current_location_id: plan.destination.id };
        if (eaten) {
          was.conditions = [...t.conditions];
          was.days_without_food = t.days_without_food;
          next.conditions = eaten.exhaustionGained > 0 ? setExhaustionLevel(t.conditions, getExhaustionLevel(t.conditions) + eaten.exhaustionGained) : [...t.conditions];
          next.days_without_food = eaten.daysWithoutFood;
        }
        await updateMember.mutateAsync({ id: t.id, update: next as PartyMemberUpdate });
        undos.push(async () => void (await updateMember.mutateAsync({ id: t.id, update: was as PartyMemberUpdate })));
      }

      if (plan.movesParty) {
        await setLocation.mutateAsync({ id: campaignId, locationId: plan.destination.id });
        undos.push(async () => void (await setLocation.mutateAsync({ id: campaignId, locationId: partyWas })));
      }

      for (const [id, newQuantity] of ration) {
        const row = inventoryRows.get(id);
        if (!row) continue;
        if (newQuantity === 0) {
          await removeItem.mutateAsync(id);
          const { id: _id, user_id: _user, campaign_id: _campaign, updated_at: _at, ...fields } = row;
          undos.push(async () => void (await addItem.mutateAsync(fields)));
        } else {
          await updateItem.mutateAsync({ id, update: { quantity: newQuantity } });
          undos.push(async () => void (await updateItem.mutateAsync({ id, update: { quantity: row.quantity } })));
        }
      }

      if (plan.summary.time.calendarDays > 0) {
        await setToday.mutateAsync({ id: campaignId, ...arrival });
        undos.push(async () => void (await setToday.mutateAsync({ id: campaignId, ...start })));
      }
    } catch (cause) {
      await rollBack();
      throw cause;
    }

    toast.success(`The party set out for ${plan.destination.name}. They arrive on ${plan.adapter.formatDate(arrival.year, arrival.month, arrival.day, null)}.`, undefined, {
      action: {
        label: "Undo",
        run: () => {
          void rollBack().then((failed) => {
            if (failed !== null) toast.error(toast.fromError(failed, "The journey could not be fully taken back"));
          });
        },
      },
    });
  }

  return { setOut };
}
