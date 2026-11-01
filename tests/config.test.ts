import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { getModel } from "@/lib/model";
import { apiError } from "@/lib/http";
import { proxy } from "@/proxy";
afterEach(() => vi.unstubAllEnvs());
describe("Конфигурация провайдеров и защита частной демонстрации", () => {
  it("Выбирает Groq с default и явно заданной моделью без внешнего запроса", () => {
    vi.stubEnv("LLM_PROVIDER", ""); vi.stubEnv("GROQ_API_KEY", "test-not-a-real-key"); vi.stubEnv("GROQ_MODEL", "");
    expect(getModel().modelId).toBe("openai/gpt-oss-120b");
    vi.stubEnv("LLM_PROVIDER", "groq"); vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    expect(getModel().modelId).toBe("llama-3.3-70b-versatile");
  });
  it("Выбирает Google с default и явно заданной моделью", () => {
    vi.stubEnv("LLM_PROVIDER", "google"); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-not-a-real-key"); vi.stubEnv("GOOGLE_MODEL", "");
    expect(getModel().modelId).toBe("gemini-2.5-flash");
    vi.stubEnv("GOOGLE_MODEL", "gemini-3.8-flash"); expect(getModel().modelId).toBe("gemini-3.8-flash");
  });
  it("Отклоняет неизвестного провайдера и отсутствующие ключи", () => {
    vi.stubEnv("LLM_PROVIDER", "other"); expect(() => getModel()).toThrow("LLM_NOT_CONFIGURED");
    vi.stubEnv("LLM_PROVIDER", "google"); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", ""); expect(() => getModel()).toThrow("LLM_NOT_CONFIGURED");
    vi.stubEnv("LLM_PROVIDER", "groq"); vi.stubEnv("GROQ_API_KEY", ""); expect(() => getModel()).toThrow("LLM_NOT_CONFIGURED");
  });
  it("Пропускает localhost без gate, блокирует неполную/неверную пару, принимает правильную", () => {
    const request = new NextRequest("http://localhost/");
    vi.stubEnv("DEMO_GATE_USER", ""); vi.stubEnv("DEMO_GATE_PASSWORD", ""); expect(proxy(request).status).toBe(200);
    vi.stubEnv("DEMO_GATE_PASSWORD", "demo-secret"); expect(proxy(request).status).toBe(401);
    vi.stubEnv("DEMO_GATE_USER", "demo"); vi.stubEnv("DEMO_GATE_PASSWORD", ""); expect(proxy(request).status).toBe(401);
    vi.stubEnv("DEMO_GATE_PASSWORD", "demo-secret"); expect(proxy(request).headers.get("www-authenticate")).toContain("Basic");
    const authed = new NextRequest("http://localhost/", { headers: { authorization: "Basic " + Buffer.from("demo:demo-secret").toString("base64") } });
    expect(proxy(authed).status).toBe(200);
  });
  it("Переводит известные ошибки Prisma в безопасный HTTP 404", () => {
    for (const code of ["P2003", "P2025"]) {
      expect(apiError(new Prisma.PrismaClientKnownRequestError("private detail", { code, clientVersion: "6.19.3" })).status).toBe(404);
    }
    expect(apiError(new Prisma.PrismaClientKnownRequestError("private detail", { code: "P2024", clientVersion: "6.19.3" })).status).toBe(502);
    expect(apiError("unknown failure").status).toBe(502);
  });
});
