import { prisma } from "@/lib/prisma";
import { assertAccess, assertAdmin, NotFoundError } from "@/lib/rbac";
import { identifier, memoryInput } from "@/lib/validation";
export async function getMemories(actorUserId: string, targetUserId: string) {
  await assertAccess(actorUserId, targetUserId);
  return prisma.userMemory.findMany({ where: { userId: identifier.parse(targetUserId) }, orderBy: { key: "asc" } });
}
export async function upsertMemory(actorUserId: string, targetUserId: string, key: string, value: string) {
  await assertAccess(actorUserId, targetUserId);
  const input = memoryInput.parse({ key, value });
  if (!await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })) throw new NotFoundError();
  return prisma.userMemory.upsert({ where: { userId_key: { userId: targetUserId, key: input.key } }, update: { value: input.value }, create: { userId: targetUserId, ...input } });
}
export async function deleteMemory(actorUserId: string, targetUserId: string, key: string) {
  await assertAccess(actorUserId, targetUserId);
  // Composite scope prevents deleting a row belonging to another owner.
  const result = await prisma.userMemory.deleteMany({ where: { userId: targetUserId, key: identifier.parse(key) } });
  return { deleted: result.count };
}
export async function getChatHistory(actorUserId: string, targetUserId: string, sessionId: string) {
  await assertAccess(actorUserId, targetUserId);
  return prisma.chatMessage.findMany({ where: { userId: targetUserId, sessionId: identifier.parse(sessionId) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}
export async function getAllUsersWithMemories(actorUserId: string) {
  await assertAdmin(actorUserId);
  return prisma.user.findMany({ orderBy: { username: "asc" }, include: { memories: { orderBy: { key: "asc" } } } });
}
