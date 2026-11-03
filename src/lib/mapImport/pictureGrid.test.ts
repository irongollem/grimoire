import { describe, expect, it } from "vitest";
import {
  DEFAULT_SQUARES_ACROSS,
  calibrationFor,
  calibrationFromBox,
  clientToImage,
  fiveFootCalibration,
  gridLines,
  initialGrid,
  shiftGrid,
  squaresDown,
  squaresText,
  gridSizeText,
  withSquaresAcross,
} from "./pictureGrid";

const pic = { width: 3000, height: 2000 };

describe("initialGrid", () => {
  it("reads the squares across from the file name, so the DM has nothing to type", () => {
    const { calibration, source } = initialGrid("riverside-ambush_30x20.webm", pic);
    expect(calibration.cells_per_image_width).toBe(30);
    expect(source).toBe("name");
  });

  it("reads pixels per square from the name when no size is given (150 ppi on 3000 px is 20 across)", () => {
    expect(initialGrid("forest_150ppi.png", pic).calibration.cells_per_image_width).toBe(20);
  });

  it("falls back to 30 across and says it guessed", () => {
    const { calibration, source } = initialGrid("tavern.jpg", pic);
    expect(calibration.cells_per_image_width).toBe(DEFAULT_SQUARES_ACROSS);
    expect(source).toBe("default");
  });
});

describe("squaresDown", () => {
  it("follows the picture's shape: 3000 x 2000 at 30 across is 20 down", () => {
    expect(squaresDown({ cells_per_image_width: 30 }, pic)).toBe(20);
  });
});

describe("squaresText", () => {
  it("a fractional count reads as a rounded 'about' number, so nobody is shown 20.7 squares", () => {
    expect(squaresText(20.7)).toBe("about 21");
  });
  it("a whole count (or one off by float dust) stays plain", () => {
    expect(squaresText(20)).toBe("20");
    expect(squaresText(19.99999)).toBe("20");
  });
});

describe("gridSizeText", () => {
  it("states the hint without a decimal tail on the squares down", () => {
    expect(gridSizeText({ cells_per_image_width: 30 }, { width: 1500, height: 1035 })).toBe("30 × about 21 squares");
  });
});

describe("calibrationFromBox", () => {
  it("a box over one 100 px square on a 3000 px map makes 30 across", () => {
    expect(calibrationFromBox({ x0: 253, y0: 340, x1: 353, y1: 440 }, pic)?.cells_per_image_width).toBeCloseTo(30, 6);
  });

  it("reads the same box dragged from any corner (a hand-drawn 100 x 60 box is an 80 px square)", () => {
    const fromTopLeft = calibrationFromBox({ x0: 253, y0: 340, x1: 353, y1: 400 }, pic);
    const fromBottomRight = calibrationFromBox({ x0: 353, y0: 400, x1: 253, y1: 340 }, pic);
    expect(fromBottomRight).toEqual(fromTopLeft);
    expect(fromTopLeft?.origin_x_pct).toBeCloseTo((253 % 80) / 3000, 6);
    expect(fromTopLeft?.origin_y_pct).toBeCloseTo((340 % 80) / 2000, 6);
  });

  it("puts a grid line on the box's top-left corner (250 px is 50 px into a 100 px square)", () => {
    const cal = calibrationFromBox({ x0: 250, y0: 340, x1: 350, y1: 440 }, pic);
    expect(cal?.origin_x_pct).toBeCloseTo(50 / 3000, 6);
    expect(cal?.origin_y_pct).toBeCloseTo(40 / 2000, 6);
  });

  it("takes the average of a hand-drawn box's two sides as the square (90 x 110 is a 100 px square)", () => {
    expect(calibrationFromBox({ x0: 0, y0: 0, x1: 90, y1: 110 }, pic)?.cells_per_image_width).toBeCloseTo(30, 6);
  });

  it("ignores a slip of the hand instead of dividing by almost nothing", () => {
    expect(calibrationFromBox({ x0: 10, y0: 10, x1: 12, y1: 12 }, pic)).toBeNull();
  });
});

