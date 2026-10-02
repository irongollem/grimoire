# Bot check on the auth forms: Cloudflare Turnstile

Sign-up is open, so the three calls anyone can make without an account (sign
in, sign up, request a password reset) are where a script would start: mass
account creation, password guessing, and reset emails sent to addresses that
never asked. Supabase Auth can refuse all three unless the request carries a
token from a CAPTCHA provider. This app uses Cloudflare Turnstile for that.

Turnstile has no picture puzzles. In its Managed mode it checks the browser in
the background and most visitors never see it; the worst case is a single
"Verify you are human" checkbox. `CaptchaGate` asks for the `interaction-only`
appearance, so the widget takes up no room in the form unless that checkbox is
needed.

## What is in the code

| Piece | Where |
| --- | --- |
| The widget, and `take()` which hands out one token per auth call | `src/components/auth/CaptchaGate.vue` |
| Script loader, error copy, `captchaSource()` | `src/lib/auth/captcha.ts` |
| The three store actions, each taking a required `CaptchaSource` | `src/stores/auth.ts` (`signIn`, `signUp`, `requestPasswordReset`) |
| The four forms | `src/views/auth/` `LoginView`, `SignupView`, `JoinCampaignView` (both tabs), `ForgotPasswordView` |

The protection is project-wide in Supabase: once it is on, **every** call to
those three endpoints needs a token. That is why the store actions take the
source as a required argument. A new auth form that forgets its `CaptchaGate`
does not compile, where an optional argument would have compiled, passed every
local test (the local auth server checks nothing) and failed only in
production.

Not covered, because Supabase does not route them through the check: token
refresh (so nobody who is already signed in is affected), `updateUser`, and
anything an edge function does with the service role (`child-account`
creating a young player's account).

## Switching it on

**Order matters.** The site key ships first and Supabase is switched on
second. The other way round, every sign-in is refused until the next deploy.

1. **Create the widget.** Cloudflare dashboard, Turnstile, Add widget. Mode
   **Managed**. Hostnames: `app.dungeongrimoire.com`, plus `localhost` if
   `npm run dev:hosted` should keep being able to sign in.
2. **Site key to Vercel.** `VITE_TURNSTILE_SITE_KEY`, Production environment,
   then deploy. It is public and ships in the bundle.
3. **Check the token travels.** On the live site, open devtools, sign in, and
   look at the `token?grant_type=password` request: its body has
   `gotrue_meta_security.captcha_token`. Supabase ignores it for now.
4. **Wait for old tabs to update.** The app is a PWA, so a browser can still be
   running a bundle from before step 2, and that bundle sends no token. People
   already signed in are not affected. Someone signing in from a stale bundle
   would be refused. A day or two is enough.
5. **Secret key to Supabase.** Dashboard, Authentication, Attack Protection,
   "Enable CAPTCHA protection", provider Turnstile, paste the secret key.
6. **Check straight away,** in a private window: a wrong password and then the
   right one (the second attempt needs a second token), a password reset, and
   a sign-up. Do it once as an ordinary account and once as the admin.

**To undo:** switch the toggle off in Supabase. It takes effect at once and
needs no deploy.

Vercel preview deployments: with the key set only for Production, a preview
build sends no token and cannot sign in to a project that has the protection
on. Setting the key for Preview as well means adding `vercel.app` to the
widget's hostnames, because preview URLs are not subdomains of anything
narrower.

## Looking at it locally

Nothing renders without `VITE_TURNSTILE_SITE_KEY`, which is every ordinary
local run. Cloudflare publishes test keys that work on any hostname:

```bash
# always passes, invisibly: what nearly every visitor gets
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run dev
# always asks for the click: the only way to see the widget's layout
VITE_TURNSTILE_SITE_KEY=3x00000000000000000000FF npm run dev
```

The local auth server has no CAPTCHA configured, so it accepts the sign-in
whatever the token is. That is deliberate: switching it on locally would make
every local sign-in, including `dev:auth` and `dev:demo`, depend on reaching
Cloudflare.

## Two things that went wrong while building it

- **The template ref must not share a name with a setup variable.** The forms
  first had `<CaptchaGate ref="captcha">` next to
  `const captcha = captchaSource(useTemplateRef("captcha"))`. Vue binds a
  template ref to a same-named setup variable, found a function there, and
  warned that it "will not work in the production build". It signed in fine on
  the dev server and passed every unit test. `captcha.test.ts` now reads the
  forms' source and fails on the collision.
- **Turnstile's full-width widget has a 300px minimum**, and the auth card's
  content box is 262px on a 360px phone. `CaptchaGate` measures the form and
  asks for the compact widget below 300px.

## Privacy

The check runs in the visitor's browser against `challenges.cloudflare.com`,
so Cloudflare sees the IP address and browser signals of everyone who opens an
auth form. See section 4 of `context/compliance/legitimate-interests.md`.
