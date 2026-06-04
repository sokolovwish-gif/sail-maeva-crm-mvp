# Sail Maeva CRM MVP

MVP-сервер для одного рабочего сценария: клиент пишет в Telegram Business-аккаунт, сервер принимает `business_message`, сохраняет входящее сообщение, ставит отложенную AI-задачу на 45-120 секунд, затем либо отправляет ответ в стиле Маши, либо передаёт ассистенту.

Без сайта, админки и аналитики.

## Как работает

1. Telegram присылает webhook на `POST /telegram/webhook`.
2. Сервер принимает `business_message`.
3. В SQLite сохраняются пользователь, диалог, входящее сообщение и классификация.
4. Создаётся запись в очереди delayed responses.
5. Через 45-120 секунд AI анализирует сообщение и историю.
6. AI выбирает режим: `auto_send`, `draft_for_assistant` или `hold_for_human`.
7. Если безопасно, клиент получает ответ через `business_connection_id`.
8. Если нужен человек, ассистент получает уведомление и/или черновик в Telegram.

amoCRM в текущем AI-assisted этапе не используется.

## Telegram: что взять

Нужно:

- `TELEGRAM_BOT_TOKEN` - токен бота из BotFather.
- `TELEGRAM_WEBHOOK_SECRET` - любая секретная строка, которую вы сами задаёте.
- `PUBLIC_WEBHOOK_URL` - публичный HTTPS-адрес сервера.
- `ASSISTANT_TELEGRAM_CHAT_ID` - chat id служебного чата или ассистента.

Важно:

- `business_message` - реальная переписка от Telegram Business-аккаунта.
- `message` - обычное сообщение боту, только для локальных тестов или обычного бота.
- В продакшене сервер не отвечает клиенту, если нет `business_connection_id`.

Для локального теста обычных `message` можно включить:

```env
ALLOW_NON_BUSINESS_MESSAGES=true
```

Для живого Telegram Business оставьте:

```env
ALLOW_NON_BUSINESS_MESSAGES=false
```

Для безопасного первого запуска можно ограничить ответы одним или несколькими Telegram user_id:

```env
ALLOWED_TELEGRAM_USER_IDS=123456789
```

Если список заполнен, бот отвечает и ходит в amoCRM только по этим user_id. Остальные сообщения сохраняются в SQLite без автоответа и без amoCRM.

Как узнать свой Telegram user_id:

- напишите боту `@userinfobot` или `@getmyid_bot`;
- скопируйте значение `Id`;
- вставьте его в `ALLOWED_TELEGRAM_USER_IDS`;
- если тестируют несколько людей, укажите ID через запятую.

## AI-assisted ответы

Нужно добавить:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.vsellm.ru/v1
OPENAI_MODEL=openai/gpt-4.1-mini
AI_RESPONSES_ENABLED=true
AI_DRAFT_ONLY=true
AI_AUTO_SEND_ENABLED=false
AI_REPLY_DELAY_MIN_SECONDS=45
AI_REPLY_DELAY_MAX_SECONDS=120
MIN_REPLY_DELAY_SECONDS=45
MAX_REPLY_DELAY_SECONDS=140
AUTO_SEND_CONFIDENCE_THRESHOLD=0.82
HUMAN_HANDOFF_CONFIDENCE_THRESHOLD=0.55
```

Для VseLLM используйте API key из кабинета VseLLM как `OPENAI_API_KEY`.

Материалы стиля лежат здесь:

```text
src/ai/knowledge/maeva_style_guide.md
src/ai/knowledge/response_examples.json
```

Режимы решения:

- `auto_send` - AI сам отправляет клиенту ответ в стиле Маши.
- `draft_for_assistant` - AI готовит черновик и отправляет ассистенту.
- `hold_for_human` - AI не отвечает клиенту и передаёт ассистенту.

Защитные темы всегда уходят человеку:

- оплата;
- договор;
- реквизиты;
- конфликт;
- бронь/закрепление места.

### AI knowledge layer

Редактируемые материалы AI-слоя:

```text
src/ai/knowledge/maeva_style_guide.md       - стиль Маши
src/ai/knowledge/response_examples.json     - примеры ответов
src/ai/knowledge/faq_knowledge.json         - FAQ и факты
src/ai/knowledge/handoff_rules.json         - правила передачи человеку
src/ai/knowledge/forbidden_phrases.json     - запрещённые фразы
src/ai/knowledge/eval_cases.json            - тестовые кейсы качества
```

Проверить JSON-базу знаний:

```bash
npm run knowledge:validate
```

Безопасный стартовый режим, только черновики ассистентке:

```env
AI_RESPONSES_ENABLED=true
AI_DRAFT_ONLY=true
AI_AUTO_SEND_ENABLED=false
```

В этом режиме клиенту ничего не отправляется автоматически. Бот сохраняет входящее сообщение, AI выбирает intent/decision, пишет черновик и отправляет его ассистентке.

Технически автоответы готовы, но включать их нужно позже:

```env
AI_DRAFT_ONLY=false
AI_AUTO_SEND_ENABLED=true
```

Автоответ уйдёт только если `decision=auto_send`, риск `low`, уверенность выше `AUTO_SEND_CONFIDENCE_THRESHOLD` и не сработали forbidden/handoff правила.

## amoCRM: что взять

Обязательно:

- `AMO_BASE_URL` - адрес аккаунта, например `https://example.amocrm.ru`.
- `AMO_ACCESS_TOKEN` - access token интеграции.
- `AMO_REFRESH_TOKEN` - refresh token, нужен для дальнейшего обновления токенов.
- `AMO_PIPELINE_ID` - ID воронки "Яхтенные экспедиции".
- ID статусов:
  - `AMO_STATUS_NEW_ID`
  - `AMO_STATUS_BOT_REPLIED_ID`
  - `AMO_STATUS_CLARIFYING_ID`
  - `AMO_STATUS_INTEREST_ID`
  - `AMO_STATUS_HOT_ID`
  - `AMO_STATUS_ASSISTANT_ID`

