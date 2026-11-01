import { prisma } from "@/lib/prisma";
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Доступ запрещён") { super(message); this.name = "ForbiddenError"; }
}
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Пользователь не найден") { super(message); this.name = "NotFoundError"; }
}
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Пользователь не авторизован") { super(message); this.name = "UnauthorizedError"; }
}
export async function getActor(actorUserId: string) {
  if (!actorUserId) throw new UnauthorizedError();
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  if (!actor) throw new UnauthorizedError();
  return actor;
}
export async function assertAccess(actorUserId: string, targetUserId: string) {
  // Only the actor lookup precedes this guard. Never query the target first.
  const actor = await getActor(actorUserId);
  if (actor.role !== "ADMIN" && actorUserId !== targetUserId) throw new ForbiddenError();
  return actor;
}
export async function assertAdmin(actorUserId: string) {
  const actor = await getActor(actorUserId);
  if (actor.role !== "ADMIN") throw new ForbiddenError();
  return actor;
}
