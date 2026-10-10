/** "Recharge 5-6": the ability returns on a d6 inside the range. */
export function rechargeSucceeds(d6: number, recharge: { min: number; max: number }): boolean {
  return d6 >= recharge.min && d6 <= recharge.max;
}
