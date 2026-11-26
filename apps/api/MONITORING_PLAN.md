# План розвитку API моніторингу NodeXora

Дата створення: 2026-11-25.

**Оновлення 2026-11-26:** основний backend M0–M12 реалізовано в погодженому
scope; M2 лишається відкладеним. Підсумки фактичних перевірок — §19.
Frontend-only перевірка зеленої індикації та відсутності дубльованого polling
залишається відкритою до реалізації Angular; apps/web не змінювався.
Поточні контракти й engineering-рішення — [MONITORING_CONTRACTS.md](MONITORING_CONTRACTS.md).

**Призначення:** робочий план для поетапного навчання й реалізації backend, який повертає перевірені показники Debian-сервера для майбутнього Angular dashboard.

Поточний звіт реалізації — §18–19; попередні записи зберігають історію. Це план і журнал фактичного виконання. Майбутні endpoints, назви нових полів і повідомлень нижче — проєкт контрактів для уточнення на відповідному етапі. Наявні API не змінюємо мовчки. Початковий порядок: пояснення → погоджений обсяг → реалізація → перевірка → пояснення результату. 2026-11-26 власник явно розширив завдання до всього backend-плану й дозволив deploy, multi-client перевірку та reboot; узгоджені межі — §18. Створення цього документа не означає початку реалізації всіх етапів.

## 1. Джерела вимог і поточний стан

Основна архітектура: [PROJECT_SPEC.md](../PROJECT_SPEC.md), включно з актуальними рішеннями власника на початку документа. Поточні команди: [README.md](README.md).

Візуальний орієнтир — наданий власником скріншот **Hermes Server Panel**. Назви машин, числа, порти, сервіси й характеристики на зображенні є прикладами. Вони не доводять конфігурацію нашого сервера. Для Network, Routes, Logs, Storage, Firewall видно лише навігацію; повний склад їхніх окремих сторінок ще потрібно уточнити.

Підтверджено локальними файлами на момент написання:

- Backend: Node.js, TypeScript, Fastify; самостійний npm-проєкт у `apps/api`.
- Внутрішній RAM DTO: `apps/api/src/modules/system/system.types.ts`; загальні response envelopes — `common/types/api-response.ts`. `packages/shared` видалено; публічний контракт — OpenAPI із route schemas, а не спільний npm package.
- Swagger UI — `/api/`, OpenAPI JSON — `/api/json`, YAML — `/api/yaml`. Описуються тільки реально реалізовані endpoints; локальні запити виконуються без входу.
- Є health, host info, RAM/swap/load/uptime, CPU, disks, temperature, network, processes, sessions, services, routes, logs, snapshots/history та WebSocket; усі без application authentication. Реалізовані контракти — [MONITORING_CONTRACTS.md](MONITORING_CONTRACTS.md).
- RAM читається з `/proc/meminfo`; є явний mock provider для Windows.
- Поточний RAM-контракт: `totalBytes`, `availableBytes`, `usedBytes`, `usedPercent`, `collectedAt`, `source`.
- Є перевірка конфігурації, централізований формат помилок та тести базового API. За рішенням власника автентифікацію поточного локального API прибрано; це також відображено в Swagger і deploy-скрипті.
- Реалізовано спільний collector, bounded history, WebSocket і logind sessions. Історія лише в пам’яті; public IP disabled, Angular не змінено.
- Nginx snippet і скрипт застосування підготовлені в `deployment/`. Поточний snippet містить окремий WS location; власник застосував update через sudo, nginx -t і reload 2026-11-26.
- `deployment/update/deploy.sh` — окремий локальний Bash entry point для перевірки/збірки та передавання compiled artifact на Debian. Він не застосовує Nginx config; під час оновлення зупиняє й запускає вже налаштований user service systemd; інструкція та обмеження описані в README.
- Поточний release archive містить лише `dist`, `package.json` і `package-lock.json`. Документація, scripts та `release.json` до runtime-папки не передаються; активація виконується через SSH stdin, а production dependencies встановлюються на Debian.
- Новий склад архіву перевірено локальним запуском deploy із тестовими SSH/SCP: build/type-check і 10 тестів пройшли, archive whitelist та передавання activation input перевірені. Згодом новий runtime-only формат успішно розгорнуто під час налаштування systemd; див. запис автозапуску нижче.

Останній перевірений серверний стан із попередньої роботи, який потрібно повторно звірити в M0:

Нижче наведена історична база до роботи 2026-11-26; її повторну перевірку та
актуальний runtime зафіксовано в §19. Вона не перекриває новіший звіт.

- Debian 13.7; Node.js 26.13.1; користувач `dvor`.
- Backend у `/home/dvor/nodexora/api`, працює під керуванням `systemd --user` як `nodexora-api.service` без root і слухає `127.0.0.1:3000`. Unit enabled; `Linger=yes`; журнали — user journal.
- Nginx доступний на порту 80; маршрут `/api/` підтверджений реальними HTTP-запитами. Swagger UI, OpenAPI JSON і RAM endpoint перевірені через цей proxy після оновлення backend. За поточним рішенням RAM доступна без автентифікації.
- Старий `/home/dvor/nodexora-dev` видалено; SSH port forwarding більше не використовуємо.
- Swagger-версія без shared package розгорнута в `/home/dvor/nodexora/api`; install/build/check і всі 10 тестів пройшли на Debian. Це підтверджує поточний базовий API, а не реалізацію всього плану моніторингу.

Цільовий доступ: `http://192.168.1.33/api/v1/...` через Nginx у LAN. Це локальний development API без автентифікації та route guards. Захист доступу й HTTPS відкладено на окремий майбутній запит; вони не блокують поточні етапи моніторингу. Поточну версію вже розгорнуто; майбутні локальні зміни потребують окремого deploy.

## 2. Межі поточного напряму

Будуємо **читання** ресурсів, процесів, мережі, маршрутів, стану сервісів і журналу. API не перезапускає сервіси, не змінює маршрути, не оновлює Debian і не відкриває terminal.

Кнопки Restart Services, Update System, Open Terminal, Manage Firewall зі скріншота належать до майбутнього адміністрування. Вони потребуватимуть окремих вимог, дозволів, аудиту й вузького privileged helper. Їх не реалізуємо як частину моніторингу.

Network Lab, багатосерверність, система сповіщень та довільний перегляд файлів також не входять у цей план. Читання firewall status може бути наступним окремим завданням після уточнення доступних прав; не розширюємо root-доступ заради dashboard.

## 3. Архітектура й розташування файлів

Зберігаємо визначений у специфікації поділ:

```text
REST request -> Route / Validation
             -> Controller -> Service -> Linux Provider

Linux Providers -> Central Metrics Collector -> bounded snapshot cache
                                            -> REST responses
                                            -> Subscription Manager -> WebSocket Gateway
                                            -> bounded history, коли вона буде потрібна

Angular / HTTP client -> Nginx -> Fastify на loopback
```

REST залишається способом запитати стан. Після введення collector часті метрики повертаються зі спільного snapshot, а не збираються заново для кожного клієнта. Рідкісні довідкові запити можуть читати provider через service. Для журналу передбачаємо окреме обмежене читання й спільний механізм live-підписок.

| Місце | Відповідальність |
|---|---|
| `apps/api/src/modules/system` | Інформація про систему, CPU, RAM, swap, диски, uptime, load, temperature |
| `apps/api/src/modules/metrics` | Планування збору, актуальні snapshots, історичні запити |
| `apps/api/src/modules/processes` | Список і статистика процесів |
| `apps/api/src/modules/network` | Інтерфейси, адреси, трафік; окремо — з'єднання |
| `apps/api/src/modules/routing` | Читання маршрутів |
| `apps/api/src/modules/services` | Читання systemd units |
| `apps/api/src/modules/logs` | Читання журналу з фільтрами та cursor |
| `apps/api/src/hooks` | Загальна HTTP-поведінка, зокрема no-cache; модуль auth зараз не потрібний |
| `apps/api/src/infrastructure/linux` | Доступ до `/proc`, `/sys`, netlink, systemd/journal |
| `apps/api/src/realtime` | Один socket на клієнт, підписки, повідомлення, cleanup |
| `apps/api/src/modules/<feature>/<feature>.types.ts` | Внутрішні feature DTO та типи повідомлень |
| `apps/api/src/common/types` та `common/schemas` | Загальні HTTP envelopes та error schema |
| Окремі schema-файли feature modules | Повна endpoint schema: runtime validation, responses і OpenAPI metadata; system resources — у `system/schemas` |
| `apps/api/src/plugins/swagger.plugin.ts` | Swagger UI і генерація публічного OpenAPI без секретів |
| `apps/api/tests` | Перевірка обчислень, parser, API, доступу, collector і streaming |

Таблиця описує відповідальності, а не наказ створити всі папки одразу. Не вводимо microservices, Event Bus, NgRx, окремий брокер або database для першого snapshot. Controllers не парсять Linux-файли й не запускають команди.

## 4. Які дані потрібні для dashboard

Наведені нові назви полів є робочими; остаточний контракт фіксуємо перед реалізацією ресурсу.

