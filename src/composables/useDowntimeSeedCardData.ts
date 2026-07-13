import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { DowntimeSeed } from "@/types/downtime.types";
import { getDowntimeActivity, RISK_LABELS } from "@/data/downtimeActivities";
import { describeEffect } from "@/lib/downtimeEffects";
import { truncateCard } from "@/types/card.types";

/**
 * Normalized data for one Interlude *outcome* card — design-agnostic.
 *
 * The archetype card is the menu; this is what the menu yields. Printed, these
 * are the face-down stack a DM draws from once a player lays down "Carouse", so
 * the physical deck behaves like the app's: prepped backs first, then a random
 * one of these.
 *
 * The front carries the reward's own art (a contact's portrait, an item's
 * picture). Note-yielding seeds have none — `notes` has no image column — so
 * they fall back to the archetype's procedural accent + glyph, which is exactly
 * what the on-screen card does.
 */
export function useDowntimeSeedCardData(data: MaybeRefOrGetter<DowntimeSeed>) {
  const activity = computed(() => getDowntimeActivity(toValue(data).activityKey));

  /** The archetype's own art is the fallback, so a note card is never blank. */
  const accent = computed(() => activity.value?.accent ?? "#2C3440");
  const glyph = computed(() => activity.value?.glyph ?? "🎴");
  const activityTitle = computed(() => activity.value?.title ?? "??? (unknown)");

  const reward = computed(() => toValue(data).reward);

  /** The art on the reward itself. Null for notes — the glyph face takes over. */
  const portrait = computed(() => {
    const r = reward.value;
    switch (r.kind) {
      case "npc":
        return r.npc.portrait_url;
      case "item":
        return r.item.image_url;
      case "note":
        return null;
    }
  });

  /** What the draw actually hands over, named. */
  const rewardName = computed(() => {
    const r = reward.value;
    switch (r.kind) {
      case "npc":
        return r.npc.name;
      case "item":
        return r.item.name;
      case "note":
        return r.note.title;
    }
  });

  const rewardNoun = computed(() => {
    switch (reward.value.kind) {
      case "npc":
        return "Contact";
      case "item":
        return "Item";
      case "note":
        return "Note";
    }
  });

  const typeTag = computed(() => `${activityTitle.value} · ${rewardNoun.value}`.toUpperCase());
  const typeLine = computed(() => `${activityTitle.value} — yields ${rewardName.value}`);

  const riskLabel = computed(() =>
    activity.value ? RISK_LABELS[activity.value.risk] : "???",
  );

  const stats = computed(() => [
    { label: "FROM", value: activityTitle.value },
    { label: "YIELD", value: rewardNoun.value },
  ]);

  /** The consequences, in the same words the resolution board uses. */
  const effects = computed(() =>
    toValue(data).proposedEffects.map((e) => ({
      kind: e.kind,
      text: describeEffect(e),
      note: e.note,
    })),
  );

  const metaRows = computed(() => [
    { label: "From", value: activityTitle.value },
    { label: "Risk", value: riskLabel.value },
    { label: "Yields", value: `${rewardNoun.value} — ${rewardName.value}` },
  ]);

  return {
    activity,
    accent,
    glyph,
    activityTitle,
    portrait,
    rewardName,
    rewardNoun,
    riskLabel,
    typeTag,
    typeLine,
    stats,
    effects,
    metaRows,
    truncate: truncateCard,
  };
}
