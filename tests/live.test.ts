import { afterAll, describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { chatWithAgent } from "@/services/agentService";
import { upsertMemory, getMemories } from "@/services/memoryService";
const live = describe.runIf(process.env.RUN_LIVE_LLM === "1");
live("Live LLM: semantic smoke test, requires provider key and quota", () => {
  afterAll(() => prisma.$disconnect());
  it("Учитывает контекст, сохраняет предпочтение инструментом, использует в новой сессии", async () => {
    const user = await prisma.user.create({ data: { username: `live_${Date.now()}`, role: "CLIENT" } });
    const ask = (sessionId: string, message: string) => chatWithAgent({ actorUserId: user.id, targetUserId: user.id, sessionId, message });
    try {
      await upsertMemory(user.id, user.id, "goal", "Python для Data Science");
      await ask("a", "Сегодня я изучаю градиентный спуск. Ответь одним предложением.");
      const context = await ask("a", "Какую тему я только что назвал? Ответь названием темы.");
      expect(context.reply.toLowerCase()).toMatch(/градиент/);
      await ask("a", "Сохрани инструментом saveUserMemory предпочтение preferred_format: короткие видеоуроки. Это моя постоянная предпочтительная форма обучения.");
      expect((await getMemories(user.id, user.id)).some(m => m.key === "preferred_format" && /видео/i.test(m.value))).toBe(true);
      const fresh = await ask("b", "Назови мою цель обучения и предпочтительный формат из сохранённых фактов.");
      expect(fresh.reply).toMatch(/Python/i); expect(fresh.reply).toMatch(/видео/i);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  }, 30000);
});