| Блок скріншота | Дані API | Джерело / особливості |
|---|---|---|
| Шапка сервера | `hostname`, OS id/name/version, kernel version, architecture | `node:os`, `/etc/os-release`; жодних hardcoded назв Debian |
| Апаратні відомості | CPU model, logical CPU count, physical cores якщо визначаються, usable RAM | Відокремити фізичні ядра від логічних CPU; не брати число 4 зі скріншота |
| CPU | Загальний відсоток, список logical CPU з відсотками, інтервал вимірювання | `/proc/stat`, різниця двох samples |
| RAM | Загальна, available, використана пам'ять, відсоток | Наявний контракт; формула нижче |
| Swap | Загальний, вільний, використаний обсяг, відсоток, ознака ввімкнення | `/proc/meminfo`; нульовий загальний обсяг не є помилкою |
| Disk `/` | Mount point, filesystem type, capacity, free, available, used, percent | Mount metadata + `fs.statfs`; не плутати capacity з disk I/O |
| Network total | RX/TX bytes per second, час і тривалість вимірювання | Дельти лічильників; явний склад інтерфейсів у сумі |
| Uptime | Uptime seconds, boot time, boot identity | Вказати семантику часу й поведінку після reboot |
| Temperature | Sensor id, label, Celsius, availability | Доступні hwmon/thermal sensors; не вгадувати CPU package |
| Load Average | Окремі значення за 1, 5, 15 хвилин | `node:os.loadavg()` у Linux; це не CPU percent |
| Processes | PID, identity/start time, UID/user, CPU%, RSS bytes, RAM%, state, безпечна назва команди | `/proc`; частина полів може бути недоступна |
| Users | Кількість підключених користувачів і login sessions, metadata кожної сесії | SSH та локальні входи в Debian; read-only logind provider |
| Active Services | Unit name, description, load/active/sub state, main PID за доступності | systemd D-Bus; порти не виводити з назви сервісу |
| Network addresses | Інтерфейси, IPv4/IPv6 із prefix, стан link, default-route context | Не вважати першу адресу єдиною основною |
| Current IP Address | Обрана локальна адреса Debian-сервера, interface id і address family | У поточному LAN очікується `192.168.1.33`, але значення читається з ОС, не hardcode |
| Public IP | Адреса, джерело, час перевірки, availability | Лише після рішення щодо зовнішнього сервісу / router API |
| Sparklines | Серія timestamp/value/status для CPU, traffic, temperature | Зберігати лише реально отримані samples |
| Last updated | Час збирання конкретного ресурсу, вік sample | Не оновлювати timestamp без нового вимірювання |

Вкладка **Users** показує підключених до Debian користувачів та їхні login sessions. Фільтрація процесів за UID залишається окремою можливістю Processes. Наявність процесів від `root` або `www-data` сама по собі не означає підключення користувача. Входи в Debian не є браузерними підключеннями до панелі; користувацький login вебпанелі зараз не реалізується.

### 4.1. Уточнена поведінка dashboard

Ці рішення доповнюють вимоги зі скріншота після уточнення власником.

**Індикатор зв'язку біля назви сервера:**

- Зелене значення означає підтверджений поточний зв'язок frontend із API через Nginx; це не гарантія справності всіх Linux resources.
- Під час початкового підключення або reconnect показувати окремий стан. На socket close/error, failed HTTP check або heartbeat deadline прибирати зелену індикацію й показувати втрату/відновлення зв'язку.
- Використовувати поточний transport: HTTP checks у REST-режимі, WS lifecycle/heartbeat у live-режимі. Відкритий socket без heartbeat не доводить доступність. Heartbeat deadlines визначаються в M11.
- Втрата зв'язку не доводить, що Debian вимкнувся: повідомлення — «Немає зв'язку із сервером», без вигаданого діагнозу.
- Збережені показники можуть залишатися видимими з часом останнього sample і позначенням втрати актуальності; не скидати їх до нуля. Недоступність одного датчика відображати окремо від загального зв'язку.

**Auto-refresh — частота оновлення даних клієнта:**

- Початкове engineering-рішення за дорученням власника: default **5 секунд**, доступні інтервали **2, 5, 10, 30 секунд**, а також вимкнення автооновлення. Це development defaults для перевірки на сервері, не production SLO.
- До WebSocket frontend опитує потрібні GET endpoints без overlapping requests. Після WebSocket вибраний інтервал означає максимальну частоту доставки/застосування актуальних snapshots для цього клієнта; сервер не створює окремий Linux collector.
- Не створювати одночасно REST polling і WS updates для тих самих метрик. Початкове завантаження та manual refresh залишаються REST-запитами.
- Рідше зібраний ресурс не отримує новий `collectedAt` лише тому, що клієнт вибрав 2 секунди. Частота клієнта не прискорює глобальний збір; нові значення з'являються лише після нового вимірювання.
- Вимкнення Auto-refresh припиняє metric subscriptions/polling цього клієнта; загальний collector продовжує працювати. Heartbeat/перевірка зв'язку залишаються активними. Екран позначається як paused із часом даних, а не як свіже live-вимірювання.
- Після відновлення відразу отримувати свіжий snapshot, потім продовжувати обраний інтервал. Зміна частоти не вимагає POST і не змінює Linux.
- Live logs мають окремий start/pause і bounded stream: не застосовувати до них втратне скорочення до одного запису раз на 5 секунд.

**Last 15 minutes — часовий діапазон графіків:**

- Для наданого dashboard він керує sparklines CPU, Network RX/TX і Temperature. Додаткові графіки підключаються до цього діапазону лише явно.
- Великі числа CPU/RAM/swap/disk/traffic/temperature, uptime, load, таблиці Processes/Users і стани сервісів показують поточний snapshot, а не середнє або старе значення за діапазон.
- Зміна діапазону викликає GET history для потрібних series; поточні live subscriptions залишаються на актуальних даних. Історія CPU за минулі 15 хвилин не змінює CPU% процесів у поточній таблиці.
- Якщо історії менше за діапазон, показати доступну частину й gaps. Інші доступні діапазони визначити разом із retention у M10.

**Current IP Address — адреса сервера:**

- Показувати локальну адресу Debian, за якою користувач звертається до цього сервера в LAN. Не підміняти її адресою клієнта (`X-Real-IP`), router gateway, public IP або upstream `127.0.0.1`.
- На першому сервері обирати фактичну IPv4 активного LAN interface, що обслуговує доступ до панелі. Якщо вибір неоднозначний, задати server-side preferred interface/address family; повертати обране джерело і список alternatives.
- Брати адресу з provider, не довіряти довільному HTTP Host як джерелу істини. Зміни DHCP відображаються в новому snapshot; недоступний preferred interface позначати явно, а не мовчки показувати випадкову адресу.

**Повторювані показники:**

- RAM у верхній картці й біля Processes читається з одного memory sample із тими самими значеннями та identity/timestamp. Не запускати незалежні запити/розрахунки для двох місць UI.
- Uptime у картці та sidebar використовує один boot/uptime sample. Якщо frontend локально збільшує uptime між samples, обидва відображення використовують спільне derived value й одночасно оновлюють baseline.
- `MEM` процесу — RSS bytes; `MEM% = rssBytes / totalBytes * 100`, де `totalBytes` — usable `MemTotal` із узгодженого memory snapshot. Якщо denominator недоступний, percent — `null` із причиною.
- RAM% машини обчислюється з `MemAvailable`, а MEM% процесу — з RSS: це різні величини, їх не потрібно штучно зрівнювати. Правила округлення однакові для всіх відображень однієї величини.

### 4.2. Users: підключені користувачі Debian

Перший scope — поточні користувацькі SSH та локальні login sessions, які обліковує ОС. Окремо повертати `connectedUsersCount` за унікальними UID та `sessionsCount`: один користувач може мати кілька входів.

Робочі поля сесії: `sessionId`, `uid`, `username`, `state`, `type`, `service`, `remote`, `remoteHost`, `tty`, `seat`, `leaderPid`, `startedAt`, `durationSeconds`, `idleHint`, `idleSince`, source/quality/collectedAt. Повертати лише доступні metadata; відсутнє — `null` із причиною. `remoteHost` не завжди є перевіреною IP-адресою.

Джерело — read-only API `org.freedesktop.login1` через systemd-logind: список sessions і властивості session objects. Не використовувати методи створення, завершення або керування сесіями. Перевірити підтримувані властивості встановленої версії systemd. Джерело семантики: [systemd-logind D-Bus](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html).

- Перед реалізацією визначити provider mapping для чинних інтерактивних sessions: включати online/active входи; closing, greeter і background-only sessions не рахувати як підключених користувачів.
- Idle session залишається підключеною; idle не дорівнює logout. Logind session state — облік входу в ОС, а не доказ живого TCP-з'єднання.
- Не трактувати всі TCP sockets, записи `/etc/passwd`, process owners або кожен SSH transport як користувацький login. SSH forwarding/SFTP без logind session може не входити в цей scope; повертати scope у metadata.
- Для зв'язку з процесами користувача можна надати UID filter; не приписувати всі процеси UID одній конкретній SSH-сесії.
- Доступність списку та remoteHost визначається правами OS-користувача backend. «Вся доступна інформація» означає дозволені session metadata, а не passwords, SSH keys, environment або вміст термінала.
- Недоступний logind/denied metadata не представляти як «0 користувачів». Читання не повинно вимагати запуску всього backend від root.

## 5. Правила точності та якості даних

### 5.1. Загальні правила контрактів

