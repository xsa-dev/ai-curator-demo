# Проверка мок-версии — 01.11.2026

- Node.js 24.22.1 в среде проверки; в GitHub Actions используется Node.js 22.
- `npm run typecheck`: успешно.
- `npm run test:coverage`: 12 тестов успешно.
- Мок-транспорт: 100% lines/statements/functions, 89.47% branches.
- `npm run build`: успешно, Next.js 16.4.2 production build.
- Docker, SQL-сервер, внешняя LLM и API-ключи для демо не требуются.
- Browser E2E не выполнялся.
- GitHub upload и Vercel deployment ожидают создания целевого репозитория и разрешения доступа Vercel к команде. Публичная ссылка ещё не создана.
- Удалённые GitHub Actions, PR и merge пока не выполнялись. Их успешность этим отчётом не подтверждается.
