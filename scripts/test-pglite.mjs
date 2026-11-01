import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Optional local runner: ephemeral PostgreSQL WASM; production uses Neon/Supabase.
const port = Number(process.env.PGLITE_TEST_PORT || 55433);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PGLITE_TEST_PORT');
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port, maxConnections: 10 });
let code = 1;
try {
  await server.start();
  const testUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/curator_test?connection_limit=1&pgbouncer=true&statement_cache_size=0`;
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--coverage'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, TEST_DATABASE_URL: testUrl, TEST_DATABASE_RESET: 'yes', RUN_LIVE_LLM: '0' },
    stdio: 'inherit',
  });
  code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', result => resolve(result ?? 1)); });
} finally {
  await server.stop();
  await db.close();
}
process.exitCode = code;
