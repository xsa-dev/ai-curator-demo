import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ForbiddenError, UnauthorizedError, NotFoundError } from "@/lib/rbac";
export function actorFromRequest(req: Request) {
  if (process.env.DEMO_AUTH_ENABLED !== "true") throw new ForbiddenError("Демонстрационный вход отключён");
  const actor = req.headers.get("x-user-id");
  if (!actor) throw new UnauthorizedError();
  return actor;
}
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 20000) throw new ZodError([{ code: "custom", path: [], message: "Слишком большой запрос" }]);
  try { return JSON.parse(text); } catch { throw new ZodError([{ code: "custom", path: [], message: "Некорректный JSON" }]); }
}
export function apiError(error: unknown) {
  if (error instanceof ForbiddenError || error instanceof UnauthorizedError || error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).join("; ") }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(error.code)) return NextResponse.json({ error: "Пользователь или запись не найдены" }, { status: 404 });
  if (error instanceof Error && error.message === "LLM_NOT_CONFIGURED") return NextResponse.json({ error: "Настройте API-ключ и провайдера LLM на сервере" }, { status: 503 });
  // Do not expose provider responses, credentials or SQL connection strings.
  return NextResponse.json({ error: "Запрос не выполнен. Проверьте подключение к БД и доступность LLM; повторите позже." }, { status: 502 });
}
export const noStore = { "Cache-Control": "no-store" };
