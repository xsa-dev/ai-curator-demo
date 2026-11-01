import { z } from "zod";
export const identifier = z.string().trim().min(1).max(128);
export const memoryInput = z.object({ key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/, "Ключ: латиница, цифры, _, . или -"), value: z.string().trim().min(1).max(2000) }).strict();
export const chatInput = z.object({ actorUserId: identifier, targetUserId: identifier, sessionId: identifier, message: z.string().trim().min(1).max(6000) }).strict();