Опционально, если хотите заполнять кастомные поля:

- `AMO_CONTACT_FIELD_TELEGRAM_USERNAME_ID`
- `AMO_CONTACT_FIELD_TELEGRAM_USER_ID`
- `AMO_LEAD_FIELD_DIRECTION_ID`
- `AMO_LEAD_FIELD_FEAR_ID`
- `AMO_LEAD_FIELD_INTEREST_LEVEL_ID`
- `AMO_LEAD_FIELD_OWNER_ID`

Если эти ID не указать, MVP всё равно сможет создавать контакт, сделку, примечание, статус и задачу. Поля просто не будут заполняться.

Проверить воронки и недостающие статусы можно командой:

```bash
npm run setup:amocrm
```

## Куда вставить ключи

Создайте файл `.env` рядом с `.env.example` и заполните значения:

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
AI_RESPONSES_ENABLED=true
AI_DRAFT_ONLY=true
AI_AUTO_SEND_ENABLED=false
AI_REPLY_DELAY_MIN_SECONDS=45
AI_REPLY_DELAY_MAX_SECONDS=120
MIN_REPLY_DELAY_SECONDS=45
MAX_REPLY_DELAY_SECONDS=140
AUTO_SEND_CONFIDENCE_THRESHOLD=0.82
HUMAN_HANDOFF_CONFIDENCE_THRESHOLD=0.55

AMO_BASE_URL=
AMO_ACCESS_TOKEN=
AMO_REFRESH_TOKEN=
AMO_PIPELINE_ID=
AMO_STATUS_NEW_ID=
AMO_STATUS_BOT_REPLIED_ID=
AMO_STATUS_CLARIFYING_ID=
AMO_STATUS_INTEREST_ID=
AMO_STATUS_HOT_ID=
AMO_STATUS_ASSISTANT_ID=

ASSISTANT_TELEGRAM_CHAT_ID=
```

## Как запустить

Установить зависимости:

```bash
npm install
```

Запустить сервер:

```bash
npm run dev
```

Проверить, что сервер жив:

```bash
curl http://localhost:3000/health
```

## Как развернуть в облаке

Проект подготовлен для облачного запуска через Node buildpack или Docker. Инструкция для первого живого теста лежит здесь:

```text
docs/DEPLOY.md
```

Главное: после деплоя вставьте публичный HTTPS-адрес сервиса в `PUBLIC_WEBHOOK_URL`, затем установите Telegram webhook.

## Как установить Telegram webhook

Когда сервер доступен по публичному HTTPS-адресу и заполнен `.env`:

```bash
npm run telegram:set-webhook
```

Команда установит webhook на:

```text
{PUBLIC_WEBHOOK_URL}/telegram/webhook
```

## Как проверить на одном живом сообщении

1. Узнайте свой Telegram user_id через `@userinfobot` или `@getmyid_bot`.
2. В `.env` укажите `ALLOWED_TELEGRAM_USER_IDS=ваш_id`.
3. Запустите сервер: `npm run dev`.
4. Установите webhook: `npm run telegram:set-webhook`.
5. Напишите в Telegram Business-аккаунт Маши тестовое сообщение:

```text
Привет, хочу забронировать место, как оплатить?
```

Ожидаемый результат:

- в SQLite появится входящее сообщение;
- в amoCRM появится или обновится контакт;
- в amoCRM появится или обновится сделка;
- в сделке появится примечание с текстом сообщения;
- статус сделки станет `Горячий лид`;
- в amoCRM появится задача `Связаться с горячим лидом`;
- клиент получит автоответ;
- ассистент получит уведомление в Telegram.

## Автоответы

Тексты автоответов лежат здесь:

```text
src/config/scripts.ts
```

Их можно редактировать без изменения логики.

## Тестовые JSON

Примеры входящих Telegram update лежат в `examples/`:

- `telegram-business-message.json`
- `telegram-message.json`
- `telegram-edited-business-message.json`

## Тесты

```bash
npm test
```
