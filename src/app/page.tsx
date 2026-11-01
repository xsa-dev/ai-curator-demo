"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { mockRequest } from "@/demo/mockApi";
const mockMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
type User = { id: string; username: string; role: "CLIENT" | "ADMIN" };
type Memory = { id: string; key: string; value: string; updatedAt: string };
type Message = { role: "user" | "assistant"; content: string };
export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const epoch = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const current = users.find(u => u.id === actor);
  const isAdmin = current?.role === "ADMIN";
  async function request<T>(url: string, options: RequestInit = {}, user = actor): Promise<T> {
    if (mockMode) return mockRequest<T>(url, options, user);
    const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", "x-user-id": user, ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка запроса");
    return data as T;
  }
  async function loadUsers() {
    try {
      const list = await request<User[]>("/api/demo/users");
      if (!list.length) throw new Error("Нет пользователей. Выполните npm run db:seed.");
      setUsers(list);
      const first = list.find(u => u.username === "client_1") || list[0];
      setActor(first.id); setTarget(first.id); setSessionId(crypto.randomUUID()); setReady(true);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void loadUsers(); }, []); // Initial demo-account directory.
  useEffect(() => {
    if (!actor || !target) return;
    let cancelled = false;
    setMemories([]); setError("");
    request<Memory[]>(`/api/memories?targetUserId=${encodeURIComponent(target)}`)
      .then(rows => { if (!cancelled) setMemories(rows); })
      .catch(e => { if (!cancelled) setError(e.message); });
    if (isAdmin) request<User[]>("/api/admin/users").then(rows => { if (!cancelled) setUsers(rows); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [actor, target, isAdmin]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);
  function switchUser(id: string) {
    epoch.current++; setActor(id); setTarget(id); setSessionId(crypto.randomUUID());
    setMessages([]); setMemories([]); setDraft(""); setKey(""); setValue(""); setError(""); setNotice("");
  }
  function newSession() {
    epoch.current++; setSessionId(crypto.randomUUID()); setMessages([]); setDraft(""); setError("");
    setNotice("Новый диалог создан. Сохранённые предпочтения остаются с вами.");
  }
  async function send(e: FormEvent) {
    e.preventDefault(); if (!draft.trim() || busy) return;
    const message = draft.trim(); const version = epoch.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ reply: string }>("/api/chat", { method: "POST", body: JSON.stringify({ targetUserId: actor, sessionId, message }) });
      if (version !== epoch.current) return;
      setMessages(old => [...old, { role: "user", content: message }, { role: "assistant", content: result.reply }]); setDraft("");
      const rows = await request<Memory[]>(`/api/memories?targetUserId=${encodeURIComponent(actor)}`);
      if (version === epoch.current) setMemories(rows);
    } catch (e) { if (version === epoch.current) setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await request("/api/memories", { method: "PUT", body: JSON.stringify({ targetUserId: target, key, value }) });
      setMemories(await request<Memory[]>(`/api/memories?targetUserId=${encodeURIComponent(target)}`));
      setKey(""); setValue(""); setNotice("Предпочтение сохранено.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(memory: Memory) {
    setBusy(true); setError("");
    try {
      await request("/api/memories", { method: "DELETE", body: JSON.stringify({ targetUserId: target, key: memory.key }) });
      setMemories(old => old.filter(m => m.id !== memory.id));
      if (key === memory.key) { setKey(""); setValue(""); }
      setNotice("Предпочтение удалено.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main>
    <header className="topbar"><a className="brand" href="/" aria-label="AI-куратор — главная"><span className="mark">К</span><span>Куратор<span className="brand-sub">ВАША ОНЛАЙН-ШКОЛА</span></span></a>
      <div className="account"><label>Демо-пользователь<select aria-label="Текущий пользователь" disabled={busy || !ready} value={actor} onChange={e => switchUser(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.username} · {u.role}</option>)}</select></label>
      <button className="secondary" disabled={busy || !ready} onClick={newSession}>＋ Новый вход / Новый диалог</button></div>
    </header>
    <section className="intro"><div><p className="eyebrow">ЛИЧНЫЙ МАРШРУТ ОБУЧЕНИЯ</p><h1>{isAdmin ? "Управление памятью учеников" : "Учитесь в своём темпе."}</h1><p className="muted">{isAdmin ? "Помогите каждому ученику настроить цели и удобный формат занятий." : "Ваш AI-куратор помнит цели, учитывает предпочтения и помогает сделать следующий шаг."}</p></div><span className="pill">{isAdmin ? "Администратор" : "Личный кабинет"}</span></section>
    <div className="demo-note">{mockMode ? "ДЕМО НА МОКАХ · Ответы формируются локально, внешняя LLM и серверная БД не используются. Память хранится только в этом браузере. Переключатель аккаунтов — демонстрация ролей." : "Демонстрационный вход: используйте только тестовые данные."}</div>
    {error && <div role="alert" className="alert">{error}{!ready && <button onClick={loadUsers}>Повторить подключение</button>}</div>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className={`workspace ${isAdmin ? "admin" : ""}`}>
      {!isAdmin && <section className="card chat"><div className="card-head"><div><h2>Диалог с куратором</h2><p>Контекст сохраняется внутри текущего диалога</p></div><span className="status-dot" aria-label="AI-куратор" /></div>
        <div className="messages" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && <div className="empty"><div className="spark">✦</div><h3>С чего начнём сегодня?</h3><p>Расскажите о цели или попросите составить план.<br/>Сохранённые предпочтения уже доступны куратору.</p><div className="suggestions">{["Порекомендуй план обучения на сегодня", "Я предпочитаю практические задания"].map(text => <button disabled={!ready || busy} key={text} onClick={() => setDraft(text)}>{text} ↗</button>)}</div></div>}
          {messages.map((m, i) => <article key={i} className={`bubble ${m.role}`}><span>{m.role === "user" ? "Вы" : "AI-куратор"}</span><p>{m.content}</p></article>)}
          {busy && <p role="status" className="muted">Обрабатываем запрос…</p>}<div ref={endRef}/>
        </div>
        <form onSubmit={send} className="composer"><label className="sr-only" htmlFor="message">Сообщение куратору</label><textarea id="message" maxLength={6000} placeholder="Напишите куратору…" value={draft} onChange={e => setDraft(e.target.value)} disabled={busy || !ready}/><button disabled={busy || !ready || !draft.trim()} type="submit">Отправить ↑</button></form>
        <p className="chat-footer">Диалог {sessionId.slice(0, 8)} · Ответы AI могут содержать ошибки</p>
      </section>}
      <aside className="card memory"><div className="card-head"><div><p className="eyebrow">ДОЛГОСРОЧНАЯ ПАМЯТЬ</p><h2>{isAdmin ? "Предпочтения пользователя" : "Мои сохранённые предпочтения"}</h2></div><span className="counter">{memories.length}</span></div>
        {isAdmin && <label className="target-label">Выберите пользователя<select disabled={busy} value={target} onChange={e => { setTarget(e.target.value); setKey(""); setValue(""); setNotice(""); }}>{users.map(u => <option key={u.id} value={u.id}>{u.username} · {u.role}</option>)}</select></label>}
        <p className="memory-hint">Эти сведения учитываются в новых диалогах. Вы можете изменить или удалить их в любой момент.</p>
        <div className="facts">{memories.length === 0 && <p className="muted">Пока нет сохранённых сведений.</p>}{memories.map(m => <article className="fact" key={m.id}><div><code>{m.key}</code><p>{m.value}</p></div><div className="fact-actions"><button disabled={busy} aria-label={`Изменить ${m.key}`} onClick={() => { setKey(m.key); setValue(m.value); }}>Изменить</button><button disabled={busy} className="delete" aria-label={`Удалить ${m.key}`} onClick={() => remove(m)}>Удалить</button></div></article>)}</div>
        <form className="memory-form" onSubmit={save}><h3>{memories.some(m => m.key === key) ? "Изменить предпочтение" : "Добавить предпочтение"}</h3><label>Ключ<input required maxLength={80} pattern="[a-zA-Z0-9_.\-]+" placeholder="Например, preferred_format" value={key} disabled={busy || !ready} onChange={e => setKey(e.target.value)}/></label><label>Значение<textarea required maxLength={2000} placeholder="Например, короткие видеоуроки" value={value} disabled={busy || !ready} onChange={e => setValue(e.target.value)}/></label><button disabled={busy || !ready || !key.trim() || !value.trim()} type="submit">Сохранить предпочтение</button>{key && <button type="button" className="text-button" onClick={() => { setKey(""); setValue(""); }}>Отменить редактирование</button>}</form>
      </aside>
    </div><footer className="page-footer">Куратор · Обучение, которое учитывает вас</footer>
  </main>;
}
