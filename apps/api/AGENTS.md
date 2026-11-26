# Робота агента з NodeXora API

Ці правила стосуються backend у `apps/api`. Спочатку прочитай актуальні рішення в [PROJECT_SPEC.md](../PROJECT_SPEC.md), потім відповідний етап [MONITORING_PLAN.md](MONITORING_PLAN.md). Інструкції власника в поточному завданні мають пріоритет; погоджені зміни архітектури відображай у специфікації.

## Спосіб роботи

- Спілкуйся українською, код та identifiers пиши англійською.
- Проєкт навчальний: перед змінами поясни мету, модуль і шлях даних. Після роботи покажи ключові файли та результат перевірки.
- Виконуй погоджений невеликий обсяг. Не реалізовуй наступні етапи моніторингу разом із рефакторингом.
- Використовуй repo skill [nodexora-api-feature](../../.agents/skills/nodexora-api-feature/SKILL.md) для розробки або рефакторингу функції API.

## Межі файлів

- `app.ts` створює Fastify, підключає root configuration/plugins і feature routes. `server.ts` вибирає provider, запускає listener та завершує процес.
- `modules/<feature>/*.routes.ts` реєструє endpoints і підключає готові schema, hooks, handlers. Повні schema objects та inline business logic у routes не розміщуй.
- Повна schema endpoint включає validation, responses, summary, tags та інші OpenAPI metadata. Для system resources вона живе в `modules/system/schemas/<resource>.schema.ts`; простий health має власний `health.schema.ts`.
- Controllers відповідають за HTTP-відповідь, services — за обчислення та координацію, providers — за Linux I/O. Проста health-відповідь не потребує штучних controller/service.
- Загальні request/response hooks живуть у `hooks`. Зараз усі monitoring endpoints доступні без автентифікації за рішенням власника. Не додавай login, credentials або route guards без нового завдання. Використовуй Fastify hooks, а не Express middleware adapters без конкретної потреби.
- Feature DTO живуть у `modules/<feature>/<feature>.types.ts`. Загальні response envelopes — у `common/types`, error schema — у `common/schemas`, application errors — у `common/errors`.
- `plugins` містить інтеграції Fastify. Swagger реєструється перед application routes. Root error handler має зберегти root scope; просте перенесення його в encapsulated plugin може змінити поведінку.
- Маленький redirect `/` → `/api/` належить до налаштування Swagger. Його `hide` metadata не є schema бізнес-ресурсу.
- Не створюй порожні майбутні модулі, загальний DI container або shared npm package. Зберігай явну передачу залежностей і самостійний npm-проєкт API.

## Контракти та дані

- JSON Schema є джерелом validation/serialization і OpenAPI. TypeScript DTO та runtime schema мають узгоджуватися. Swagger не замінює типи й не описує весь майбутній WS message protocol.
- Під час структурного рефакторингу зберігай URLs, HTTP methods, response shape, status codes, чинну політику доступу, cache policy та формули, якщо завдання прямо не змінює контракт.
- Linux reading залишай у providers. Для Windows використовуй явний mock; відсутні дані не підміняй нулями. Одиниці, timestamps і quality деталізовані в плані моніторингу.
- Новий endpoint спочатку опиши схемою, потім підключи через routes і перевір Swagger. Не додавай реальне керування Linux до read-only моніторингу.

## Стиль і перевірки

Виконуй із `apps/api`:

```text
npm run format
npm run format:check
npm run build
npm run check
npm test
```

Prettier встановлений локально в apps/api; .prettierrc.json і .editorconfig визначають стиль: 2 пробіли, single quotes, semicolons, LF, ширина 100. Команди format/format:check охоплюють src, tests, deployment/checks/*.mjs і API-local JSON. Не додавай інший formatter для тих самих файлів.

Для читабельності залишай один порожній рядок між imports і declarations, між окремими функціями/методами, а також між отриманням даних, перевірками, обчисленнями й поверненням результату. Пов'язані declarations групуй разом. Використовуй зрозумілі назви schema helpers та явні branches замість складних вкладених ternary. Prettier зберігає наявні розділення, але автоматично не вставляє їх; це правило написання коду, а не неіснуюча опція formatter.

Після кожної логічної групи змін запускай тести; наприкінці виконай format:check, build і check. Тести додавай для поведінки, обчислень і регресій, а не для перевірки назв папок.

Локальна зміна коду не запускає розгортання автоматично. Якщо завдання включає deploy, використовуй `deployment/update/deploy.sh` і повідомляй фактичний результат. Рефакторинг сам по собі не потребує підключення до Debian або зміни Nginx. Правила доступу змінюй за явним рішенням власника, узгоджуючи код, Swagger, тести й документацію.

Deployment archive містить лише `dist`, `package.json` і `package-lock.json`; production dependencies встановлюються на Debian. Не додавай README, плани, source, тести, agent rules або deployment-скрипти до runtime-папки. Команди активації передаються через SSH stdin.

API на Debian працює як `systemctl --user` unit `nodexora-api.service` користувача `dvor`, із enabled boot registration і `Linger=yes`. Unit встановлений у `~/.config/systemd/user`, поза runtime-папкою; source — `deployment/setup/nodexora-api.service`. Deploy/rollback використовує service stop/start, а журнали читаються через `journalctl --user -u nodexora-api.service`. Не запускай паралельний `nohup` і не повертай старий PID file. Зміни unit застосовуються окремим явно погодженим кроком, не через routine runtime archive.
