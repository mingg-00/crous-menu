# Crous Menu

Daily menus of French university restaurants (Crous), translated into English and Korean, with lunch reviews.
Built for international students in Bordeaux; web first, then iOS/Android from the same Expo codebase.

- **App** (`app/`): Expo / React Native + Expo Router, TypeScript. Runs on web, iOS and Android.
- **API** (`backend/`): FastAPI, PostgreSQL (Alembic migrations), Supabase Auth (JWT verified against JWKS).
- **Menus**: [CROUStillant API](https://www.data.gouv.fr/dataservices/api-croustillant), cached per process.
- **Translation**: LLM batches in menu order, cached per line and language, run in background tasks.
  Model and prompt were chosen with an eval on real menus: see [`backend/eval/REPORT.md`](backend/eval/REPORT.md).
- **Moderation**: comment filtering (OpenAI moderation), reporting, blocking, in-app account deletion.

## Run locally

```bash
docker compose up -d db                      # Postgres on :5434
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8100 --env-file .env   # needs OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
.venv/bin/python -m pytest                   # uses the crous_test database (createdb -U crous crous_test)

cd ../app && npm install && npx expo start   # app/.env.local: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Deployment: `render.yaml` (API on Render), web build with `npx expo export --platform web` (Cloudflare Pages).
