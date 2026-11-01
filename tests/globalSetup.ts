import { execFileSync } from "node:child_process";
export default function setup() {
  // Uses migrations, not db push, against the explicitly selected disposable DB.
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "reset", "--force", "--skip-seed"], { stdio: "pipe", env: process.env });
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], { stdio: "pipe", env: process.env });
}
