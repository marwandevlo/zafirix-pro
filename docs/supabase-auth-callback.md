# Supabase Auth — Email confirmation & redirect

## Files added/updated

- `app/auth/callback/route.ts` — verifies `token_hash` / exchanges PKCE `code`, sets cookies, redirects to `/dashboard`
- `utils/supabase/server.ts` — App Router cookie-aware server client
- `app/dashboard/page.tsx` — post-auth landing (redirects to `/`)
- Middleware allows `/auth/*` as public so confirmation is not bounced to `/landing`

---

## Supabase Dashboard → Authentication → URL Configuration

**Site URL** (production example):

```text
https://YOUR_PRODUCTION_DOMAIN
```

Local:

```text
http://localhost:3000
```

**Redirect URLs** (add all that apply):

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/dashboard
https://YOUR_PRODUCTION_DOMAIN/auth/callback
https://YOUR_PRODUCTION_DOMAIN/auth/callback?next=/dashboard
https://*.vercel.app/auth/callback
```

Also keep any existing reset-password URLs, e.g.:

```text
http://localhost:3000/reset-password
https://YOUR_PRODUCTION_DOMAIN/reset-password
```

---

## Email template — Confirm signup

Supabase Dashboard → **Authentication** → **Email Templates** → **Confirm signup**

**Subject:**

```text
Confirmez votre compte ZAFIRIX PRO
```

**Body (HTML):**

```html
<h2>Bienvenue sur ZAFIRIX PRO</h2>
<p>Confirmez votre adresse e-mail pour activer votre compte.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">
    Confirmer mon e-mail
  </a>
</p>
<p>Si le bouton ne fonctionne pas, copiez ce lien :</p>
<p>{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard</p>
```

> Use `{{ .SiteURL }}` (not a hardcoded domain) so local and production follow the Site URL setting.
> Prefer `token_hash` + `type=signup` over `{{ .ConfirmationURL }}` so the link hits your App Router callback instead of Supabase’s default page (which often causes a blank/loop redirect).

---

## Flow

1. User signs up → Supabase sends confirm email with `/auth/callback?token_hash=…&type=signup`
2. Callback runs `verifyOtp`, writes session cookies
3. Redirect → `/dashboard` → app home `/`
4. Middleware then applies profile gates (`pending` → `/pending-approval`, etc.)