- Обсяги передавати в bytes, швидкості — bytes per second, uptime — seconds, температуру — Celsius; одиниці зафіксувати в backend contracts і OpenAPI schemas.
- GB/MB або GiB/MiB, округлення й рядки часу формує frontend за обраним стандартом. Не повертати лише форматовані рядки.
- `collectedAt` — UTC ISO 8601; elapsed time для rate calculations вимірювати монотонним годинником. Зміна системного часу не повинна ламати швидкість.
- Для складеного snapshot мати identity і per-resource timestamps. Різні системні файли не читаються атомарно: не називати snapshot абсолютно одночасним.
- Зберігати `source: linux | mock`. Mock-дані не використовувати як доказ правильності Linux provider.
- До нових sample-контрактів запропонувати якість `ok`, `warming_up`, `unavailable`, `permission_denied`, `stale`, `partial` та machine-readable причину. Остаточний набір погодити в M1.
- Відсутнє значення представляти як `null` із причиною. `0` використовувати лише для справжнього нульового значення.
- Поточний `MemoryInfo` не перетворювати на несумісний контракт без окремої зміни schemas і тестів. Для dashboard можна додати зовнішній wrapper стану ресурсу.
- Не віддавати `NaN`, `Infinity`, некоректні відсотки або unsafe integers. Для великих cumulative counters визначити BigInt/string-представлення; дельти обчислювати до небезпечного перетворення в Number.
- Усі query parameters, payloads і відповіді мають runtime schemas. TypeScript interfaces самі не перевіряють зовнішні дані.
- Один недоступний датчик не повинен прибирати весь dashboard. Окремий endpoint ресурсу може повертати 503; складений snapshot — доступні секції та явні стани недоступних секцій.
- `health` означає лише liveness API. Не використовувати його як доказ працездатності всіх providers, collector або історії.

### 5.2. CPU

Визначити контракт до написання parser:

1. Використовувати дельти `/proc/stat`; не видавати накопичені з boot лічильники за миттєвий percent.
2. Рекомендована для погодження формула: `total = user + nice + system + idle + iowait + irq + softirq + steal`; `idleLike = idle + iowait`; `usage = 100 * (deltaTotal - deltaIdleLike) / deltaTotal`.
3. Не додавати `guest`/`guest_nice` вдруге. Обрану семантику iowait описати: він не є виконанням CPU.
4. Перший sample — `warming_up`. За нульової/некоректної дельти перебудувати baseline, не маскувати помилку обрізанням числа.
5. Після reboot, зміни набору CPU або зменшення counters скинути відповідний baseline.
6. Загальний CPU та кожен logical CPU — шкала 0–100. Не змішувати її зі шкалою CPU процесу.

