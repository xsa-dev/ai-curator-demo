import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  await db.user.upsert({ where: { username: "admin" }, update: { role: "ADMIN" }, create: { username: "admin", role: "ADMIN" } });
  for (const [username, facts] of Object.entries({
    client_1: { goal: "Python для Data Science", level: "начальный", preferred_format: "видеоуроки" },
    client_2: { goal: "Frontend и React", level: "средний", preferred_format: "текстовые конспекты" },
  })) {
    const user = await db.user.upsert({ where: { username }, update: { role: "CLIENT" }, create: { username, role: "CLIENT" } });
    for (const [key, value] of Object.entries(facts)) {
      // Repeated seed preserves preferences edited by the user.
      await db.userMemory.upsert({ where: { userId_key: { userId: user.id, key } }, update: {}, create: { userId: user.id, key, value } });
    }
  }
}
main().catch(() => { console.error("Seed failed. Check database connection and migrations."); process.exitCode = 1; }).finally(() => db.$disconnect());