describe("shiftGrid", () => {
  it("wraps at one square, since the grid repeats", () => {
    const cal = calibrationFor(pic, 30);
    const moved = shiftGrid(cal, pic, 130, 0);
    expect(moved.origin_x_pct).toBeCloseTo(30 / 3000, 6);
  });

  it("slides back past the edge the other way", () => {
    const moved = shiftGrid(calibrationFor(pic, 30), pic, -1, -1);
    expect(moved.origin_x_pct).toBeCloseTo(99 / 3000, 6);
    expect(moved.origin_y_pct).toBeCloseTo(99 / 2000, 6);
  });
});

describe("gridLines", () => {
  it("draws a line at every square from the origin to the far edge", () => {
    const { xs, ys } = gridLines(calibrationFor(pic, 30, { x: 25, y: 40 }), pic);
    expect(xs[0]).toBeCloseTo(25, 6);
    expect(ys[0]).toBeCloseTo(40, 6);
    expect(xs).toHaveLength(30);
    expect(ys).toHaveLength(20);
  });
});

describe("clientToImage", () => {
  it("leaves out the letterbox: a 3:2 picture in a square frame starts a sixth of the way down", () => {
    const rect = { left: 100, top: 50, width: 600, height: 600 };
    const p = clientToImage(rect, pic, 100, 50 + 100);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    const far = clientToImage(rect, pic, 700, 550);
    expect(far.x).toBeCloseTo(3000, 6);
    expect(far.y).toBeCloseTo(2000, 6);
  });
});

describe("clientToImage in a frame taller than the picture", () => {
  it("leaves out the side margins when the picture is the narrow one", () => {
    const tall = { width: 1000, height: 2000 };
    const rect = { left: 0, top: 0, width: 1000, height: 1000 }; // scale 0.5: the picture is 500 wide, centred
    expect(clientToImage(rect, tall, 250, 0).x).toBeCloseTo(0, 6);
    expect(clientToImage(rect, tall, 750, 1000).x).toBeCloseTo(1000, 6);
  });
});

describe("fiveFootCalibration", () => {
  it("writes 10 ft squares as twice the squares across, so the 5 ft battle grid lines up", () => {
    expect(fiveFootCalibration(calibrationFor(pic, 15), pic, 10).cells_per_image_width).toBe(30);
  });

  it("leaves 5 ft squares as they are", () => {
    const cal = calibrationFor(pic, 15);
    expect(fiveFootCalibration(cal, pic, 5)).toBe(cal);
  });

  it("wraps the origin into the smaller square so a 10 ft grid line stays a grid line", () => {
    const cal = calibrationFor(pic, 15, { x: 150, y: 0 }); // 10 ft square = 200 px, line at 150
    const doubled = fiveFootCalibration(cal, pic, 10);
    expect(doubled.origin_x_pct).toBeCloseTo(50 / 3000, 6); // 150 mod 100
  });
});

describe("withSquaresAcross", () => {
  it("keeps the line the DM lined up when the count changes (a 150 px line is still a line at 100 px squares)", () => {
    const cal = calibrationFor(pic, 15, { x: 150, y: 0 });
    const next = withSquaresAcross(cal, pic, 30);
    expect(next.cells_per_image_width).toBe(30);
    expect(next.origin_x_pct).toBeCloseTo(50 / 3000, 6);
  });

  it("does not drop the DM's grid opacity, or the origin cell a publish wrote", () => {
    const cal = { ...calibrationFor(pic, 15), grid_opacity: 0.2, origin_cell_x: 4, origin_cell_y: 7 };
    expect(withSquaresAcross(cal, pic, 20)).toMatchObject({ grid_opacity: 0.2, origin_cell_x: 4, origin_cell_y: 7 });
  });
});
