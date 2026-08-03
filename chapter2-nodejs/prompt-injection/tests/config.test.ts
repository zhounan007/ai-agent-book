import { describe, expect, it } from "vitest";
import {
  parseAttack,
  parseDefense,
} from "../src/config.js";

describe("CLI 枚举解析", () => {
  it.each(["direct", "indirect", "memory"] as const)(
    "接受攻击 %s",
    (value) => expect(parseAttack(value)).toBe(value),
  );

  it.each(["d1", "d2", "d3", "d4"] as const)(
    "接受防御 %s",
    (value) => expect(parseDefense(value)).toBe(value),
  );

  it("拒绝未知值", () => {
    expect(() => parseAttack("web")).toThrow("攻击场景必须是");
    expect(() => parseDefense("d5")).toThrow("防御配置必须是");
  });
});