Джерело семантики лічильників: [Linux proc_stat](https://man7.org/linux/man-pages/man5/proc_stat.5.html).

### 5.3. RAM і swap

- `totalBytes` означає usable RAM, яку Linux повідомляє як `MemTotal`, а не гарантований паспортний обсяг встановлених модулів.
- Для наявного RAM endpoint зберегти `used = MemTotal - MemAvailable`. Це оцінка пам'яті, недоступної для нових застосунків без reclaim/swap; не ототожнювати її із сумою RSS процесів.
- Linux `kB` у цих полях переводити множенням на 1024. `MemFree` не замінює `MemAvailable`.
- Swap: `used = SwapTotal - SwapFree`; погоджено власником: за `SwapTotal = 0` повертати `enabled: false`, нульові обсяги й `usedPercent: null` як «не застосовується». Відсутні/некоректні поля не означають disabled: окремий endpoint повертає `503 SWAP_INFO_UNAVAILABLE`.
- Окремо протестувати повністю доступну пам'ять, повністю зайнятий swap, відсутні/пошкоджені поля.

Джерело: [Linux proc_meminfo](https://man7.org/linux/man-pages/man5/proc_meminfo.5.html).

### 5.4. Диски й температура

- Для `statfs`: `total = blocks * bsize`, `free = bfree * bsize`, `available = bavail * bsize`, `used = total - free`. Окремо визначити знаменник percent; рекомендовано `used / total * 100` для картки capacity. Через reserved blocks `used + available` не обов'язково дорівнює `total`.
- Не обіцяти точну відповідність percent із `df`, якщо семантика знаменника відрізняється. Порівнювати raw values і документувати різницю.
- Спочатку читати `/`, потім — allowlisted mounts із перевіреної таблиці монтувань. Не приймати довільний filesystem path від клієнта.
- Урахувати escaped mount paths, pseudo filesystems, read-only mounts і зникнення mount. Не блокувати event loop синхронним обходом усіх дисків.
- Температура потребує sensor label/source. Перевірити units і faults; невідомий sensor не називати CPU package. Вибір libsensors або прямого hwmon reader зафіксувати після огляду доступного обладнання.

Джерела: [Node.js statfs](https://nodejs.org/api/fs.html#fspromisesstatfspath-options), [Linux hwmon](https://docs.kernel.org/hwmon/sysfs-interface.html).

### 5.5. Мережа, uptime і процеси

- Мережева швидкість — `deltaBytes / actualElapsedSeconds`. Перше читання, reset counter, новий interface або reboot потребують нового baseline.
- Для total визначити included interfaces, виключити loopback за замовчуванням; bridge/VLAN/tunnel можуть створювати подвійний підрахунок. Перед показом суми погодити політику агрегації. Передавати перелік included interface ids.
- Окремо представляти IPv4/IPv6, prefix і scope. Public IP може бути кілька, а NAT/CGNAT не визначається одним локальним interface address.
- Uptime, boot timestamp і boot identity мають узгоджуватися; wall-clock corrections не повинні скидати monotonic rates.
- Процес ідентифікувати через boot identity + PID + start time: PID може бути використаний повторно.
- CPU процесу — дельта `utime + stime`; ticks per second і page size отримувати з системи, не hardcode.
- Рекомендована для погодження htop-подібна шкала: 100% процесу означає одне повністю зайняте logical CPU, тому багатопотоковий процес може перевищувати 100%. Окремо можна повертати нормалізовану частку всієї машини; назви полів мають виключати плутанину.
- Пам'ять процесу для першої таблиці — RSS, не virtual size. Shared pages означають, що сума RSS не дорівнює зайнятій RAM.
- `/proc/<pid>/stat` не парсити простим split по пробілах: поле comm має дужки та може містити пробіли. Врахувати процеси, що завершилися під час обходу, й обмеження доступу.
- Не повертати environment процесів. Для command line визначити redaction; якщо безпечно приховати секрети не вдається, віддавати executable/comm замість повного argv.

Джерела: [Linux /proc](https://www.kernel.org/doc/html/v6.12/filesystems/proc.html), [proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html).

## 6. REST: де GET, де POST і які права потрібні

**Читання моніторингу — GET.** GET не змінює Linux і не запускає адміністративну дію. Фільтрація, сортування й вибір діапазону передаються query parameters. Автооновлення не вимагає POST.

Нижче — перелік endpoints. Основний backend-перелік реалізовано 2026-11-26; optional public IP залишається disabled. Чинні HTTP-контракти генеруються у Swagger; WS-контракт описано окремо.

| Метод і шлях | Призначення | Доступ / етап |
|---|---|---|
| `GET /api/v1/health` | Liveness без чутливих відомостей | Є; public |
| `GET /api/` | Swagger UI для реалізованих HTTP endpoints | Public у дозволеній LAN; без автоматичного доступу до метрик |
| `GET /api/json`, `GET /api/yaml` | Машиночитний OpenAPI, згенерований зі schemas | Без входу в наявній LAN |
| `GET /api/v1/system/info` | Hostname, ОС, kernel, CPU model/count, capabilities | Без входу; M3 |
| `GET /api/v1/system/memory` | RAM | Є; допрацювання M3 |
| `GET /api/v1/system/swap` | Swap | Без входу; M3 |
| `GET /api/v1/system/uptime` | Uptime, boot time/identity | Без входу; M3 |
| `GET /api/v1/system/load` | Load Average | Без входу; M3 |
| `GET /api/v1/system/cpu` | Загальний/per-core CPU snapshot | Без входу; M4 |
| `GET /api/v1/system/disks` | Capacity дозволених mounts | Без входу; M5 |
| `GET /api/v1/system/temperature` | Доступні датчики | Без входу; M5 |
| `GET /api/v1/network/interfaces` | Interfaces, addresses, link state | Без входу; M6 |
| `GET /api/v1/network/traffic` | Rates і включені в total interfaces | Без входу; M6 |
| `GET /api/v1/network/connections` | Обмежений список sockets; process mapping лише за доступності | Без входу; M6, після базової мережі |
| `GET /api/v1/network/public-ip` | Cached external address, якщо функцію погоджено | Без входу; optional M6 |
| `GET /api/v1/processes` | Обмежений список: sort, direction, user, search, limit, cursor | Без входу; M7 |
| `GET /api/v1/system/sessions` | Підключені користувачі Debian, login sessions, окремі лічильники та metadata | Без входу; M7; metadata в межах прав ОС |
| `GET /api/v1/services` | Стан сервісів і кількість у погодженій області | Без входу; M8 |
| `GET /api/v1/services/:name` | Деталі дозволеного unit | Без входу; M8 |
| `GET /api/v1/routing/routes` | IPv4/IPv6 routes | Без входу; M8 |
| `GET /api/v1/logs` | Журнал: unit, priority, since/until, limit, cursor | Без входу; M9; джерело в межах прав ОС |
| `GET /api/v1/metrics/current` | Складений dashboard snapshot із per-section quality | Без входу; M10 |
| `GET /api/v1/metrics/history` | Дозволені series, from/to, resolution | Без входу; M10 |
| `GET /api/v1/ws` з HTTP Upgrade | Відкриття WebSocket | Без входу; M11 |

Обмеження запитів визначити до реалізації відповідного endpoint: allowed sort fields, page size, часове вікно, довжина search, кількість series. Значення не підбирати навмання; перевірити на цільовому сервері та зафіксувати в config/schema. Invalid query — 400, невідомий ресурс — 404, тимчасово недоступний provider — 503. HTTP 401/403 для login/route guards у поточному API не вводимо. Загальне rate limiting, якщо введено, використовує 429.

**POST для читання CPU/RAM/процесів не додаємо.** Майбутнє збереження preferences або явна адміністративна дія може потребувати POST/PATCH/DELETE, але це окремий контракт. Кнопка Refresh читає стан; вона не повинна безконтрольно породжувати нові collectors чи OS processes.

Поточні monitoring endpoints відкриті для клієнтів локального API. Login, application roles і route guards відкладено. Права OS-користувача на читання Linux-даних зберігаються незалежно від HTTP-доступу.

## 7. Центральний збір метрик

Collector вводимо разом із CPU в M4, бо дельтові обчислення потребують стабільного baseline.

- Один логічний collector на backend process. Усередині — окремі завдання з різною періодичністю, а не одна надважка операція.
- Збір починається під час startup, завершується під час shutdown. Новий браузер не запускає свого збору CPU/RAM.
- REST і WebSocket читають ті самі нормалізовані результати services; формули не дублюються у gateway.
- Повільне завдання не перекриває саме себе; за перевищення інтервалу фіксувати missed collection, не нарощувати чергу.
- Незалежна помилка ресурсу не зупиняє інші завдання; зберігати час останнього успіху й причину помилки.
- Увести межі часу/паралельності й політику скасування. Конкретні значення погодити після вимірювання.
- Рекомендовані початкові інтервали зі специфікації §13.3: CPU/RAM/traffic — 2 s; processes — 3 s; disk/services — 10 s; routes — на зміну або periodic refresh. Це стартові налаштування, не доведені performance targets.
- Auto-refresh має визначений у §4.1 default 5 s і вибір 2/5/10/30 s для клієнта. Це не змінює глобальний інтервал збору. Login sessions читати зі спільного cache/change notifications із перевіреним fallback, а не окремо на кожен браузер.
- Температуру, довідкові дані та public IP не опитувати так само часто без потреби. Для public IP потрібні окремі cache/timeout policy.
- Межі stale age, кількості processes, concurrent reads і тривалості задач мають бути визначені до ввімкнення відповідної функції: `MUST_BE_DEFINED_BEFORE_ENABLE`.

## 8. WebSocket: де він потрібен і як працюватиме

WebSocket додаємо після перевірених REST contracts і collector. Він потрібен для live CPU, RAM, swap, traffic, temperature, оновлення processes/services/routes та live logs. Для рідкісного system info, історії й початкового завантаження залишаємо GET.

### 8.1. Послідовність клієнта

1. Клієнт відкриває локальну панель; вхід і credentials не потрібні.
2. Angular завантажує початкові дані через REST.
3. Відкриває **одне** WebSocket-з'єднання через Nginx.
4. Підписується лише на теми відкритого екрана.
5. Сервер підтверджує підписку й надсилає актуальний snapshot із identity, а потім updates.
6. Після підтвердження клієнт використовує WS snapshot як baseline; повільна REST-відповідь не перезаписує новіші WS-дані.
7. На виході зі сторінки клієнт відписується; logs припиняють надходити.
8. Після reconnect — нова підписка й resync. У першій версії не обіцяємо доставку кожного пропущеного update.

Поточний browser WebSocket планується без облікових даних і login cookies. Автентифікацію можна спроєктувати окремо в майбутньому; вона не є залежністю M11.

### 8.2. Проєкт протоколу

Робочі повідомлення клієнта: `subscribe`, `unsubscribe`. Робочі відповіді сервера: `subscribed`, `snapshot`, `update`, `error`, `resync_required`. Це внутрішній протокол нашого застосунку, не нова система Event Bus.

Теми-кандидати: `system.cpu`, `system.memory`, `system.swap`, `system.temperature`, `system.sessions`, `network.traffic`, `processes`, `services`, `routing.routes`, `logs`.

Метадані підписки включають validated client update interval із §4.1. Відписка від metrics під час паузи не скасовує heartbeat. Для повільних ресурсів і спільного uptime/load/disk snapshot визначити доставку без фальшивих нових timestamps; транспорт покриває всі видимі live-картки, навіть якщо окремий topic для них не створюється.

Для повідомлення погодити: protocol version, type, request/subscription id, topic, stream identity, sequence, collectedAt, data, quality. Boot identity і новий stream id дозволяють відрізнити перезапуск від звичайного reconnect. Послідовність визначити явно — рекомендовано в межах теми й stream; не вважати sequence глобальним persistent counter.

До тем і фільтрів застосовувати runtime validation. Unknown topics, invalid filters і надмірні підписки відхиляти. Авторизацію тем та lifecycle login-сесій у поточну реалізацію не додаємо.

### 8.3. Надійність і обмеження

- Heartbeat ping/pong і deadline для видалення мертвих клієнтів.
- Cleanup handlers, timers, subscriptions і journal readers після close/error.
- Backpressure: обмежені pending bytes/messages. Для gauges можна замінити старий pending snapshot новішим; для logs потрібно позначити gap, а не приховано втрачати записи.
- Slow clients від'єднуються або проходять погоджений resync; їхня черга не може рости безмежно.
- Reconnect із backoff/jitter, без паралельних socket і дубльованих handlers.
- Межі connections, subscriptions, message size, heartbeat і queue узгодити й перевірити до ввімкнення M11.
- App-level WS errors обробляти явно: після upgrade не покладатися лише на REST error handler. Message handlers під'єднувати одразу, щоб не втрачати ранні повідомлення.

### 8.4. Nginx для WS

Окремий HTTP-порт не потрібен: `/api/v1/ws` проходить через той самий Nginx. Для конкретного WS location потрібні HTTP/1.1 до upstream і явне передавання `Upgrade` та `Connection`. HTTP-запити інших endpoints залишаються звичайними REST.

Якщо додаємо окремий `location = /api/v1/ws`, у ньому повторюємо LAN allow/deny та потрібні proxy headers: правила із сусіднього `location /api/` автоматично не успадковуються. Read timeout має узгоджуватися з heartbeat, інакше Nginx закриватиме здорове idle-з'єднання. Перевірити handshake 101, проходження повідомлень, idle та reconnect саме через Nginx. Після HTTPS використовувати `wss://`.

Джерела: [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html), [офіційний Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket). Перед установленням перевірити сумісність версій.

## 9. Історія для графіків

Вибір Last 15 minutes на скріншоті потребує вже зібраних samples. Він застосовується до графіків згідно з §4.1; числові картки та списки залишаються поточними. Не генеруємо минулі точки при відкритті сторінки.

- Перший варіант — bounded in-memory ring buffer лише вибраних числових series. Він не переживає restart; API має повідомляти доступний фактичний діапазон.
- Ємність, retention, роздільність, максимальну кількість точок відповіді та estimated memory cost погодити до ввімкнення історії.
- Для довшого зберігання після reboot розглянути SQLite відповідно до специфікації, лише коли це стане вимогою. Тоді потрібні schema, migrations, retention cleanup, batch writes і перевірка disk usage.
- Початкові series: total CPU, RAM, swap, RX/TX за вибраними інтерфейсами, вибрані temperature sensors. Не зберігати всі процеси й повний journal у нашій БД за замовчуванням.
- Для gaps, warming-up і unavailable зберігати статус; не інтерполювати їх як реальні вимірювання й не заповнювати нулями.
- Розрізняти sample time та aggregation window. Для downsampling визначити mean/min/max і значення timestamp; не підсумовувати percentages або rates без визначеної семантики.
- REST history є для графіків, WS — для нових точок. Узгодити boundary, щоб початкова історія і live update не дублювалися.

## 10. Поетапне виконання

Наведені checklists описують повне завершення етапів, а не відсутність будь-якої роботи.
Health, базова RAM, Swagger і deployment script уже є. Nginx route та попереднє
розгортання перевірялися раніше. Оновлений backend розгорнуто й перевірено 2026-11-26;
це не означає повторне створення основи. M2 відкладений і не блокує моніторинг.
Базовий RAM endpoint сам по собі не робить весь M3 завершеним.

### M0 — Звірити середовище й актуальність розгортання

- [x] Пояснити власнику актуальні локальні та серверні папки, commands і process lifecycle.
- [x] Перед deploy перевірити, що вже налаштований Nginx route працює; не застосовувати setup script повторно для звичайного оновлення API.
- [x] Перевірити health через `192.168.1.33`, а memory — звичайним GET без додаткових заголовків; port 3000 залишити loopback.
- [x] Розгорнути самостійний `apps/api` без shared package; перевірити `/api/`, локальні assets, OpenAPI JSON та виконання HTTP-запитів за згенерованими контрактами через Nginx. Ручне натискання Try it out у браузері не було окремим тестом.
- [x] Використовувати локальний `deployment/update/deploy.sh` для наступних оновлень; відрізняти source directory на Windows від compiled release на Debian. Для кожного запуску записувати фактичний результат, не вважати наявність скрипта доказом успішного deploy.
- [x] Прибрати застарілі пояснення SSH-tunnel access під час відповідної code/doc зміни; не відновлювати port forwarding.
- [x] Записати версії, спосіб запуску, розташування logs, спосіб зупинки й поточні права. Без паролів і токенів.

**Готовність:** власник розуміє запуск; фактичний Nginx route перевірений; локальний код і deployed revision ідентифіковані. Потрібний sudo-крок виконується явно, а не обходиться.

### M1 — Зафіксувати API-контракти та якість даних

**Статус 2026-11-26:** контракти реалізованих backend-ресурсів, quality/null, compatibility, HTTP schemas, WS v1 і query limits зафіксовано. Джерело подробиць — MONITORING_CONTRACTS.md; попередні інкременти — записи 16–17.

- [x] Погодити одиниці, null/status, timestamps, schema version і політику сумісності наявного RAM endpoint.
- [x] Визначити DTO лише для найближчих ресурсів; не створювати заготовки всіх майбутніх модулів.
- [x] Для кожного DTO додати runtime schema, success/error examples, семантику полів і межі значень.
- [x] Визначити перевірку відповідності TypeScript contracts і schemas, щоб вони не розходилися.
- [x] Для нового HTTP endpoint перевіряти появу в Swagger, правильні responses/units; OpenAPI генерується зі schemas, не ведеться окремою ручною копією. WS message contracts описувати окремо: Swagger не замінює протокол live-повідомлень.
- [x] Визначити загальні query limits та правила валідації.
- [x] Відобразити уточнення §4.1–4.2 у контрактах: transport status, client interval, current server address, sample identity, RSS-based MEM% і login sessions.

**Готовність:** backend і майбутній Angular мають однозначне пояснення кожного поля, включно з недоступними даними. Документація відрізняє поточний API від майбутнього.

### M2 — Майбутній захист доступу: відкладено

За рішенням власника зараз не реалізуємо login, route guards, application roles або перевірку credentials. Цей етап не є залежністю M3–M12. Повертатися до нього лише за окремим майбутнім завданням; детальний контракт тоді визначатиметься заново.

### M3 — System info, RAM, swap, uptime, load

**Статус 2026-11-26:** M3 backend реалізовано та перевірено на Debian; RAM-контракт збережено. Capabilities доступні у metrics/current, а не вгадуються з hostname.

- [x] Додати hostname, OS/kernel/arch, CPU topology metadata і capabilities доступних providers.
- [x] Зберегти й перевірити наявну RAM-формулу; додати swap без ділення на нуль (локальні перевірки).
- [x] Додати uptime/boot identity й load averages з явними одиницями.
- [x] Створити відповідні GET endpoints та mocks.
- [x] Звірити з Debian: `/etc/os-release`, `uname`, `free -b`, `uptime`, `/proc/meminfo` у близькі моменти часу.

**Готовність:** відповіді відповідають джерелам; реальні нулі відрізняються від відсутніх полів. Формули й допустима методика порівняння описані, а не підігнані під скріншот.

### M4 — Central collector і CPU

- [x] Погодити CPU formula та baseline lifecycle із розділу 5.
- [x] Реалізувати shared collection scheduler/cache для CPU/RAM/swap/load/uptime.
- [x] Додати total/per-core CPU і sample window у GET response.
- [x] Покрити warming-up, counter reset, boot identity reset, hotplug, нульову дельту та повільну collection task тестовими fixtures; фактичний reboot перевірено окремо.
- [x] Перевірити, що повторні HTTP requests не створюють collectors і не змінюють baseline на клієнта.
- [x] Порівняти з `top`/`mpstat`, якщо інструмент доступний, за співставних інтервалів і CPU accounting semantics.

**Готовність:** кілька клієнтів читають один набір вимірювань; percent обчислюється з правильних дельт; stale/error behavior видимий.

### M5 — Disk capacity й sensors

- [x] Додати `/` через statfs, metadata mount і формулу відсотка.
- [x] Погодити перелік додаткових mounts, фільтри pseudo filesystems і відсутність довільних paths.
- [x] Оглянути доступні temperature sensors, labels, units і необхідні права без зміни драйверів.
- [x] Додати незалежні collector tasks і GET endpoints.
- [x] Перевірити з `df -B1` та доступними sensor readings; пояснити reserved-space differences.

**Готовність:** capacity не плутається з throughput; недоступний датчик не створює неправдиву температуру.

### M6 — Network interfaces, traffic, connections

- [x] Додати interfaces, addresses/prefixes, link state та stable interface identity.
- [x] Реалізувати вибір Current IP Address за §4.1: фактична адреса сервера, preferred interface за неоднозначності, явний стан при втраті адреси.
- [x] Реалізувати rate calculation і reset handling; погодити total aggregation.
- [x] Оцінити netlink-доступ: обрано встановлений iproute2 як rtnetlink-клієнт із JSON та fixed argv, без додаткової native netlink-бібліотеки; рішення задокументовано.
- [x] Додати interfaces/traffic GET. Connections — окремим невеликим кроком із bounded output і правами.
- [x] Public IP залишити disabled до погодження зовнішнього запиту, privacy, cache, timeout і failure behavior. Не приймати довільний external URL від клієнта.
- [x] Звірити з `ip -j address`, `ip -s link`, `ss`, якщо вони доступні; використовувати однаковий scope і часові вікна.

**Готовність:** RX/TX мають правильні одиниці й elapsed window; зміна інтерфейсу не дає негативного трафіку; total не містить прихованого double count.

### M7 — Processes і підключені користувачі Debian

- [x] Додати bounded `/proc` scan із cancellation/timeout та UID resolution cache.
- [x] Зафіксувати CPU шкалу, RSS і process identity; збирати процеси незалежно від кількості клієнтів.
- [x] Реалізувати GET зі стабільним sort/tie-breaker, фільтрами, limit і snapshot-aware pagination.
- [x] Якщо snapshot між сторінками змінився, явно resync/новий cursor; не обіцяти консистентний список через простий offset у живому наборі.
- [x] Top Processes отримувати сортуванням спільного snapshot, не окремим OS scan. UID filter є фільтром процесів, а не вмістом вкладки Users.
- [x] Для Users додати read-only logind provider, GET sessions, дозволені metadata й окремі counts users/sessions за §4.2; реалізувати через system module без окремого runtime сервісу.
- [x] Перевірити два входи одного UID, SSH/local sessions, idle, logout, closing, session без TTY/remoteHost та відмову logind. Порівняти з доступним `loginctl`, не створюючи й не закриваючи реальні входи в автоматичних тестах.
- [x] Зафіксувати `MEM% = RSS / MemTotal * 100` та identity denominator; перевірити відсутню RAM і незалежність від формули used RAM машини.
- [x] Перевірити PID reuse, завершення процесу під час читання, denied fields, Unicode/spaces у command і redaction.
- [x] Звірити з `ps`/`top` із однаковими визначеннями CPU/RSS.

**Готовність:** одна проблемна PID-директорія не ламає таблицю; команда не розкриває secrets; pagination і CPU/MEM percentages мають описану семантику. Users показує login sessions, не process owners; кілька входів одного UID збільшують sessionsCount, але не connectedUsersCount.

### M8 — Services і routing

- [x] Через systemd D-Bus читати units і `LoadState`, `ActiveState`, `SubState`, description; визначити scope: system services чи також user services.
- [x] Для картки Active Services погодити selected units та семантику running count; не видавати їх за всі сервіси ОС.
- [x] Не прирівнювати active до listening/healthy. Node API може бути звичайним процесом без unit: тоді не вигадувати йому systemd state.
- [x] Порти сервісів отримувати лише з окремої перевірки sockets/metadata з явним джерелом; не hardcode «Nginx = 80/443».
- [x] Через rtnetlink читати IPv4/IPv6 routes: destination/prefix, gateway, interface, metric, table, protocol; підтримати multipath або явно позначити обмеження.
- [x] Реалізувати GET services/detail/routes; cache оновлюється periodic refresh 10 s. Change notifications не підключалися: обрано передбачений планом polling fallback.
- [x] Звірити із `systemctl show/list-units` і `ip -j route`; не змінювати units/routes у тестах.

**Готовність:** API чітко відрізняє state, availability, health і permissions; підвищені права не додаються без окремої необхідності.

Джерела: [systemd D-Bus](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html), [rtnetlink](https://man7.org/linux/man-pages/man7/rtnetlink.7.html).

### M9 — Logs: спочатку REST

- [x] Погодити scope доступного journal і redaction; не давати читання всієї файлової системи.
- [x] Обрати journal interface. Якщо використовується `journalctl`, запускати лише у provider через fixed executable і validated argv без shell construction.
- [x] Поля: cursor, timestamp, boot identity, priority, unit/identifier, PID за наявності, message. Відсутні metadata не вгадувати.
- [x] Реалізувати bounded GET із unit/priority/time filters і opaque cursor. Для `journalctl` обрати structured output, а не парсити текст для термінала.
- [x] Описати cursor direction, end-of-page, journal rotation, недоступний cursor і gaps. Відсутність прав не представляти порожнім успішним журналом.
- [x] Перевірити довгі/багаторядкові записи, Unicode, control characters та помилки джерела.

**Готовність:** journal читається лише в погоджених межах; API не утримує необмежений journal у RAM і не виконує довільні команди.

Джерело: [journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html).

### M10 — Dashboard snapshot і коротка історія

- [x] Зібрати `metrics/current` зі спільного cache, per-section timestamps/quality і capabilities.
- [x] Забезпечити спільний memory/uptime sample для повторюваних блоків dashboard; зберегти поточні картки незалежними від вибору history range.
- [x] Погодити ring buffer limits і реалізувати тільки потрібні графіки.
- [x] Додати validated GET history із обмеженням series/range/points.
- [x] Позначати реальні gaps, startup і недостатню історію для обраного діапазону.
- [x] Перевірити memory cost і restart behavior. SQLite не додавати без вимоги persistent history.

**Готовність:** всі реалізовані картки можуть отримати узгоджений за метаданими snapshot; графіки не містять вигаданих даних до startup.

### M11 — Live updates через WebSocket

- [x] Зафіксувати версію протоколу з розділу 8.
- [x] Додати сумісний Fastify WS plugin, gateway і subscription manager.
- [x] Почати з CPU/RAM/traffic; потім окремими кроками підключити решту перевірених тем.
- [x] Для logs додати bounded live reader із cursor/gap/resume policy. Не створювати reader на кожен browser; групувати однакові subscriptions або використовувати спільне джерело з фільтрацією.
- [x] Налаштувати WS Upgrade у Nginx, зберігаючи наявну LAN-конфігурацію Nginx.
- [x] Перевірити відкритий handshake без credentials, invalid messages, heartbeat, backpressure, reconnect, dedup і cleanup.
- [x] Перевірити backend client intervals 2/5/10/30 s, pause/resume/reconnect і heartbeat failure; Users передаються зі спільного snapshot. Angular contract забороняє паралельний polling.
- [ ] Перевірити реальну зелену індикацію та відсутність паралельного polling у майбутньому Angular UI — відкладено до frontend, apps/web у цій задачі не змінюється.
- [x] REST лишити доступним для initial load/history/manual refresh; не змушувати всі queries переходити на WS.

**Готовність:** один socket на клієнт; нові підписники не множать Linux collection; API переживає disconnect без витоків handlers/processes/memory. Live logs явно повідомляють про пропуски.

### M12 — Перевірка цілого моніторингу та передача до Angular

- [x] Провести read-only Linux integration checks усіх реалізованих providers під тим самим OS user, що запускає API.
- [x] Виміряти власні CPU/RAM API, collection duration, event loop delay і response size під погодженим сценарієм трьох клієнтів; межу WS queue перевірити локальним backpressure-тестом. Реальне насичення мережевої черги на сервері не створювалося. Записати умови, версії й фактичні результати.
- [x] Вибрати прийнятні resource budgets разом із власником за результатами вимірювань; не вигадувати production SLO або thresholds.
- [x] Відпрацювати SIGTERM, reboot/restart, втрату provider, stale data, відмову журналу й Nginx reload.
- [x] Налаштувати постійний запуск: `nodexora-api.service` як user unit `dvor`, enabled і `Linger=yes`, Linux provider, user journal, restart-on-failure; unit поза runtime-папкою. Окремого env file або sudo для поточного налаштування не потрібно. Фактичний reboot перевірений 2026-11-26. Для own journal використовуються системні retention rules; окремі правила очищення не змінювалися.
- [x] Оновити README, API examples, список підтримуваних/недоступних метрик і process lifecycle.
- [x] Підготувати для Angular OpenAPI, REST приклади, WS message contracts/flow, loading/error/partial/stale states і правила форматування одиниць; не імпортувати backend source у frontend.
- [x] Звірити backend-контракт зі скріншотом: зв'язок, Auto-refresh, history тільки для графіків, Users login sessions, IP сервера та повторювані RAM/uptime. Реальна візуальна перевірка Angular залишається frontend-завданням.

**Готовність:** результат кожного доступного блоку dashboard пояснюється джерелом і перевіркою. Невпроваджені features позначені явно; немає автоматичного переходу до адміністрування.

## 11. Що перевіряємо на кожному етапі

| Рівень | Мінімальна змістовна перевірка |
|---|---|
| Parser | Коректні fixtures Debian, відсутні/пошкоджені поля, units, великі counters, дозволи |
| Service | Формули, quality, null vs zero, normalization, clock/baseline reset |
| REST | Fastify injection: response schema, filters, status codes, відкритий доступ без заголовків, no secret leakage |
| Collector | Fake clock, відсутність overlapping scans, stale/error isolation, shutdown cleanup |
| WS | Реальний handshake/message flow без credentials, resync, slow client, limits, disconnect cleanup |
| Debian integration | Перевірка raw source та звірка з доступним системним інструментом у зіставних умовах |
| Nginx | `nginx -t`, реальний HTTP/WS через proxy, LAN policy, headers, idle behavior |
| Deployment | Чистий install/build незалежного `apps/api`, Swagger через Nginx, non-root runtime, secrets поза repo, restart |

Після code-зміни запускати доречні `npm run build`, `npm run check`, `npm test` із `apps/api`. Додаткові integration/WS checks додавати тоді, коли з'являється відповідна функція. Не встановлювати інструменти й не створювати штучне навантаження на сервері мовчки. Відсутній інструмент записати як обмеження перевірки.

Порівняння зі скріншотом не є тестом точності. Порівняння з `top`/`free`/`df` без узгодження часу, одиниць і формули також недостатнє. Числові tolerances визначати до конкретної перевірки, а не під результат.

## 12. Рішення, які потрібно прийняти до відповідних етапів

| Рішення | Коли потрібне |
|---|---|
| Quality/status envelope і сумісність `MemoryInfo` | M1 |
| CPU iowait policy та шкала process CPU | До M4/M7 |
| Disk percent denominator і mount allowlist | До M5 |
| Sensor mapping, спосіб читання та очікувана відсутність датчиків | M5 |
| Interfaces у network total; virtual interfaces; IPv6 і connections scope | M6 |
| Preferred LAN interface/address family, якщо є кілька придатних адрес сервера | M6; семантика картки вже визначена в §4.1 |
| Logind session mapping, підтримувані metadata та права ОС на читання remoteHost | M7; призначення вкладки Users уже визначено в §4.2 |
| Чи потрібен public IP і яке зовнішнє джерело дозволено | До ввімкнення optional public IP |
| Повний command line чи безпечна назва процесу; redaction policy | M7 |
| Selected service units, system/user scope, трактування running count | M8 |
| Logs scope, доступ OS user, cursor/filter limits | M9 |
| History retention/resolution/memory budget; чи потрібен persistent storage | M10 |
| Collection/query/WS limits і heartbeat/backpressure policy | До ввімкнення відповідної функції |
| Виміряні performance budgets та політика зберігання журналів; автозапуск user service вже налаштований | M12 |

Рішення фіксуємо тут або в пов'язаному контракті перед реалізацією. Відсутнє рішення не замінюємо припущенням у коді. Наведені рекомендації є пропозиціями, а не вже схваленою конфігурацією.

Уточнення власника й engineering-рішення §4.1–4.2 вже зафіксовані: індикатор реагує на втрату зв'язку; default Auto-refresh 5 s з вибором частоти; history range керує графіками; Users показує login sessions Debian; Current IP — адреса сервера; повторювані показники мають спільні samples. Ці пункти не повертати в список невизначених вимог; деталізувати залишені provider/config-рішення на відповідному етапі.

## 13. Шаблон запису виконаного кроку

Для кожного завершеного невеликого завдання дописувати:

- Дата та етап M0–M12.
- Що саме погоджено і реалізовано.
- Які файли й контракти змінено.
- Яке джерело даних використано та як обчислюється результат.
- Які команди/тести виконано і їх фактичний результат.
- Які серверні зміни застосовано, ким і до якої revision.
- Відомі обмеження, відкриті рішення, наступний невеликий крок.

**Наступний напрям після backend:** реалізація Angular за MONITORING_CONTRACTS.md окремим завданням; frontend-перевірки не позначати виконаними за backend-тестами. Поточний runtime і реальні перевірки — записи 18–19.

## 14. Запис перевірки скрипта оновлення — 2026-11-25

- Додано локальний entry point `deployment/update/deploy.sh` та правило LF для Bash-файлів у `.gitattributes`.
- Повний запуск виконано через Git Bash на Windows: `npm ci`, перевірка типів, усі 10 тестів, build у свіжий тимчасовий каталог, архів і передавання через SSH.
- На Debian встановлено лише production dependencies; перед зупинкою старого API compiled JavaScript перевірено через Fastify injection із реальним Linux provider, включно з тодішнім контрактом доступу та RAM.
- Нова збірка активована в `/home/dvor/nodexora/api`; перевірені Swagger UI/assets, OpenAPI та RAM через Nginx. Процес залишився non-root; Nginx config не змінювався. Це історична перевірка попередньої версії, до поточного спрощення API.
- Перевірено звільнення deployment lock після завершення; API не утримує його у своєму процесі. У тій історичній версії release містив також documentation, deployment scripts і `release.json`. Поточний формат пакета спрощено до runtime-файлів; ця історична перевірка не підтверджує розгортання нового формату.
- Та історична версія скрипта містила спробу rollback і використовувала ручний запуск, без systemd. Примусова перевірка аварійного rollback на робочому сервері **не проводилася**. Поточний запуск переведено на user service, як описано в записі 15; оновлення все ще має коротке переривання.
- Це виконання перевіряє механізм оновлення поточного базового API, а не завершення всіх вимог M0–M12.

## 15. Налаштування автозапуску — 2026-11-25

- На сервері виявлено чинні user manager systemd і `Linger=yes`; використано user unit без sudo.
- Unit із `deployment/setup/nodexora-api.service` встановлено в `/home/dvor/.config/systemd/user/` і перевірено через `systemd-analyze --user verify`.
- Старий перевірений ручний процес зупинено, obsolete PID file прибрано. API запущено через `systemctl --user`; стан enabled/active підтверджено. Nginx також enabled.
- Deploy переведено на stop/start того самого сервісу; rollback також використовує його. README, scripts і unit не потрапляють у runtime archive.
- Виправлено Windows CRLF для передавання activation instructions у Linux shell. Після виправлення повне оновлення пройшло: локальні build/type checks, 10 тестів, Linux preflight, systemd activation та HTTP Swagger/RAM через Nginx.
- Задокументовано user journal і команди service status/restart. Перезавантаження сервера, logout усіх користувачів і примусовий crash-тест не виконувалися; автоматичний boot підтверджений конфігурацією enabled + linger, а не фактичним reboot-тестом.

## 16. Уточнення контракту RAM у межах M1 — 2026-11-25

- Погоджений обсяг: приклади успішної відповіді й `503`, тест повністю доступної RAM та актуалізація статусу плану. URL, поля, формули, HTTP status codes, доступ і cache policy збережені.
- `src/modules/system/schemas/memory.schema.ts`: додано приклад із явним `source: mock` та приклад `MEMORY_INFO_UNAVAILABLE`; уточнено bytes, перетворення Linux kB через множення на 1024, timestamp після збору й поведінку за відсутніх/некоректних даних. Приклади не є вимірами сервера.
- `tests/system.test.ts`: синтетичний meminfo проходить parser, service і HTTP serialization; коли `MemAvailable = MemTotal`, API повертає `usedBytes = 0`, `usedPercent = 0` і `source: mock`.
- `tests/swagger.test.ts`: перевірено одиниці, типи bytes-полів, межі percent, timestamp format, source та відповідність прикладів у згенерованому OpenAPI фактичним mock success/error відповідям; timestamp прикладу перевіряється окремо як фіксована ілюстрація.
- Джерело реальних даних незмінне: provider читає `/proc/meminfo`, service обчислює `usedBytes = totalBytes - availableBytes` і `usedPercent = usedBytes / totalBytes * 100`. Нових показників або providers не додано.
- Локально виконано `npm run format`, `npm run format:check`, `npm run build`, `npm run check`, `npm test`: фінальні перевірки успішні, 11 із 11 тестів пройшли.
- Підключення до Debian, deploy та серверні зміни не виконувалися; серверна revision цим кроком не змінювалася. Linux integration, Nginx і reboot цими локальними тестами не перевірені.
- M1 залишається частково виконаним: quality/status/null, schema version, загальна політика сумісності, query limits і контракти наступних ресурсів ще не завершені. Наступний невеликий крок — погодити правила сумісності та status/null для найближчого нового ресурсу, зберігаючи наявний RAM-контракт.

## 17. Swap endpoint у межах M1/M3 — 2026-11-25

- Власник погодив окремий `GET /api/v1/system/swap` та випадок вимкненого swap: `enabled: false`, `totalBytes/freeBytes/usedBytes: 0`, `usedPercent: null`. Нові дані додаються окремим endpoint у `/api/v1`; наявний RAM-контракт збережено. Загальні quality/status та schema version для майбутніх складених snapshots цим кроком не визначені.
- `src/modules/system/schemas/swap.schema.ts` містить повну response schema, семантику, одиниці, nullable percent, mock success example та `503` error example. DTO додано в `system.types.ts`, маршрут — у `system.routes.ts`, HTTP envelope — у `system.controller.ts`, обчислення — у `system.service.ts`.
- `src/infrastructure/linux/system.provider.ts`: `getSwapInfo` читає `/proc/meminfo` раз на запит; `parseSwapMeminfo` перевіряє `SwapTotal`/`SwapFree`, одиниці kB, дублікати, safe integers та `0 <= free <= total`. Множення на 1024 дає bytes; `used = total - free`; percent обчислюється лише за `total > 0`. Читання не потребує sudo чи shell commands, але потребує дозволу ОС на файл. Помилка читання або парсингу дає `503 SWAP_INFO_UNAVAILABLE`, без витоку внутрішніх деталей.
- `mock-system.provider.ts` отримав явні swap fixtures із `source: mock`. RAM і swap читаються незалежно; спільний collector не додавався. Endpoint без автентифікації, успішні й помилкові відповіді мають `no-store`.
- `tests/swap.test.ts`: parser, partly/fully used, unused/disabled swap, null percent у HTTP serialization, помилки читання/парсингу, збереження доступності RAM та OpenAPI. Наявні `system.test.ts` і `swagger.test.ts` адаптовано до нового provider method і додаткового маршруту.
- `README.md` описує новий API і його локальний статус; `apps/PROJECT_SPEC.md` актуалізовано щодо реалізованих ресурсів.
- Локально виконано `npm run format`, `npm run format:check`, `npm run build`, `npm run check`, `npm test`: успішно, 19 із 19 тестів пройшли. Дані тестів синтетичні, не показники сервера.
- Серверних підключень, deploy або змін server revision не було. Порівняння з `/proc/meminfo`/`free -b` на Debian, перевірка Nginx нового endpoint і reboot не виконані. M0, M1 та M3 не позначаються повністю завершеними.

## 18. Погоджений повний backend scope — 2026-11-26

- Власник явно дозволив виконати весь backend-план, завершальний deploy і серверні перевірки. Колишнє обмеження «лише один інкремент» цим запитом розширено; apps/web залишається поза задачею.
- Погоджено: лише диск `/`; назви процесів без argv/environment; усі доступні loaded system і current-user services; журнали тільки NodeXora; history за 15 хвилин у пам’яті; без public-IP запитів і login.
- Власник доручив обрати й перевірити технічні limits. Значення з `src/config/monitoring.ts`, джерела, одиниці, partial/stale/error поведінку та протокол наведено в MONITORING_CONTRACTS.md. CPU iowait трактовано як idle, process CPU — 100% на одне logical CPU, network total — лише фактично виявлений enp5s0 while UP, preferred address — global IPv4 на ньому.
- Замість native netlink/D-Bus бібліотек використано встановлені iproute2/systemctl/busctl/loginctl як read-only protocol clients із fixed executable/argv. Для температури обрано hwmon з driver labels і fault checks; не вигадуються CPU package labels.
- Після фактичних вимірювань власник погодив development comparison budgets для сценарію трьох клієнтів: RSS ≤ 200 MiB, mean Event Loop delay ≤ 50 ms. Це не production SLO і не гарантія для іншого навантаження.
- Власник особисто застосував одноразовий `update-nginx-ws.sh` через sudo (після виконання скрипт прибрано під час cleanup). nginx -t пройшов до й після зміни; exact WS location зберігає LAN policy. Збережена резервна копія snippet. Рутинний deploy не змінює Nginx.
- Власник дозволив reboot і виконав його під час повторного deploy. Після повернення доступу перевірено boot identity, enabled/active user service, Linger=yes, Nginx і health. Перерваний deploy не зараховано успішним; фінальну збірку розгорнуто заново.

## 19. Звіт завершальної перевірки — 2026-11-26

### Реалізація й локальні перевірки

- Збережено самостійний npm-проєкт, наявні health/RAM/swap контракти, HTTP envelopes, no-store і доступ без credentials. RAM/swap тепер читають shared collector sample з первісним timestamp, а не збираються для кожного браузера.
- Реалізовано M3 ресурси; M4 collector і CPU; M5 root disk/sensors; M6 addresses/traffic/bounded connections; M7 bounded process scan, UID cache, snapshot pagination і logind sessions; M8 services/details/IPv4+IPv6 routing; M9 own journal; M10 composed snapshot/history; M11 WS v1, subscriptions, heartbeat, backpressure та один shared event-driven journal reader.
- Route files короткі; schemas винесені у feature schema files, calculations — у services, OS reads — у providers, HTTP envelopes — у controllers. Порожніх майбутніх modules, login чи керування Linux не додано.
- `npm run format`, `npm run format:check`, `npm run build`, `npm run check` успішні. Підсумкові 40/40 тестів пройшли. Реальний loopback WS test запускався з дозволом на локальні sockets; mock не видається за Linux integration.
- Тести охоплюють units/formulas, null/zero, CPU reset/boot/hotplug, BigInt deltas, PID reuse, UID cache, vanished/denied processes, Unicode/parentheses у comm, logind filter/idle/missing metadata, відмову provider/journal, cursor resync, history bounds/gaps, cache sharing, invalid WS messages, усі delivery intervals, pause/resume/reconnect, heartbeat timeout, oversized payload/snapshot і connection cap.
- OpenAPI генерується зі schemas; типізовані mock examples не є вимірами сервера. Ручне натискання Swagger Try it out не було окремою перевіркою; відповідні HTTP-запити, OpenAPI й UI/assets перевірені автоматично.

### Debian, deploy та reboot

- Debian 13.7, Node.js v26.13.1, kernel 6.12.115+deb13.1-amd64. Перевірки виконано як dvor, UID 1000, без root API. Listener залишився 127.0.0.1:3000; доступ LAN через Nginx.
- Штатний `deployment/update/deploy.sh` виконав clean install, type check, tests, fresh build, runtime-only archive, Linux preflight, systemd activation і HTTP checks. Runtime містить лише dist, package manifests і production node_modules; документація/scripts не встановлювалися в API runtime.
- SHA-256 усіх compiled JS і обох package manifests звірено з локальною збіркою; результат fingerprint-перевірки зафіксовано в цьому звіті. Проміжний `runtime-manifest.json` прибрано під час подальшого cleanup. Це ідентифікує непідкомічену збірку без вигаданого git revision.
- Boot ID змінився з `cf3cf6d6-ca5d-45a7-b44b-e16c8b9e479a` на `be111291-fd0e-4920-89f9-9bf887affd33`. Після owner-initiated reboot API/Nginx автоматично повернулися active. Остаточний runtime розгорнуто після цього reboot; примусовий crash/другий reboot фінальної збірки не виконувався.
- Перевіркою service state зафіксовано enabled/active, Linger=yes, non-root user і loopback listener; дубльований текстовий snapshot прибрано під час cleanup. Після відключення WS клієнтів окремий journalctl reader не залишився активним. Staging невдалого, перерваного reboot релізу спочатку залишено для огляду, а потім видалено під час cleanup після успішних перевірок.
- LAN-перевірка підтвердила REST, Swagger/assets, WS handshake, Linux snapshot і update із Windows через 192.168.1.33; дубльований `lan.json` прибрано під час cleanup.
- `deployment/checks/verify-server.mjs` звіряє hostname/OS/kernel, RAM із /proc і free -b, swap, statfs/df, ip addresses/counters/routes, bounded sockets із ss, process RSS/UID із ps, sensor raw files, sessions, services і own journal. Допуски для неодночасних читань задані перед перевіркою в скрипті; вони не є production targets.
- Top-порівняння з неідентичними вікнами має лише observational статус. Для незалежної CPU-перевірки взято два /proc/stat readings одразу після сусідніх API samples з polling 100 ms; допуск 5 percentage points зафіксовано до цього тесту.

### Фактичний фінальний результат (2026-11-26T14:01:11.509Z)

- Усі 14 секцій мають quality=ok.
- Незалежна CPU-звірка: API 5.598%, raw /proc/stat 5.959%; вікна 2.003/1.959 s.
- Три WS клієнти, 35 s через Nginx: 229 updates, 6 heartbeat pings, 3 live-log updates, errors=[].
- RSS наприкінці: 101.59 MiB; mean Event Loop delay 20.146 ms, max 51.151 ms. Погоджені development budgets пройдені.
- missedCollections=0, timedOutCollections=0; metrics/current response 91359 bytes.
- Перевірено 67 runtime fingerprints. Тимчасовий JSON-звіт видалено за запитом власника; підсумкові виміри збережено тут. Цифри не є постійними характеристиками сервера.

### Межі висновку та залишені роботи

- Backend у погодженому LAN development scope реалізовано, розгорнуто і перевірено. Це не заявка на production readiness, довготривалий soak test або повну підтримку будь-якого Debian host.
- Реальна Angular зелена індикація, браузерний reconnect/backoff і перевірка відсутності дубльованого polling залишаються для frontend; контракт передано, apps/web не змінювався.
- Не ввімкнені за рішенням власника: M2 login/access control, optional external public IP, persistent history, administration, додаткові mounts. Connections не мають PID mapping; services не мають вигаданих ports/health; routes використовують polling fallback.
- Під час першої перевірки попередньої збірки до reboot спостерігався cumulative max Event Loop delay близько 9043 ms; причина не встановлена. На фінальній збірці після reboot це не відтворилося. Це додаткова причина не видавати короткий development test за production гарантію.
- Серверні provider-denial/journal-rotation faults не створювалися шляхом зміни ОС; failure/stale/timeout/cursor поведінка перевірена контрольованими fixtures. Примусового crash і аварійного rollback на робочому сервері не було.
- Системні journal retention rules не змінювалися. RSS виміряно в короткому multi-client сценарії; довготривалий memory leak/повний 15-minute soak цим не доведені. Capacity history перевірена bounded fake-clock fixtures.
- Наступний окремий запит: Angular implementation за MONITORING_CONTRACTS.md. Відкладені UI-only пункти не позначені виконаними за backend evidence.

## 20. Cleanup API та серверних тимчасових файлів — 2026-11-26

- За запитом власника перевірено імпорти всіх source files, npm scripts/dependencies, deployment tools і посилання в документації. Source-файлів, недосяжних із server/tests, не виявлено; типи й regression tests не є runtime-сміттям.
- Прибрано виконану одноразову WS migration (`deployment/update-nginx-ws.sh`), одноразовий fingerprint tool (`deployment/runtime-manifest.mjs`) і дубльовані snapshots `runtime-manifest.json`, `release-and-service.txt`, `lan.json`. Підсумковий серверний JSON-звіт також згодом видалено за прямим запитом власника; §19 зберігає лише текстовий підсумок перевірки.
- Потрібні operational sources залишено й пояснено в README: routine deploy/rollback, current Nginx snippet, systemd unit, fresh-install setup, повторювані Linux і LAN checks. Вони не мають запускатися разом із кожним API request.
- Прибрано невикористані imports, незастосовувані config keys, зайві controller re-exports і дубльоване створення host provider у server composition. TypeScript noUnusedLocals/noUnusedParameters увімкнені для наступних змін. API-контракти й формули збережено.
- Під deployment lock перевірено realpath, власника та відсутність symlinks і видалено лише створені цією роботою `/home/dvor/nodexora/.deploy.K4TJlH` та `/home/dvor/nodexora/nginx-ws-20261126`. У /tmp інших nodexora-залишків користувача dvor не знайдено. Runtime, installed unit, чинний Nginx і recovery backups не є тимчасовими файлами й не видалялися.
- Після серверного cleanup unit залишився active, health через Nginx повернув status=ok. Новий deploy/restart для локального cleanup не виконувався; §19 описує раніше перевірену deployed збірку, а не нові performance виміри.
- MONITORING_PLAN.md збережено: у M11 лишається відкрита frontend-only перевірка реального Angular UI. MONITORING_CONTRACTS.md збережено як чинний опис WS v1, shared samples та Angular handoff, яких не містить OpenAPI.
- Після cleanup успішні format/format:check, build, check із noUnusedLocals/noUnusedParameters і всі 40/40 regression tests. Збережені verify-server.mjs та verify-lan.mjs пройшли node --check. Додаткових тестів структури файлів або нового deploy для цієї чистки не створювалося.

## 21. Організація deployment — 2026-11-26

- За запитом власника operational files згруповано в `deployment/update`, `deployment/setup` та `deployment/checks`; призначення кожного файла й команди наведені простою українською в `deployment/README.md`.
- Оновлено пошук API root і шлях до власного activation script у deploy.sh, документаційні посилання й recursive LF rules у .gitattributes. Script і Nginx snippet залишені разом у setup, як вимагає first-install setup.
- Це локальна зміна структури deployment files; application API, runtime-папка Debian і встановлені service/Nginx не змінюються. Deploy чи server setup у цій задачі не запускалися.
- Перевірено Bash syntax і --help, визначення API root самим перенесеним скриптом із примусовою зупинкою перед npm ci (без install/build/SSH/deploy), LF attributes, Node syntax, format:check, build/check і всі 40/40 наявних тестів. Застарілих посилань на попередні шляхи шести перенесених файлів не виявлено.

## 22. Локальний Prettier та читабельність API — 2026-11-26

- Збережено наявний локальний Prettier 3.10.1; конфігурацію доповнено явними semicolons/bracket spacing, додано API-local EditorConfig. Format/check тепер також охоплюють deployment/checks/*.mjs; LF attributes поширені на .mjs. Глобальні налаштування й apps/web не змінювалися.
- Функції, методи та логічні блоки відділені порожніми рядками. Схемні скорочення o/s/nn замінено зрозумілими objectSchema/stringSchema/nullableNumberSchema; intervalFor використовує прості if branches із тими самими інтервалами. Формули, contracts, джерела та authority не змінено.
- Після кожної логічної групи змін усі 40/40 наявних тестів пройшли. Фінальні format:check, build, type check та Node syntax checks успішні. Порожні рядки є convention написання: Prettier їх зберігає, але не додає автоматично.
- Ця робота виконується локально; серверних підключень, deploy чи нових Linux/performance вимірів не було.
- Виявлено й виправлено ignore rule, що приховував source-модуль src/modules/logs від Git/Prettier: до наявних API-local .gitignore правил додано лише виняток для цього каталогу. Усі 65 source files тепер потрапляють у commit.
- Повний згенерований OpenAPI для 20 HTTP paths порівняно через deep equality зі source-знімком попереднього commit, завантаженим лише з Git: контракт не змінився. Тимчасовий каталог порівняння видалено після перевірки.
