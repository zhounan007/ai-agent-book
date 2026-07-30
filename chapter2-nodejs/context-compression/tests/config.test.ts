import { describe, expect, it } from "vitest";
import { parseStrategy } from "../src/config.js";

describe("parseStrategy", () => {
  it.each(["none", "sliding-window", "context-aware"] as const)(
    "接受 %s",
    (strategy) => {
      expect(parseStrategy(strategy)).toBe(strategy);
    },
  );

  it("拒绝未知策略", () => {
    expect(() => parseStrategy("truncate")).toThrow(
      "压缩策略必须是",
    );
  });
});
