# ComeraOS v1.0.0

Business operating system scaffold — Next.js + Supabase (free tier).

## Setup

```bash
cd web
cp .env.local.example .env.local
# Add your Supabase URL + anon key
npm install
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

The database schema lives in `supabase/migrations`. `supabase/schema-registry.json` maps every app page to the tables it uses. From `web/`, `npm run check:schema` fails when a page is missing that mapping or a mapped table has no `create table` in a migration.

From the repo root you can also run:

```bash
npm run dev
```
