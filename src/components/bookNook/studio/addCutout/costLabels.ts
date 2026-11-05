/** The wording of what each way of adding a cut-out costs, from the price of one picture (frame 06). */
const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

/** Paint is one picture. */
export const paintLabel = (picture: number) => `Paint · ${credits(picture)}`;
/** Lift is two: the cut-out and the fill behind it. */
export const liftCredits = (picture: number) => picture * 2;
export const liftLabel = (picture: number) => `Lift · ${credits(liftCredits(picture))}`;
/** Remove background is a lift on one uploaded picture: one picture. */
export const removeBackgroundLabel = (picture: number) => `Remove background · ${credits(picture)}`;

export const LIFT_PRICE_NOTE = "Priced as two pictures";
export const PAINT_PRICE_NOTE = "Priced as one picture";

export const EMPTY_SHELF = "The shelf is being painted. New parts arrive here as they are finished.";
export const FILL_FAILED =
  "The cut-out is in. Painting the gap behind it failed, so its twin is still in the picture: try Lift again or paint over it later.";
