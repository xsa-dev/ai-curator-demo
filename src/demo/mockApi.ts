import { z } from 'zod';
import { memoryInput, identifier } from '@/lib/validation';
export type DemoUser = { id: string; username: string; role: 'CLIENT' | 'ADMIN' };
export type DemoMemory = { id: string; key: string; value: string; updatedAt: string };
export type DemoMessage = { role: 'user' | 'assistant'; content: string };
export interface DemoStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const DEMO_STORAGE_KEY = 'ai-curator-demo-v1';
export const demoUsers: DemoUser[] = [
  { id: 'client_1', username: 'client_1', role: 'CLIENT' },
  { id: 'client_2', username: 'client_2', role: 'CLIENT' },
  { id: 'admin', username: 'admin', role: 'ADMIN' },
];
const stateSchema = z.object({
  version: z.literal(1),
  memories: z.record(z.array(z.object({ id: z.string(), key: z.string(), value: z.string(), updatedAt: z.string() }))),
  history: z.record(z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))),
});
type State = z.infer<typeof stateSchema>;
export class DemoError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'DemoError'; }
}
function initialState(): State {
  const facts: Record<string, Record<string, string>> = {
    client_1: { goal: 'Python для Data Science', level: 'начальный', preferred_format: 'видеоуроки' },
    client_2: { goal: 'Frontend и React', level: 'средний', preferred_format: 'текстовые конспекты' },
    admin: {},
  };
  return { version: 1, history: {}, memories: Object.fromEntries(Object.entries(facts).map(([user, entries]) => [user, Object.entries(entries).map(([key, value]) => ({ id: `${user}:${key}`, key, value, updatedAt: new Date().toISOString() }))])) };
}
function load(storage: DemoStorage): State {
  const raw = storage.getItem(DEMO_STORAGE_KEY);
  if (raw) { try { return stateSchema.parse(JSON.parse(raw)); } catch { /* Recover from an obsolete or corrupted demo snapshot. */ } }
  const state = initialState(); storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); return state;
}
function actorFor(id: string) {
  const user = demoUsers.find(u => u.id === id);
  if (!user) throw new DemoError('Пользователь не авторизован', 401);
  return user;
}
function access(actor: DemoUser, target: string) {
  if (actor.role !== 'ADMIN' && actor.id !== target) throw new DemoError('Доступ запрещён', 403);
  if (!demoUsers.some(u => u.id === target)) throw new DemoError('Пользователь не найден', 404);
}
function put(state: State, owner: string, key: string, value: string) {
  const input = memoryInput.parse({ key, value });
  const list = state.memories[owner] ?? [];
  const row = { id: `${owner}:${input.key}`, ...input, updatedAt: new Date().toISOString() };
  state.memories[owner] = [...list.filter(m => m.key !== input.key), row].sort((a, b) => a.key.localeCompare(b.key));
  return row;
}
function preference(message: string): [string, string] | undefined {
  const direct = message.match(/(?:запомни|сохрани)\s*:?\s*(goal|level|preferred_format)\s*[:=]\s*(.+)/i);
  if (direct) return [direct[1].toLowerCase(), direct[2].trim()];
  const format = message.match(/(?:я\s+)?(?:предпочитаю|люблю)\s+(.+)/i);
  if (format) return ['preferred_format', format[1].trim()];
  const goal = message.match(/(?:моя цель\s*[:—-]?|хочу (?:изучать|изучить|освоить))\s+(.+)/i);
  if (goal) return ['goal', goal[1].trim()];
  return undefined;
}
function answer(message: string, memories: DemoMemory[], history: DemoMessage[], saved?: [string, string]) {
  const fact = (key: string, fallback: string) => memories.find(m => m.key === key)?.value || fallback;
  if (saved) return `Сохранено: ${saved[0]} — ${saved[1]}. Учту это в следующих диалогах.\n\nЭто локальный ответ демо-куратора.`;
  if (/какую тему|что я (?:только что )?(?:назвал|сказал)|предыдущ.*сообщен/i.test(message)) {
    const previous = history.filter(m => m.role === 'user').at(-1)?.content;
    return previous ? `В предыдущем сообщении вы написали: «${previous}».` : 'В этом диалоге ещё нет предыдущих сообщений. Назовите тему, и я смогу сослаться на неё.';
  }
  const goal = fact('goal', 'выбранная вами тема');
  const level = fact('level', 'начальный');
  const format = fact('preferred_format', 'практические задания');
  if (/план|сегодня|рекоменд|учиться/i.test(message)) return `Ваш план на сегодня\n\nЦель: ${goal}.\nУровень: ${level}. Формат: ${format}.\n\n1. 10 минут — повторите предыдущую тему.\n2. 20 минут — изучите один новый раздел, используя ${format}.\n3. 25 минут — выполните небольшое задание по направлению «${goal}».\n4. 5 минут — запишите результат и один вопрос для следующего занятия.\n\nЭто демонстрационный план; внешняя LLM не вызывается.`;
  return `Ваше направление: ${goal}. Предпочтительный формат: ${format}.\n\nВ деморежиме я могу составить учебный план, вспомнить предыдущую реплику или сохранить предпочтение. Попробуйте: «Порекомендуй план на сегодня», «Я предпочитаю практические задания» или «Моя цель: Rust».`;
}
// Browser-only transport; injected storage makes the same behavior deterministic in tests.
export async function mockRequest<T>(url: string, options: RequestInit = {}, actorUserId = '', storage?: DemoStorage): Promise<T> {
  const store = storage ?? window.localStorage;
  const state = load(store);
  const { pathname, searchParams } = new URL(url, 'https://demo.local');
  const method = options.method || 'GET';
  const body: unknown = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  let result: unknown;
  if (pathname === '/api/demo/users' && method === 'GET') result = demoUsers;
  else {
    const actor = actorFor(actorUserId);
    if (pathname === '/api/admin/users' && method === 'GET') {
      if (actor.role !== 'ADMIN') throw new DemoError('Доступ запрещён', 403);
      result = demoUsers.map(user => ({ ...user, memories: state.memories[user.id] ?? [] }));
    } else if (pathname === '/api/memories') {
      if (method === 'GET') {
        const target = identifier.parse(searchParams.get('targetUserId')); access(actor, target);
        result = state.memories[target] ?? [];
      } else if (method === 'PUT') {
        const input = memoryInput.extend({ targetUserId: identifier }).strict().parse(body); access(actor, input.targetUserId);
        result = put(state, input.targetUserId, input.key, input.value);
      } else if (method === 'DELETE') {
        const input = z.object({ targetUserId: identifier, key: identifier }).strict().parse(body); access(actor, input.targetUserId);
        const old = state.memories[input.targetUserId] ?? [];
        state.memories[input.targetUserId] = old.filter(m => m.key !== input.key);
        result = { deleted: old.length - state.memories[input.targetUserId].length };
      } else throw new DemoError('Метод не поддерживается', 405);
    } else if (pathname === '/api/chat') {
      if (method === 'POST') {
        const input = z.object({ targetUserId: identifier, sessionId: identifier, message: z.string().trim().min(1).max(6000) }).strict().parse(body);
        access(actor, input.targetUserId);
        if (actor.id !== input.targetUserId) throw new DemoError('Диалог доступен только от своего имени', 403);
        const historyKey = JSON.stringify([actor.id, input.sessionId]);
        const history = state.history[historyKey] ?? [];
        const saved = preference(input.message);
        if (saved) put(state, actor.id, saved[0], saved[1]);
        const reply = answer(input.message, state.memories[actor.id] ?? [], history, saved);
        state.history[historyKey] = [...history, { role: 'user', content: input.message }, { role: 'assistant', content: reply }];
        result = { reply, sessionId: input.sessionId };
      } else if (method === 'GET') {
        const target = identifier.parse(searchParams.get('targetUserId')); access(actor, target);
        result = state.history[JSON.stringify([target, identifier.parse(searchParams.get('sessionId'))])] ?? [];
      } else throw new DemoError('Метод не поддерживается', 405);
    } else throw new DemoError('Маршрут не найден', 404);
  }
  store.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return structuredClone(result) as T;
}
