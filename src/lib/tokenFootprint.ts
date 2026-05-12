// Map D&D 5e creature sizes to the cell footprint a VTT token occupies.

export type TokenFootprint = 1 | 2 | 3 | 4;

const FOOTPRINTS: Record<string, TokenFootprint> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export function sizeToFootprint(size: string | null | undefined): TokenFootprint {
  if (!size) return 1;
  return FOOTPRINTS[size.trim().toLowerCase()] ?? 1;
}
