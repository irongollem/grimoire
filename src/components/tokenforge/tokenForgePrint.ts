import type { TokenEntity } from "@/lib/tokenRenderer";

export const TOKEN_PRINT_SIZES = [
  { id: "s25" as const, label: "25mm", mm: 25, cols: 7, rows: 10, perSheet: 70,
    padH: "17.5mm", padV: "23.5mm" },
  { id: "s32" as const, label: "32mm", mm: 32, cols: 6, rows: 8,  perSheet: 48,
    padH: "9mm",    padV: "20.5mm" },
  { id: "s50" as const, label: "50mm", mm: 50, cols: 4, rows: 5,  perSheet: 20,
    padH: "5mm",    padV: "23.5mm" },
] as const;
export type TokenPrintSizeId = (typeof TOKEN_PRINT_SIZES)[number]["id"];

export const TOKEN_BACK_STYLES = [
  { id: "mystery" as const, label: "Mystery ?", desc: "Dark disc with ring colour and ?" },
  { id: "mirror"  as const, label: "Mirror",    desc: "Same image as front" },
] as const;
export type TokenBackStyleId = (typeof TOKEN_BACK_STYLES)[number]["id"];

export interface PrintQueueEntry {
  entity: TokenEntity;
  ringColor: string;
}
