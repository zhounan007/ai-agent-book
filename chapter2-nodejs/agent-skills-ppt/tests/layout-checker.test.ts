import { describe, expect, it } from "vitest";
import { SlideLayoutTracker } from "../src/pptx/layout-checker.js";

describe("SlideLayoutTracker", () => {
  it("reports elements outside the slide canvas", () => {
    const tracker = new SlideLayoutTracker(2, 13.333, 7.5);
    tracker.add({
      name: "bad-title",
      kind: "text",
      x: 12.8,
      y: 0.4,
      w: 1,
      h: 0.5,
    });

    expect(tracker.report().issues).toMatchObject([
      { type: "out-of-bounds", elements: ["bad-title"] },
    ]);
  });

  it("reports unintended overlaps but supports explicit overlap", () => {
    const tracker = new SlideLayoutTracker(3, 13.333, 7.5);
    tracker.add({
      name: "first",
      kind: "text",
      x: 1,
      y: 1,
      w: 3,
      h: 2,
    });
    tracker.add({
      name: "second",
      kind: "text",
      x: 2,
      y: 2,
      w: 3,
      h: 2,
    });
    tracker.add({
      name: "background",
      kind: "shape",
      x: 0,
      y: 0,
      w: 10,
      h: 6,
      allowOverlap: true,
    });

    expect(tracker.report().issues).toMatchObject([
      { type: "overlap", elements: ["first", "second"] },
    ]);
  });
});
