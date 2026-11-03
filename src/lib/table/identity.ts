// Who a table mark is from (#1125 decision 12): a name and a colour. The colour is the drawer's own, picked from the
// user id so it is the same on every screen and across sessions with nothing stored.

const INKS = ["#e11d48", "#f59e0b", "#10b981", "#06b6d4", "#6366f1", "#d946ef", "#84cc16", "#f97316"] as const;

export function senderColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return INKS[h % INKS.length];
}
