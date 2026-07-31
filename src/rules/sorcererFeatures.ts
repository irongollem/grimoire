import type { PartyMember } from "@/types/party.types";

export function sorceryPointMaximum(level: number): number {
  return level >= 2 ? Math.min(Math.max(Math.floor(level), 0), 20) : 0;
}

export function sorcerousRestorationAmount(level: number, current: number, maximum: number): number {
  if (level < 5) return 0;
  return Math.min(Math.floor(level / 2), Math.max(maximum - current, 0));
}

export function isInnateSorceryActive(member: Pick<PartyMember, "class_choices">, now = Date.now()): boolean {
  if (member.class_choices?.innate_sorcery_active !== true) return false;
  const expiresAt = member.class_choices?.innate_sorcery_expires_at;
  return typeof expiresAt === "string" && Date.parse(expiresAt) > now;
}

export function metamagicLimit(ruleset: "2014" | "2024", sorcererLevel: number, innateActive: boolean): 1 | 2 {
  return ruleset === "2024" && sorcererLevel >= 7 && innateActive ? 2 : 1;
}

