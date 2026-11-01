import { beforeEach, describe, expect, it } from 'vitest';
import { mockRequest, DEMO_STORAGE_KEY, type DemoStorage, type DemoUser, type DemoMemory, type DemoMessage } from '@/demo/mockApi';
let storage: DemoStorage;
beforeEach(() => { const values = new Map<string, string>(); storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }; });
const call = <T>(url: string, actor = 'client_1', method = 'GET', body?: unknown) => mockRequest<T>(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }, actor, storage);
const chat = (sessionId: string, message: string, actor = 'client_1') => call<{reply: string}>('/api/chat', actor, 'POST', { targetUserId: actor, sessionId, message });
describe('Демонстрация без Docker, SQL и LLM-ключей', () => {
  it('Создаёт три аккаунта с разными предпочтениями', async () => {
    expect(await call<DemoUser[]>('/api/demo/users', '')).toHaveLength(3);
    const a = await call<DemoMemory[]>('/api/memories?targetUserId=client_1');
    const b = await call<DemoMemory[]>('/api/memories?targetUserId=client_2', 'client_2');
    expect(a.find(m => m.key === 'goal')?.value).toContain('Python'); expect(b.find(m => m.key === 'goal')?.value).toContain('React');
  });
  it('Учитывает предыдущую реплику только в своей сессии', async () => {
    await chat('one', 'Сегодня изучаю ownership'); await chat('one', 'Чужая тема', 'client_2');
    expect((await chat('one', 'Какую тему я только что назвал?')).reply).toContain('ownership');
    expect((await chat('two', 'Какую тему я только что назвал?')).reply).not.toContain('ownership');
  });
  it('Сохраняет новое предпочтение и использует после нового входа', async () => {
    await chat('a', 'Я предпочитаю практические задания');
    const persisted = storage.getItem(DEMO_STORAGE_KEY); expect(persisted).toContain('практические задания');
    expect((await chat('b', 'План на сегодня')).reply).toContain('практические задания');
    expect(await call<DemoMessage[]>('/api/chat?targetUserId=client_1&sessionId=a')).toHaveLength(2);
  });
  it('Upsert не создаёт дубликат; изменения сразу влияют на план', async () => {
    await call('/api/memories', 'admin', 'PUT', { targetUserId: 'client_1', key: 'goal', value: 'Rust' });
    await call('/api/memories', 'admin', 'PUT', { targetUserId: 'client_1', key: 'goal', value: 'Rust и WASM' });
    const rows = await call<DemoMemory[]>('/api/memories?targetUserId=client_1');
    expect(rows.filter(m => m.key === 'goal')).toHaveLength(1); expect((await chat('x', 'План')).reply).toContain('Rust и WASM');
    expect((await chat('x', 'План', 'client_2')).reply).toContain('React');
  });
  it('Клиенту запрещены чужая память, история, чат и административный список', async () => {
    for (const request of [
      () => call('/api/memories?targetUserId=client_2'),
      () => call('/api/memories', 'client_1', 'PUT', { targetUserId: 'client_2', key: 'goal', value: 'hack' }),
      () => call('/api/memories', 'client_1', 'DELETE', { targetUserId: 'client_2', key: 'goal' }),
      () => call('/api/chat?targetUserId=client_2&sessionId=x'),
      () => call('/api/chat', 'client_1', 'POST', { targetUserId: 'client_2', sessionId: 'x', message: 'Hi' }),
      () => call('/api/admin/users'),
    ]) await expect(request()).rejects.toMatchObject({ status: 403 });
  });
  it('Администратор редактирует и удаляет данные выбранного пользователя', async () => {
    expect(await call<DemoUser[]>('/api/admin/users', 'admin')).toHaveLength(3);
    expect(await call('/api/memories', 'admin', 'DELETE', { targetUserId: 'client_2', key: 'goal' })).toEqual({ deleted: 1 });
    await expect(call('/api/memories?targetUserId=none', 'admin')).rejects.toMatchObject({ status: 404 });
    await expect(call('/api/memories?targetUserId=client_1', 'none')).rejects.toMatchObject({ status: 401 });
  });
  it('Повреждённое хранилище восстанавливает начальные данные', async () => {
    storage.setItem(DEMO_STORAGE_KEY, '{broken');
    expect(await call<DemoUser[]>('/api/demo/users')).toHaveLength(3);
  });
  it('Понимает изменение цели и явное сохранение ключа', async () => {
    await chat('x', 'Моя цель: TypeScript');
    expect((await chat('y', 'Мой план')).reply).toContain('TypeScript');
    await chat('x', 'Запомни level: продвинутый');
    expect((await chat('z', 'Мой план')).reply).toContain('продвинутый');
  });
});

describe('Валидация мок-транспорта', () => {
  it('Отклоняет неизвестные маршруты и методы', async () => {
    await expect(call('/api/unknown')).rejects.toMatchObject({ status: 404 });
    await expect(call('/api/memories', 'client_1', 'PATCH')).rejects.toMatchObject({ status: 405 });
    await expect(call('/api/chat', 'client_1', 'DELETE')).rejects.toMatchObject({ status: 405 });
  });
  it('Не даёт администратору выдавать себя за клиента в чате', async () => {
    await expect(call('/api/chat', 'admin', 'POST', { targetUserId: 'client_1', sessionId: 'x', message: 'Hi' })).rejects.toMatchObject({ status: 403 });
    await expect(call('/api/memories', 'client_1', 'PUT', { targetUserId: 'client_1', key: 'bad key', value: 'x' })).rejects.toThrow();
  });
  it('Обрабатывает незнакомые вопросы и отсутствие предыдущих сообщений', async () => {
    expect((await chat('new', 'Привет')).reply).toContain('деморежиме');
    expect((await chat('empty', 'Какую тему я назвал?')).reply).toContain('ещё нет предыдущих');
    await call('/api/memories', 'admin', 'DELETE', { targetUserId: 'client_1', key: 'goal' });
    expect((await chat('plan', 'План')).reply).toContain('выбранная вами тема');
  });
});
