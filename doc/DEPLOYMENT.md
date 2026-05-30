# Deployment Plan — Raj Cable Manager (free of cost)

How to put this app online for **₹0**, and how to handle the **`.env`** file
safely. Written step-by-step for a beginner. Nothing here runs automatically —
follow it after approval.

**The stack & where each part lives (all free tiers):**

| Part | Hosted on | Cost |
|---|---|---|
| Frontend (this React/Vite app) | **Vercel** | Free (Hobby plan) |
| Database + Auth + Storage | **Supabase** (already set up) | Free tier |
| Code | **GitHub** (already pushed) | Free |

---

## 🚨 STEP 0 — Fix the leaking secret FIRST (do before anything else)

Right now `.env` is committed to GitHub and it contains a **database password**
that the app never uses. Two problems: the password is exposed, and `.gitignore`
isn't actually ignoring `.env`.

**0a. Rotate (change) the Supabase database password** — because it's already in
GitHub history, changing it is the only true fix.
- Supabase Dashboard → **Project Settings → Database → Reset database password**.
- Pick a new strong password and save it somewhere private (a password manager).
- The app does **not** use this password, so nothing in the app breaks.

**0b. Remove the password line from `.env`.** The app only needs these two:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Delete the `Db_password: ...` line entirely.

**0c. Make git actually ignore `.env`:**
- In `.gitignore`, change line `#.env` to `.env` (remove the `#`).
- Stop tracking the committed file (keeps your local copy):
  ```
  git rm --cached .env
  git commit -m "chore: stop tracking .env, ignore it"
  git push
  ```

**0d. Add a safe template** so teammates know what vars exist (no real values):
`.env.example`
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> Note: removing `.env` from the latest commit does **not** erase it from old
> history — that's why rotating the password in 0a is the part that actually
> protects you. (Fully scrubbing history is possible but not needed once the
> password is changed.)

---

## 🔑 Understanding the env variables (important)

- **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** are the only vars the
  app uses. They get **baked into the public JavaScript** at build time (any
  `VITE_*` var does). That's expected and **safe** — the anon key is *designed*
  to be public and is protected by Supabase **Row Level Security (RLS)**.
- A **database password / service-role key must NEVER** be a `VITE_` var or live
  in this repo — those would give full access. (We removed the password in Step 0.)
- On Vercel we set these two vars in the dashboard, so we don't rely on the
  committed `.env` at all.

---

## ✅ STEP 1 — Pre-deploy checklist (Supabase side)

Make sure the backend is ready (see `doc/MODULE_REFERENCE.md` for details):
- [ ] All migrations in `supabase/migrations/` have been run in the SQL Editor.
- [ ] Storage bucket **`product-images`** exists and is **Public**.
- [ ] Admin emails in `set_profile_on_signup()` are correct.

---

## 🧭 STEP 2 — Add SPA routing config (so refresh doesn't 404)

This app uses React Router. Without a rewrite, refreshing a page like
`/products/123` would 404 on the host. Add this file at the project root:

`vercel.json`
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
Commit and push it.

---

## 🚀 STEP 3 — Deploy on Vercel (free)

1. Go to **https://vercel.com** → **Sign up with GitHub** (free Hobby plan).
2. **Add New… → Project** → **Import** the `raj-cable-manager` GitHub repo.
3. Vercel auto-detects **Vite**. Confirm:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Expand **Environment Variables** and add the two:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon/publishable key |
   (Find both in Supabase → **Project Settings → API**.)
5. Click **Deploy**. After ~1–2 min you get a live URL like
   `https://raj-cable-manager.vercel.app`.

---

## 🔐 STEP 4 — Point Supabase Auth at the live site

So login, signup, and the password-reset link work on the real domain:
- Supabase → **Authentication → URL Configuration**:
  - **Site URL:** `https://<your-app>.vercel.app`
  - **Redirect URLs:** add `https://<your-app>.vercel.app/reset-password`
    (keep `http://localhost:5173/reset-password` too for local dev).
- **Authentication → Providers → Email:** decide if **"Confirm email"** is ON or
  OFF (our signup flow assumes a normal email/password sign-up; if confirmation
  is ON, new users must click the email link before an admin can approve them).

---

## 🌐 STEP 5 — (Optional) Custom domain

- The free `*.vercel.app` URL works forever.
- To use your own domain (e.g. `rajcable.in`): Vercel → Project → **Settings →
  Domains** → add it and follow the DNS steps. (Buying the domain costs money;
  Vercel hosting stays free.) Remember to add the custom domain to the Supabase
  redirect URLs too.

---

## 🔄 STEP 6 — Future updates (automatic)

Once connected, **every `git push` to `main` auto-deploys**. Workflow:
1. Make changes locally, test with `npm run dev`.
2. `git add -A && git commit -m "..."` → `git push`.
3. Vercel rebuilds and publishes in ~1–2 min.
> Tip: work on a branch and open a PR — Vercel gives each PR a **preview URL** to
> test before it goes live on `main`.

---

## 🧪 STEP 7 — Post-deploy smoke test (on your phone)

- [ ] Open the live URL on a mobile browser.
- [ ] Sign up a test user → confirm the admin-approval flow.
- [ ] Log in as admin; add a product (with a photo via camera).
- [ ] Add income (Cash + Online), check stock drops; delete it, check stock restores.
- [ ] Add a worker payment; confirm it appears in Expense.
- [ ] Try forgot-password → reset link opens `/reset-password`.

---

## 📊 Free-tier limits (plenty for one shop)

- **Vercel Hobby:** 100 GB bandwidth/month, unlimited deploys (non-commercial-ish;
  fine for a single business tool).
- **Supabase Free:** 500 MB database, 1 GB file storage, 50k monthly active users,
  pauses after ~1 week of zero activity (just open the app to wake it).
- If you ever outgrow these, both have low-cost paid tiers.

---

## Summary checklist

1. [ ] Rotate DB password, remove it from `.env`, fix `.gitignore`, untrack `.env`, add `.env.example`.
2. [ ] Verify Supabase migrations + storage bucket.
3. [ ] Add `vercel.json`, push.
4. [ ] Import repo on Vercel, set the 2 `VITE_` env vars, deploy.
5. [ ] Set Supabase Site URL + redirect URLs to the Vercel domain.
6. [ ] Smoke-test on phone.
