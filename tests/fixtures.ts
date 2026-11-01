import { MockLanguageModelV1 } from "ai/test";
import type { LanguageModelV1 } from "ai";
export const textResult = (text: string) => ({ text, finishReason: "stop" as const, usage: { promptTokens: 10, completionTokens: 10 }, rawCall: { rawPrompt: null, rawSettings: {} } });
export function contextualModel() {
  return new MockLanguageModelV1({
    doGenerate: async ({ prompt }) => {
      const system = prompt.filter(m => m.role === "system").map(m => m.content).join(" ");
      const users = prompt.filter(m => m.role === "user").map(m => JSON.stringify(m.content));
      return textResult(`План на основе фактов: ${system.split("Известные факты")[1]?.split("Новые или")[0] || ""}. Контекст: ${users.join("; ")}`);
    },
  });
}
export function savingModel(key: string, value: string) {
  let calls = 0;
  const model = new MockLanguageModelV1({ doGenerate: async ({ prompt }) => {
    calls++;
    if (calls === 1) return { ...textResult(""), finishReason: "tool-calls", toolCalls: [{ toolCallType: "function", toolCallId: "save-1", toolName: "saveUserMemory", args: JSON.stringify({ key, value }) }] };
    if (!prompt.some(m => m.role === "tool")) throw new Error("Tool result missing");
    return textResult(`Сохранено: ${value}`);
  } });
  return { model: model as LanguageModelV1, getCalls: () => calls };
}
