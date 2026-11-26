# Як користуватися deployment

Тут три папки за призначенням:

```text
deployment/
├── update/                 # Оновити API на сервері
│   └── deploy.sh
├── setup/                  # Налаштувати новий сервер
│   ├── apply-nginx.sh
│   ├── nginx-api.conf
│   └── nodexora-api.service
└── checks/                 # Перевірити API без розгортання
    ├── verify-lan.mjs
    └── verify-server.mjs
```

## Оновлення API — update

**[deploy.sh](update/deploy.sh)** — основна команда для звичайної роботи.
Перевіряє типи й тести, збирає API, передає його на Debian, перезапускає
`nodexora-api.service` і перевіряє відповіді. При помилці активації намагається
повернути попередню версію. Nginx не змінює; під час заміни API є коротка перерва.

Запускай **на Windows у Git Bash**, з кореня проєкту:

```bash
cd /d/code/node_xora
bash apps/api/deployment/update/deploy.sh
```

Ціль за замовчуванням — `dvor@192.168.1.33`, SSH-ключ —
`~/.ssh/id_ed25519_hermes_server`. На сервері вже мають працювати API service,
lingering та Nginx. Довідка без розгортання:

```bash
bash apps/api/deployment/update/deploy.sh --help
```

## Початкове налаштування — setup

На нашому сервері це вже виконано. Файли залишені для налаштування нового
сервера або відновлення після перевстановлення. Для звичайного deploy вони не потрібні.

**[apply-nginx.sh](setup/apply-nginx.sh)** — підключає API до Nginx на новому
сервері: створює резервну копію, встановлює snippet, перевіряє конфігурацію та
перезавантажує її. При помилці перевірки/reload відновлює попередню конфігурацію.
Відмовляється перезаписувати вже встановлений snippet або backup.

Скопіюй `apply-nginx.sh` і `nginx-api.conf` **разом в одну setup-папку на Debian**.
Перебуваючи в ній, запусти:

```bash
sudo bash apply-nginx.sh
```

Це налаштування поточної схеми Nginx з `sites-available/default`, а не універсальний
інсталятор. Фінальний health check очікує вже запущений API. Інший сервер потребує
перевірки LAN-адреси й allowlist перед застосуванням.

**[nginx-api.conf](setup/nginx-api.conf)** — конфігурація HTTP та WebSocket proxy
з обмеженням доступу LAN. Її не запускають: `apply-nginx.sh` встановлює цей файл
у `/etc/nginx/snippets/nodexora-api.conf`, після чого його читає Nginx.

**[nodexora-api.service](setup/nodexora-api.service)** — конфігурація systemd:
де лежить API, яким Node.js його запускати та коли перезапускати після помилки.
Її також не запускають як скрипт.

На **новому Debian**, під звичайним користувачем API, перебуваючи в setup-папці:

```bash
mkdir -p ~/.config/systemd/user
cp nodexora-api.service ~/.config/systemd/user/nodexora-api.service
systemd-analyze --user verify ~/.config/systemd/user/nodexora-api.service
systemctl --user daemon-reload
systemctl --user enable --now nodexora-api.service
```

Перед цим мають існувати `~/nodexora/api/dist/server.js` і `~/.local/bin/node`.
Інший ручний процес API має бути зупинений. Для запуску після boot без входу
потрібний `Linger=yes`; на нашому сервері він уже ввімкнений.

## Перевірки — checks

Ці скрипти перевіряють API, але не розгортають його й не змінюють конфігурацію.
Вони створюють короткі тестові HTTP/WS-з'єднання до вже запущеного сервера.

**[verify-lan.mjs](checks/verify-lan.mjs)** — перевірка з твого комп'ютера:
Swagger, HTTP endpoints, WebSocket handshake, Linux snapshot і live update.
Працює з поточною адресою `192.168.1.33`.

Запускай **локально через Node.js**, з кореня проєкту:

```bash
node apps/api/deployment/checks/verify-lan.mjs
```

Локальні залежності `apps/api` мають бути встановлені через `npm ci`.

**[verify-server.mjs](checks/verify-server.mjs)** — докладна перевірка на Debian:
порівнює показники API з Linux-джерелами та системними інструментами, перевіряє
історію і три WebSocket-клієнти протягом 35 секунд. Перевіряє погоджені для цього
сервера development-орієнтири: RSS до 200 MiB, середня затримка Event Loop до 50 ms.
Результат друкує як JSON. Потребує доступних Linux tools і непорожніх login sessions.

Запускай **із Git Bash локально**, з кореня проєкту. SSH виконає файл на сервері
без встановлення скрипта в runtime-папку:

```bash
ssh -i ~/.ssh/id_ed25519_hermes_server dvor@192.168.1.33 \
  'cd /home/dvor/nodexora/api && /home/dvor/.local/bin/node --input-type=module' \
  < apps/api/deployment/checks/verify-server.mjs
```

Для звичайного оновлення обирай **update**, для нового сервера — **setup**,
для перевірки доступності й показників — **checks**.
