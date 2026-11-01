import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type User } from "@prisma/client";
import { MockLanguageModelV1 } from "ai/test";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { getMemories, upsertMemory, deleteMemory, getChatHistory, getAllUsersWithMemories } from "@/services/memoryService";
import { chatWithAgent } from "@/services/agentService";
import { contextualModel, savingModel, textResult } from "./fixtures";
import { GET as memoriesGET, PUT, DELETE } from "@/app/api/memories/route";
import { GET as historyGET, POST } from "@/app/api/chat/route";
import { GET as adminGET } from "@/app/api/admin/users/route";
import { GET as demoGET } from "@/app/api/demo/users/route";
import * as modelFactory from "@/lib/model";
import { apiError } from "@/lib/http";
let c1: User, c2: User, admin: User;
beforeEach(async () => {
  vi.restoreAllMocks();
  await prisma.user.deleteMany();
  [c1, c2, admin] = await Promise.all([
    prisma.user.create({ data: { username: "client_1", role: "CLIENT" } }),
    prisma.user.create({ data: { username: "client_2", role: "CLIENT" } }),
    prisma.user.create({ data: { username: "admin", role: "ADMIN" } }),
  ]);
  await upsertMemory(c1.id, c1.id, "goal", "Python для Data Science");
  await upsertMemory(c1.id, c1.id, "preferred_format", "видеоуроки");
  await upsertMemory(c2.id, c2.id, "goal", "Frontend/React");
  await upsertMemory(c2.id, c2.id, "preferred_format", "текстовые конспекты");
});
afterAll(() => prisma.$disconnect());
const chat = (user: User, sessionId: string, message: string) => chatWithAgent({ actorUserId: user.id, targetUserId: user.id, sessionId, message }, contextualModel());
const req = (path: string, user?: User, method = "GET", body?: unknown) => new Request(`http://localhost${path}`, { method, headers: { ...(user ? { "x-user-id": user.id } : {}), "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
describe("Обязательные сценарии ТЗ · SQL + настоящий generateText с тестовой моделью", () => {
  it("1. Передаёт предыдущие реплики только текущего пользователя и диалога", async () => {
    await chat(c2, "same-session", "Чужой секрет: Zebra");
    await chat(c1, "other-session", "Другая сессия: Kotlin");
    await chat(c1, "same-session", "Тема занятия: градиентный спуск");
    const result = await chat(c1, "same-session", "Какую тему я только что назвал?");
    expect(result.reply).toContain("градиентный спуск");
    expect(result.reply).not.toContain("Zebra"); expect(result.reply).not.toContain("Kotlin");
    const history = await getChatHistory(c1.id, c1.id, "same-session");
    expect(history.map(m => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(history[0].content).toContain("градиентный спуск");
    expect(history[3].content).toBe(result.reply);
  });
  it("2. Выполняет Tool Calling, сохраняет факт и использует его в новом диалоге", async () => {
    const saving = savingModel("preferred_format", "практика с автотестами");
    const result = await chatWithAgent({ actorUserId: c1.id, targetUserId: c1.id, sessionId: "login-1", message: "Запомни: предпочитаю практику с автотестами" }, saving.model);
    expect(saving.getCalls()).toBe(2); expect(result.reply).toContain("Сохранено");
    expect(await prisma.userMemory.count({ where: { userId: c1.id, key: "preferred_format" } })).toBe(1);
    expect(await getChatHistory(c1.id, c1.id, "login-2")).toEqual([]);
    expect((await chat(c1, "login-2", "Как лучше учиться?")).reply).toContain("практика с автотестами");
    expect((await getMemories(c2.id, c2.id)).find(m => m.key === "preferred_format")?.value).toBe("текстовые конспекты");
  });
  it("3. Персонализирует одинаковые вопросы и сразу перечитывает изменённую SQL-память", async () => {
    const question = "Порекомендуй план обучения на сегодня";
    const one = await chat(c1, "personal-1", question); const two = await chat(c2, "personal-2", question);
    expect(one.reply).toContain("Python"); expect(one.reply).toContain("видеоуроки");
    expect(two.reply).toContain("React"); expect(two.reply).toContain("текстовые конспекты"); expect(one.reply).not.toBe(two.reply);
    await upsertMemory(admin.id, c1.id, "goal", "Rust и WebAssembly");
    const changed = await chat(c1, "personal-new", question);
    expect(changed.reply).toContain("Rust"); expect(changed.reply).not.toContain("Data Science");
  });
  it("4. Блокирует чужую память, историю, чат и административный метод до запросов к данным", async () => {
    const read = vi.spyOn(prisma.userMemory, "findMany"); const write = vi.spyOn(prisma.userMemory, "upsert");
    const remove = vi.spyOn(prisma.userMemory, "deleteMany"); const history = vi.spyOn(prisma.chatMessage, "findMany"); const users = vi.spyOn(prisma.user, "findMany");
    const attempts = [() => getMemories(c1.id, c2.id), () => upsertMemory(c1.id, c2.id, "goal", "hacked"), () => deleteMemory(c1.id, c2.id, "goal"), () => getChatHistory(c1.id, c2.id, "any"), () => getAllUsersWithMemories(c1.id), () => chatWithAgent({ actorUserId: c1.id, targetUserId: c2.id, sessionId: "any", message: "Hello" }, contextualModel())];
    for (const attempt of attempts) { await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError); await expect(attempt()).rejects.toMatchObject({ status: 403 }); }
    for (const spy of [read, write, remove, history, users]) expect(spy).not.toHaveBeenCalled();
    expect(await getMemories(admin.id, c1.id)).toHaveLength(2); expect(await getMemories(admin.id, c2.id)).toHaveLength(2);
    for (const client of [c1, c2]) { await upsertMemory(admin.id, client.id, "level", "продвинутый"); expect((await getMemories(admin.id, client.id)).some(m => m.value === "продвинутый")).toBe(true); }
    expect(await getAllUsersWithMemories(admin.id)).toHaveLength(3);
    expect(await deleteMemory(admin.id, c2.id, "level")).toEqual({ deleted: 1 });
  });
});
describe("Дополнительные гарантии хранения и агента", () => {
  it("Upsert не дублирует ключ; изменение и удаление сохраняются при новом соединении", async () => {
    await upsertMemory(c1.id, c1.id, "goal", "TypeScript");
    const other = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    try { expect(await other.userMemory.count({ where: { userId: c1.id, key: "goal" } })).toBe(1); expect((await other.userMemory.findFirst({ where: { userId: c1.id, key: "goal" } }))?.value).toBe("TypeScript"); } finally { await other.$disconnect(); }
    expect(await deleteMemory(c1.id, c1.id, "goal")).toEqual({ deleted: 1 });
    expect(await deleteMemory(c1.id, c1.id, "goal")).toEqual({ deleted: 0 });
  });
  it("Удаление пользователя каскадно удаляет память и историю", async () => {
    await chat(c1, "cascade", "Привет"); await prisma.user.delete({ where: { id: c1.id } });
    expect(await prisma.userMemory.count({ where: { userId: c1.id } })).toBe(0); expect(await prisma.chatMessage.count({ where: { userId: c1.id } })).toBe(0);
  });
  it("Неизвестный actor не авторизован; несуществующий target скрыт от клиента", async () => {
    await expect(getMemories("", c1.id)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(getMemories("missing", c1.id)).rejects.toMatchObject({ status: 401 });
    await expect(getMemories(c1.id, "missing")).rejects.toMatchObject({ status: 403 });
    await expect(chatWithAgent({ actorUserId: admin.id, targetUserId: c1.id, sessionId: "x", message: "Hi" }, contextualModel())).rejects.toMatchObject({ status: 403 });
  });
  it("Проверяет пустые/некорректные данные на сервисном уровне", async () => {
    await expect(upsertMemory(c1.id, c1.id, "bad key", "fact")).rejects.toThrow();
    await expect(upsertMemory(c1.id, c1.id, "goal", " ")).rejects.toThrow();
    await expect(chatWithAgent({ actorUserId: c1.id, targetUserId: c1.id, sessionId: "", message: "Hi" }, contextualModel())).rejects.toThrow();
  });
  it("При ошибке модели не сохраняет половину диалога", async () => {
    const model = new MockLanguageModelV1({ doGenerate: async () => { throw new Error("Provider failed"); } });
    await expect(chatWithAgent({ actorUserId: c1.id, targetUserId: c1.id, sessionId: "failed", message: "Hi" }, model)).rejects.toThrow();
    expect(await getChatHistory(c1.id, c1.id, "failed")).toEqual([]);
  });
  it("Не записывает пустой ответ после исчерпания шагов", async () => {
    let calls = 0;
    const model = new MockLanguageModelV1({ doGenerate: async () => { calls++; return { ...textResult(""), finishReason: "tool-calls", toolCalls: [{ toolCallType: "function", toolCallId: `t-${calls}`, toolName: "saveUserMemory", args: JSON.stringify({ key: "level", value: "средний" }) }] }; } });
    await expect(chatWithAgent({ actorUserId: c1.id, targetUserId: c1.id, sessionId: "steps", message: "Запомни уровень" }, model)).rejects.toThrow("LLM_EMPTY_RESPONSE");
    expect(calls).toBe(3); expect(await getChatHistory(c1.id, c1.id, "steps")).toEqual([]);
  });
  it("Инструмент не принимает подставленный userId", async () => {
    const model = new MockLanguageModelV1({ doGenerate: async () => ({ ...textResult(""), finishReason: "tool-calls", toolCalls: [{ toolCallType: "function", toolCallId: "attack", toolName: "saveUserMemory", args: JSON.stringify({ key: "goal", value: "hacked", userId: c2.id }) }] }) });
    await expect(chatWithAgent({ actorUserId: c1.id, targetUserId: c1.id, sessionId: "tool-attack", message: "Hi" }, model)).rejects.toThrow();
    expect((await getMemories(c2.id, c2.id)).find(m => m.key === "goal")?.value).toBe("Frontend/React");
  });
});
describe("API: статусы, валидация и RBAC", () => {
  it("CRUD клиента и администратора работает через HTTP handlers", async () => {
    expect((await memoriesGET(req(`/api/memories?targetUserId=${c1.id}`, c1))).status).toBe(200);
    const put = await PUT(req("/api/memories", c1, "PUT", { targetUserId: c1.id, key: "level", value: "эксперт" }));
    expect(put.status).toBe(200); expect((await put.json()).value).toBe("эксперт");
    expect((await DELETE(req("/api/memories", c1, "DELETE", { targetUserId: c1.id, key: "level" }))).status).toBe(200);
    expect((await adminGET(req("/api/admin/users", admin))).status).toBe(200);
    expect((await demoGET()).status).toBe(200);
    expect((await historyGET(req(`/api/chat?targetUserId=${c1.id}&sessionId=empty`, c1))).status).toBe(200);
  });
  it("Успешный POST чата сохраняет SQL-историю через API", async () => {
    vi.spyOn(modelFactory, "getModel").mockReturnValue(contextualModel());
    const result = await POST(req("/api/chat", c1, "POST", { targetUserId: c1.id, sessionId: "api-success", message: "Мой план?" }));
    expect(result.status).toBe(200);
    expect((await result.json()).reply).toContain("Python");
    const history = await historyGET(req(`/api/chat?targetUserId=${c1.id}&sessionId=api-success`, c1));
    expect(await history.json()).toHaveLength(2);
  });
  it("Возвращает 403 при всех межпользовательских запросах клиента", async () => {
    const responses = await Promise.all([
      memoriesGET(req(`/api/memories?targetUserId=${c2.id}`, c1)),
      PUT(req("/api/memories", c1, "PUT", { targetUserId: c2.id, key: "goal", value: "hack" })),
      DELETE(req("/api/memories", c1, "DELETE", { targetUserId: c2.id, key: "goal" })),
      historyGET(req(`/api/chat?targetUserId=${c2.id}&sessionId=x`, c1)),
      POST(req("/api/chat", c1, "POST", { targetUserId: c2.id, sessionId: "x", message: "Hi" })), adminGET(req("/api/admin/users", c1)),
    ]);
    for (const response of responses) expect(response.status).toBe(403);
  });
  it("401 без заголовка; 400 для невалидного JSON, полей и больших тел", async () => {
    expect((await memoriesGET(req(`/api/memories?targetUserId=${c1.id}`))).status).toBe(401);
    expect((await historyGET(req("/api/chat", c1))).status).toBe(400);
    expect((await POST(req("/api/chat", c1, "POST", { actorUserId: admin.id, sessionId: "x", message: "Hi" }))).status).toBe(400);
    expect((await PUT(new Request("http://localhost/api/memories", { method: "PUT", headers: { "x-user-id": c1.id }, body: "broken" }))).status).toBe(400);
    expect((await DELETE(req("/api/memories", c1, "DELETE", { key: "goal" }))).status).toBe(400);
    expect((await POST(req("/api/chat", c1, "POST", { targetUserId: c1.id, sessionId: "x", message: "x".repeat(21000) }))).status).toBe(400);
  });
  it("Закрывает демо-вход по умолчанию при отключённом флаге", async () => {
    vi.stubEnv("DEMO_AUTH_ENABLED", "false");
    try { expect((await demoGET()).status).toBe(403); expect((await memoriesGET(req(`/api/memories?targetUserId=${c1.id}`, c1))).status).toBe(403); }
    finally { vi.unstubAllEnvs(); }
  });
  it("Ошибки БД не раскрывают секреты; отсутствующая цель возвращает 404", async () => {
    const response = apiError(new Error("postgresql://secret:password@private/db"));
    expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("password");
    expect((await PUT(req("/api/memories", admin, "PUT", { targetUserId: "nonexistent", key: "goal", value: "x" }))).status).toBe(404);
    vi.spyOn(prisma.user, "findMany").mockRejectedValueOnce(new Error("down"));
    expect((await demoGET()).status).toBe(502);
  });
  it("Без ключа возвращает 503 и не пишет историю", async () => {
    vi.stubEnv("GROQ_API_KEY", ""); vi.stubEnv("LLM_PROVIDER", "groq");
    try { const response = await POST(req("/api/chat", c1, "POST", { targetUserId: c1.id, sessionId: "no-key", message: "Hi" })); expect(response.status).toBe(503); expect(await getChatHistory(c1.id, c1.id, "no-key")).toEqual([]); }
    finally { vi.unstubAllEnvs(); }
  });
});
