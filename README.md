# Sail Maeva Telegram MVP

MVP принимает `business_message` из Telegram Business, сохраняет входящее сообщение в SQLite и решает, можно ли ответить клиенту автоматически. amoCRM в текущем этапе не используется.

## Как Работает

1. Telegram присылает webhook на `POST /telegram/webhook`.
2. Сервер сохраняет пользователя, диалог и сообщение в SQLite.
3. Если нет `business_connection_id` в production, бот ничего не отвечает клиенту.
4. Если user_id не входит в allowlist, сообщение только сохраняется.
5. Система выбирает режим с приоритетом: `scripted_auto_send`, `ai_auto_send`, `human_handoff`.
6. Если подходит готовый скрипт, бот ждёт 45-140 секунд и отправляет один вариант ответа через `business_connection_id`.
7. Если скрипт не подходит, подключается AI.
8. Если тема близка к продаже, бот молчит и уведомляет ассистента с причиной передачи.

## Режимы

- `scripted_auto_send` - готовый скриптовый ответ в стиле Маши.
- `ai_auto_send` - AI-ответ, который прошёл confidence, safety checker и forbidden phrases.
- `human_handoff` - бот молчит и уведомляет ассистента.

Черновиков ассистентке нет: ассистент получает только причину передачи.

## Что Всегда Передаётся Человеку

Бот не отвечает клиенту автоматически, если сообщение связано с бронью, оплатой, реквизитами, договором, чеком, встречей, созвоном, точным наличием мест, точной ценой, конфликтом, жалобой или возвратом.

## Env

```env
PORT=3000
DATABASE_PATH=./data/sail-maeva.sqlite
ALLOW_NON_BUSINESS_MESSAGES=false

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
PUBLIC_WEBHOOK_URL=
ALLOWED_TELEGRAM_USER_IDS=

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.vsellm.ru/v1
OPENAI_MODEL=openai/gpt-4.1-mini
SCRIPTED_AUTO_SEND_ENABLED=true
AI_RESPONSES_ENABLED=true
AI_AUTO_SEND_ENABLED=true
HUMAN_HANDOFF_ON_SALES=true
MIN_REPLY_DELAY_SECONDS=45
MAX_REPLY_DELAY_SECONDS=140
AUTO_SEND_CONFIDENCE_THRESHOLD=0.82
HUMAN_HANDOFF_CONFIDENCE_THRESHOLD=0.55

ASSISTANT_TELEGRAM_CHAT_ID=
MANAGER_TELEGRAM_CHAT_ID=
```

Для VseLLM используйте API key из кабинета VseLLM как `OPENAI_API_KEY`.

## База Знаний

```text
src/ai/knowledge/maeva_style_guide.md       - стиль Маши
src/ai/knowledge/scripted_responses.json    - готовые автоответы по интентам
src/ai/knowledge/response_examples.json     - примеры решений
src/ai/knowledge/faq_knowledge.json         - FAQ и факты
src/ai/knowledge/handoff_rules.json         - правила передачи человеку
src/ai/knowledge/forbidden_phrases.json     - запрещённые фразы
src/ai/knowledge/eval_cases.json            - тестовые кейсы качества
```

Проверить JSON:

```bash
npm run knowledge:validate
```

## Telegram Business

- `business_message` - реальная переписка от Telegram Business-аккаунта.
- `message` - обычное сообщение боту, только для локальных тестов или обычного бота.
- В production бот отвечает клиенту только при наличии `business_connection_id`.

Webhook:

```bash
npm run telegram:set-webhook
```

## Запуск

```bash
npm install
npm run dev
```

Проверка:

```bash
curl http://localhost:3000/health
npm test
npm run knowledge:validate
```

## Безопасный Первый Тест

Укажите свой Telegram user_id:

```env
ALLOWED_TELEGRAM_USER_IDS=123456789
```

Если список заполнен, бот отвечает только этим user_id. Остальные сообщения сохраняются в SQLite без автоответа.

Тестовые сообщения:

```text
Мне страшно ехать одной
```

Ожидаемо: `scripted_auto_send`, ответ клиенту через 45-140 секунд.

```text
Хочу забронировать место, как оплатить?
```

Ожидаемо: `human_handoff`, клиенту ничего не отправляется, ассистент получает причину передачи.
