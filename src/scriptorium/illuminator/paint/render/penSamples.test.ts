import { describe, expect, it } from "vitest";
import { readPen, toSamples, type PointerEventLike } from "./penSamples";

const ev = (over: Partial<PointerEventLike>): PointerEventLike => ({
  clientX: 0,
  clientY: 0,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  twist: 0,
  timeStamp: 0,
  pointerType: "pen",
  ...over,
});

describe("toSamples", () => {
  const vp = { scale: 2, offsetX: 10, offsetY: 20 };
  const origin = { left: 100, top: 50 };

  it("turns every coalesced event into a sample, in document space (fails if only the main event is used)", () => {
    const main = ev({ clientX: 160, clientY: 100, timeStamp: 3 });
    main.getCoalescedEvents = () => [
      ev({ clientX: 120, clientY: 70, timeStamp: 1, pressure: 0.2 }),
      ev({ clientX: 140, clientY: 80, timeStamp: 2, pressure: 0.4 }),
      main,
    ];
    const samples = toSamples(main, origin, vp);
    expect(samples).toHaveLength(3);
    // (120-100-10)/2 = 5 ; (70-50-20)/2 = 0
    expect(samples[0]).toMatchObject({ x: 5, y: 0, pressure: 0.2, time: 1, pointer: "pen" });
    expect(samples[2]).toMatchObject({ x: 25, y: 15, time: 3 });
  });

  it("falls back to the event itself when the browser has no coalesced list, or an empty one", () => {
    const a = ev({ clientX: 110, clientY: 70 });
    expect(toSamples(a, origin, vp)).toHaveLength(1);
    a.getCoalescedEvents = () => [];
    expect(toSamples(a, origin, vp)).toHaveLength(1);
  });

  it("passes a mouse's pressure through and gives a finger with no force a usable one", () => {
    expect(toSamples(ev({ pointerType: "mouse", pressure: 0.5 }), origin, vp)[0]).toMatchObject({
      pointer: "mouse",
      pressure: 0.5,
    });
    expect(toSamples(ev({ pointerType: "touch", pressure: 0 }), origin, vp)[0].pressure).toBe(0.5);
    expect(toSamples(ev({ pointerType: "pen", pressure: 0 }), origin, vp)[0].pressure).toBe(0);
  });
});

describe("readPen", () => {
  // Fails if a mouse's fixed pressure is read as a pen reporting pressure, which would tell a DM their pen works when it does not.
  it("a mouse reports nothing", () => {
    expect(readPen(null, ev({ pointerType: "mouse", pressure: 0.5 })).reported).toEqual({ pressure: false, tilt: false, rotation: false });
  });

  // Fails if a pen held upright for one event forgets that it reports tilt, so the status flickers off.
  it("keeps a signal reported once a pen has sent it", () => {
    const a = readPen(null, ev({ tiltX: 30, tiltY: 40, twist: 90 }));
    expect(a.tilt).toBe(50);
    const b = readPen(a, ev({ tiltX: 0, tiltY: 0, twist: 0, pressure: 0.7 }));
    expect(b.reported).toEqual({ pressure: true, tilt: true, rotation: true });
    expect(b.pressure).toBe(0.7);
  });
});

describe("tilt from altitude and azimuth", () => {
  it("a Safari Pencil leaning along x reports a tilt instead of upright (fails if only tiltX/tiltY are read)", () => {
    const [s] = toSamples(ev({ altitudeAngle: Math.PI / 4, azimuthAngle: 0 }), { left: 0, top: 0 }, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(s?.tiltX).toBeCloseTo(45);
    expect(s?.tiltY).toBeCloseTo(0);
  });

  it("an upright Pencil stays at zero tilt (fails if altitude pi/2 is converted)", () => {
    const [s] = toSamples(ev({ altitudeAngle: Math.PI / 2, azimuthAngle: 1 }), { left: 0, top: 0 }, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(s?.tiltX).toBe(0);
    expect(s?.tiltY).toBe(0);
  });

  it("a real tiltX wins over altitude (fails if the conversion overrides a browser that reports tilt)", () => {
    const [s] = toSamples(ev({ tiltX: 20, altitudeAngle: Math.PI / 4, azimuthAngle: 0 }), { left: 0, top: 0 }, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(s?.tiltX).toBe(20);
  });

  it("the Pen view counts a Safari Pencil's lean as reported tilt (fails if readPen skips altitude)", () => {
    const r = readPen(null, ev({ altitudeAngle: Math.PI / 4, azimuthAngle: Math.PI / 2 }));
    expect(r.reported.tilt).toBe(true);
    expect(r.tilt).toBe(45);
  });
});
