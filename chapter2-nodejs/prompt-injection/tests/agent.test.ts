import { describe, expect, it } from "vitest";
import { PromptInjectionAgent } from "../src/agent.js";
import { findAttack } from "../src/attacks.js";
import { findDefense } from "../src/defenses.js";
import { ScriptedAttackGateway } from "../src/offline-gateway.js";

describe("PromptInjectionAgent 离线防御", () => {
  it("D1 间接注入导致越权写文件", async () => {
    const result = await run("indirect", "d1");

    expect(findAttack("indirect").succeeded(result)).toBe(true);
    expect(result.executedToolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "write_file" }),
      ]),
    );
  });

  it("D4 即使模型请求写文件也由运行时校验拦截", async () => {
    const result = await run("indirect", "d4");

    expect(findAttack("indirect").succeeded(result)).toBe(false);
    expect(result.requestedToolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "write_file" }),
      ]),
    );
    expect(result.blockedToolCalls).toHaveLength(1);
  });

  it("D4 允许用户要求的保存，但拦截被记忆注入诱导的邮件", async () => {
    const result = await run("memory", "d4");

    expect(findAttack("memory").succeeded(result)).toBe(false);
    expect(
      result.executedToolCalls.some(
        (call) => call.name === "write_file",
      ),
    ).toBe(true);
    expect(
      result.blockedToolCalls.some(
        (call) => call.name === "send_email",
      ),
    ).toBe(true);
  });
});

async function run(
  attackId: "indirect" | "memory",
  defenseId: "d1" | "d4",
) {
  const attack = findAttack(attackId);
  const defense = findDefense(defenseId);
  return await new PromptInjectionAgent({
    gateway: new ScriptedAttackGateway(attackId, defenseId),
    model: "offline",
    defense,
    webpageContent: attack.webpageContent,
    maxSteps: 6,
    temperature: 0,
  }).run(attack.userMessages);
}
