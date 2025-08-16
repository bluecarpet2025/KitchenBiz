# Kitchen Biz – Project Snapshot

**Stack**
- Next.js 15 (App Router), TypeScript, Tailwind
- Supabase (Postgres + Auth)
- Vercel hosting & analytics

**Live**
- https://kitchenbiz.vercel.app

**Supabase**
- Project ref: `zdwenjdspvbfouooqlco`
- Auth: Email magic links  
  - **Site URL:** `https://kitchenbiz.vercel.app`  
  - **Redirect URLs:**  
    - `https://kitchenbiz.vercel.app`  
    - `https://kitchenbiz-*.vercel.app`  
    - `http://localhost:3000`  
    - `http://localhost:3000/app`
- OTP expiry warning in dashboard is OK for MVP; we can lower later.

**Environment (`.env.local`)**

NEXT_PUBLIC_SUPABASE_URL=https://zdwenjdspvbfouooqlco.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<<anon key>>


**Auth & Guards**
- **Middleware** protects only:
  - `/inventory/**`, `/recipes/**`, `/menu`, `/menu/prep`
- **Public routes:** `/`, `/login`, `/app/share/**`, `/share/**` (via rewrites) + static assets
- Cookie checked by middleware: `sb-zdwenjdspvbfouooqlco-auth-token*`
- Client `AuthGate`:
  - Parses magic-link hash → `supabase.auth.setSession(...)`
  - Writes small `kb_auth` cookie (UX; not used for auth)
  - Redirects anon users hitting protected pages to `/login?redirect=...`

**Routing**
- `/` – simple explainer + Sign in
- `/login` – magic link email form (works on prod and localhost)
- `/inventory` – aligned “Add item”, top-row `Import` button, inline price edits
- `/recipes` – list (View/Edit/Duplicate)
- `/recipes/new` – guided wizard
- `/recipes/[id]` – detail (per-serving costs)
- `/recipes/[id]/edit` – full editor
- `/menu` – builder: pick items, target% slider, rounding (.99/.95/.49/.00), Save / Load last / Save as new, Print, Share (public link)
- `/app/share/[token]` – **public, read-only** shared menu

**Rewrites (`next.config.ts`)**

async rewrites() {
return [
{ source: '/share/:token', destination: '/app/share/:token' },
{ source: '/menu/share/:token', destination: '/app/share/:token' },
];
}


**Database (key tables)**
- `inventory_items(id, name, base_unit, purchase_unit, pack_to_base_factor, last_price)`
- `recipes(id, name, portions/servings fields, yield_pct, ...)`
- `recipe_ingredients(recipe_id, item_id, qty, unit, sub_recipe_id?)`
- `menus(id, tenant_id, name, served_on)`
- `menu_recipes(menu_id, recipe_id, price, target_pct, rounding, manual)`
- `profiles(id, tenant_id)` (maps user → tenant)
- `menu_shares(id, tenant_id, menu_id, token text unique, payload jsonb not null, created_at)`
  - RLS: tenant can insert/update/delete own; **public can select by token**
  - Token built with `encode(hex(gen_random_bytes(16)))` (no extensions needed)

**Features done**
- Inventory CRUD + cost/base
- Recipe wizard + per-serving cost + edit
- Menu builder with suggested prices & rounding + Save/Load/Save-as + Print
- Public share link (works via rewrites)

**Common gotchas**
- Magic link bouncing to localhost → fix Supabase **Site URL** & **Redirect URLs**
- “Stuck on home” → clear cookies; ensure middleware only guards protected routes
- Shared link 404 → ensure rewrites exist (or use `/app/share/:token`)
- Next build “useSearchParams requires Suspense” → keep such pages as **client** components

**Deploy**
- Push to `main` → Vercel auto-deploys
- No server secrets in code
- Keep `rewrites()` in place

**Backlog (next)**
- **Prep sheet** (`/menu/prep`): quantities by portion count + print
- **CSV templates** + import wizards (inventory & recipes)
- Empty states, toasts, microcopy
- Roles/permissions (later)
- Vendors & purchase tracking (later)
