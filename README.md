# AI Sana Challenge Hub

Русскоязычный MVP для МНВО и AI Sana. Организации создают образовательные задачи, AI помогает уточнить описание и оценить готовность, а студенческие команды находят опубликованные проекты и отправляют отклики.

## Структура

```text
backend/    Express API, AI-интеграция, хранилище и тесты
frontend/   React + TypeScript веб-интерфейс
```

## Быстрый запуск

Требуется Node.js 20 или новее. Откройте два терминала.

Backend:

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

Добавьте реальный AI-ключ в `backend/.env`:

```env
PORT=3000
AI_API_KEY=ваш_ключ
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Frontend:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend откроется на `http://localhost:5173`, backend — на `http://localhost:3000`. Переменная `VITE_API_URL` уже указывает на локальный backend. Для демонстрации интерфейса без сервера можно временно установить `VITE_USE_MOCK_API=true`.

## Что реализовано

- создание и редактирование черновика бизнес-задачи;
- генерация уточняющих вопросов через OpenAI-compatible AI API;
- сохранение ответов и повторная AI-обработка;
- формирование структурированной карточки проекта;
- рейтинг готовности от 0 до 100 с объяснением;
- статусы `draft`, `needs_clarification`, `ready`, `published`, `archived`;
- публикация только после подтверждения бизнеса;
- публичный каталог с поиском и фильтрами;
- отправка и обработка откликов студенческих команд;
- статусы отклика `submitted`, `reviewed`, `accepted`, `rejected`;
- русскоязычный адаптивный интерфейс, валидация и обработка ошибок;
- JSON-хранилище для MVP и интеграционные тесты API.

## Основной сценарий

```text
Черновик → вопросы AI → ответы бизнеса → карточка и рейтинг
    → подтверждение публикации → каталог → отклик команды → выбор команды
```

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/tasks` | Создать черновик |
| `GET` | `/api/tasks` | Получить опубликованные задачи |
| `GET` | `/api/tasks?status=all` | Получить все задачи для личного раздела |
| `GET` | `/api/tasks/:id` | Получить задачу |
| `PATCH` | `/api/tasks/:id` | Изменить черновик |
| `POST` | `/api/tasks/:id/clarify` | Сгенерировать вопросы через AI |
| `POST` | `/api/tasks/:id/answers` | Сохранить ответы бизнеса |
| `POST` | `/api/tasks/:id/generate` | Сформировать карточку и рейтинг |
| `POST` | `/api/tasks/:id/publish` | Опубликовать задачу; тело `{ "confirm": true }` |
| `POST` | `/api/tasks/:id/archive` | Архивировать задачу |
| `POST` | `/api/tasks/:id/applications` | Отправить отклик |
| `GET` | `/api/tasks/:id/applications` | Получить отклики |
| `PATCH` | `/api/applications/:id` | Изменить статус отклика |
| `GET` | `/health` | Проверить доступность backend |

Фильтры каталога: `status`, `skill`, `technology`, `deadlineBefore`. Без параметра `status` backend возвращает только опубликованные задачи — черновики не попадают в публичный каталог.

## Контракт данных

API использует `camelCase`. Пример создания задачи:

```json
{
  "title": "AI-помощник для студентов",
  "shortDescription": "Нужно ускорить поиск ответов по учебному процессу.",
  "organization": "AI Sana Lab",
  "contactPerson": "Айдана",
  "desiredResult": "Рабочий веб-прототип",
  "availableData": "Обезличенные вопросы студентов",
  "constraints": "Не передавать персональные данные",
  "deadline": "8 недель",
  "skills": ["NLP", "UX"],
  "technologies": ["React", "Node.js"]
}
```

Пример отклика:

```json
{
  "teamName": "Sana Team",
  "members": ["Алия — frontend", "Данияр — backend"],
  "solutionDescription": "Создадим прототип с поиском по базе знаний.",
  "technologies": ["React", "Node.js"],
  "contact": "team@example.com",
  "comment": "Готовы показать первый прототип через неделю."
}
```

## Проверка

```powershell
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

AI API вызывается только backend-сервисом. `AI_API_KEY` не передаётся во frontend, ответы или логи и не должен попадать в Git.
