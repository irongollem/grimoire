# Legitimate Interests — Register

The balancing test behind every purpose the privacy policy claims under GDPR
Art. 6(1)(f). Companion to `context/compliance/retention.md` (how long we keep
things) and `data-subject-rights.md` (what happens when someone asks).

**Why this file exists.** Legitimate interest is the only lawful basis that
requires *us* to have done the reasoning. Consent is evidenced by the user's
click and contract by the contract; LI is evidenced by nothing at all unless it
is written down. Art. 5(2) makes us accountable for demonstrating it, and
"we thought about it at the time" is not a demonstration. A basis asserted in
the public policy with no test behind it is the same failure mode retention.md
describes: it looks decided and is not.

Each entry answers three questions — the **purpose** (what interest is being
pursued), the **necessity** (why nothing less intrusive achieves it), and the
**balance** (why it does not override the person's rights). Positions are dated
because they can be revisited.

**The register is complete as of 14 Aug 2026**: the privacy policy's §3 table
claims legitimate interest seven times, and there are seven entries below. That
is the invariant to preserve — a new legitimate-interest row in the policy
without an entry here puts us back where #732 found us, asserting a basis with
no test behind it. Add the entry in the same change as the policy row, not
afterwards.

## 1. Contacting a user about a fault that affected their account

*Decided 14 Aug 2026, alongside the #727 fix.*

- **Purpose.** Telling someone that a specific defect hit their account, and
  what was done about it. The trigger case: a lost session rendered a fully
  empty app rather than an error, so an affected user could only conclude that
  Grimoire does not work. They cannot report what they cannot see, and we found
  it in our own logs rather than from a report.
- **Necessity.** There is no in-app route to a user who has stopped opening the
  app, which is precisely the population affected by a fault that makes the app
  look broken. A status page or release note reaches people already engaged.
  Email is the only channel that reaches the person the defect drove away.
- **Balance.** This is what a reasonable user expects: being told when something
  broke on their account is closer to a service obligation than an intrusion,
  and its whole content is an admission against our own interest. It is narrow
  (only users the fault demonstrably touched), it carries nothing commercial,
  and it is easy to stop. The data used is the account email already held under
  contract — nothing new is collected and nothing is shared. **Not overridden.**

## 2. Asking a user about their experience of the service

*Decided 14 Aug 2026.*

- **Purpose.** Asking someone who tried Grimoire, and particularly someone who
  stopped, what their experience was — so the product can be fixed by evidence
  rather than by guessing.
- **Necessity.** In-app prompts and analytics only reach people who are still
  here, and aggregate analytics at this scale is close to useless — a handful of
  accounts supports no funnel and no cohort. The people whose opinion carries
  the most information are exactly the ones no in-product mechanism can reach.
  Asking them directly is the least intrusive method that works, and it is one
  message rather than an ongoing programme.
- **Balance.** The weight here is real but small: an unexpected email is a minor
  intrusion, and the person did not ask to be asked. Against that, the message
  is individual rather than bulk, carries no offer, promotion or upgrade pitch,
  contains no tracking pixel, comes from a human address, and stops permanently
  on a one-line reply. **Not overridden — but only while those conditions hold.**
  Adding a product pitch, a tracking pixel, or bulk-sending tooling turns this
  into direct marketing, at which point Art. 6(1)(f) is no longer the question
  and ePrivacy consent is (Telecommunicatiewet 11.7 for us as a Dutch sender;
  PECR reg. 22 and UCA Art. 3(1)(o) for UK and Swiss recipients). The
  soft-opt-in exemptions in all three are built around an existing *sale*, so
  they do not cover users who have never paid.

**The objection record.** The two email purposes above rely on being genuinely
stoppable, so a request to stop has to outlive the person who received it.
Whatever form that record takes, it holds an email address indefinitely for the
sole purpose of never using it again — which is lawful and expected, and is the
one case where keeping data *is* the way to honour the objection. See the
matching row in `retention.md`.

## 3. Cookieless visitor statistics

*Decided 14 Aug 2026, issue #645.*

- **Purpose.** Knowing how many people reach the app, which screens they open,
  and on what kind of device — so that decisions about what to fix are made on
  evidence rather than guesswork. The immediate question it exists to answer:
  new accounts appear to arrive on phones and leave, and nothing in the product
  could confirm or refute that.
- **Necessity.** The alternatives are all *more* intrusive, not less. A product
  analytics suite with funnels and session replay would answer the question in
  more detail while storing an identifier on the device, profiling across
  visits, and recording what is on screen — screens which here hold the user's
  own campaign writing. Server logs, the other option, hold full IP addresses.
  Cookieless aggregate counting is the weakest tool that answers the question,
  and it was chosen *because* it is the weakest.
- **Balance.** Nothing is stored on the device, so ePrivacy Art. 5(3) does not
  engage and there is nothing for the user to consent to or refuse; no profile
  is built, no identifier persists between visits, and no advertising network is
  involved. URLs are reduced to their route shape in the browser before sending,
  so neither the ids of a user's own content nor anything they typed into a
  search box reaches the processor — the same reduction #644 applies to Sentry.
  What remains is aggregate and anonymous. **Not overridden.** The condition
  this depends on is the absence of storage and identity: adding cookies,
  persistent visitor ids, session replay, or a join to account identity would
  make this a different processing operation needing its own analysis, and
  almost certainly consent.

## 4. Preventing abuse and ensuring security

*Written 14 Aug 2026, issue #732. The controls predate it; the reasoning did not.*

- **Purpose.** Bounding what a single account can spend or trigger in a burst.
  The gates stand in front of things that cost real money or real credibility:
  paid AI provider calls, outbound email to a whole party, an issue-writing
  GitHub token, and the account export — which is the app's most expensive
  single read and, on a stolen session, the fastest route to a whole account in
  one file.
- **Necessity.** Two datasets, both minimal. `rate_limit_events` holds
  `user_id, action, created_at` and nothing else, for 25 hours — barely longer
  than the longest window it enforces (`data_export`, one hour).
  `abuse_guard_trips` holds a spend figure, a window figure and an account age,
  for 180 days. **No IP address, no user-agent and no device fingerprint is
  captured anywhere in the app**, which matters because those are what an abuse
  system normally reaches for first. The account id is already known under the
  contract, so this creates no new identifier and builds no new profile; there
  is no less-intrusive way to count a per-account rate than to count it per
  account.
- **Balance.** Users expect a service to have fraud and burst controls, and the
  data is a counter rather than a behaviour record — what was done, not what was
  written. Retention is short enough that the events cannot become a history.
  The one place a security control could collide with a data-subject right is
  handled explicitly at the source: the `data_export` budget is documented in
  `supabase/functions/_shared/rate-limit.ts` as generous enough that a real
  person never notices and tight enough to stop a bulk-read loop, on the
  principle that **a denied request costs the subject a wait, never the right**
  — Art. 12(3) allows a month; the limit resets in an hour. **Not overridden.**
- **Current state, so this is not read as more than it is.** The velocity guard
  is configured off (`abuse_guard_config.enabled = false`, `enforce = false`) and
  ships that way deliberately per #467, pending real usage data to tune
  thresholds. Today the live processing is the rate limiter alone.
  `disposable_email_domains` is a list of domains and holds no personal data.

## 5. Automatic error reporting

*Written 14 Aug 2026, issue #732. Design shipped with #644.*

- **Purpose.** Knowing that the app broke, where, and for how many people,
  without waiting to be told.
- **Necessity.** Waiting to be told demonstrably does not work. The session
  fault in #727 left a real user looking at an empty app for 35 minutes; it was
  never reported, and was found in server logs days later. The account id in
  particular earns its place: it is what distinguishes "one person hit this"
  from "everyone is hitting this", which changes the response entirely. It is an
  internal identifier that means nothing without our database.
- **Balance.** The scrubbing *is* the balance, and it is two independent layers
  on the assumption that the first one failed. At collection,
  `dataCollection` in `src/lib/observability/sentry.ts` switches off user info,
  cookies, request and response headers, HTTP bodies, URL query parameters,
  GraphQL documents and variables, gen-AI inputs and outputs, database query
  data, and stack-frame variables — the last because a generator's frame holds
  the whole prompt. Then `_shared/observability/scrub.ts` walks the entire event
  and redacts every surviving string: email addresses, JWTs (one is a working
  session), auth headers, uuids and provider key shapes, bounded at 4096
  characters. It is deny-by-key rather than an allowlist precisely so that a
  field added by a future SDK version arrives already filtered. No session
  replay, no tracing. **Not overridden** — and the condition is written at the
  source: that module's header states that widening its deny lists is a change
  to a published legal statement, not a tweak.

## 6. AI usage logging for pricing calibration

*Written 14 Aug 2026, issue #732. The entry where our interest is commercial
rather than protective, which is worth saying rather than glossing.*

- **Purpose.** Knowing what a generation actually cost, so that the credit price
  can be set against real provider costs instead of a guess.
- **What this covers, and what it does not.** Calibration is served by
  *metering*, not by content: `ai_credit_ledger` rows carry model, provider,
  token counts, image count and a BYOK flag, and **no prompt text at all**.
  Those columns already exist to charge the user under the contract, so the
  calibration use is a further use of data lawfully held for a compatible
  purpose in the same context (Art. 6(4)) rather than a fresh collection.
  Prompt text lives elsewhere — `ai_generation_jobs.request_json`,
  `image_generation_jobs.prompt` — for a different reason entirely, namely
  delivering and retrying the generation the user asked for, which is contract
  performance. It is cleared at 90 days by `scrub-stale-ai-prompt-content`. It
  is **not** the basis for calibration and must not quietly become it.
- **Necessity.** Credits sell at a fixed price against variable provider costs
  (roughly €0.0025 per credit at present). Without per-generation token counts
  there is no way to tell whether a price sits above or below cost, and the
  alternatives are to guess or to over-charge as insurance. Nothing less
  intrusive answers the question, because the question *is* what it cost.
- **Balance.** The interest here is ours and it is commercial, so it deserves
  the harder look. It survives because what is processed is metering rather than
  content, because it is already held to bill the same person, and because no
  profile is built and nothing is shared. **Not overridden** — with an honest
  operational limit: an Art. 21 objection to the *calibration* use could be
  honoured by excluding that account's rows from analysis without touching
  billing, since the same rows serve both. There is no mechanism for that today,
  and building one is worth doing when someone asks, not before.

## 7. Acting on bug reports and feature requests

*Written 14 Aug 2026, issue #732. Storage design shipped with #634.*

- **Purpose.** Being able to act on a report: to see what the reporter saw, and
  to go back to them if the report does not stand on its own.
- **Necessity.** A screenshot is the part that carries real risk, since a user
  photographs whatever was on screen, and it is accordingly the part with the
  shortest life — 90 days, against 365 for the row. Identity is needed because
  a bug report frequently cannot be reproduced without asking one more question.
- **Balance.** The person initiates this, so nothing about it is unexpected —
  though that initiating act is *not* consent, and calling it consent would be
  wrong: the text of a published issue cannot be un-published on withdrawal, and
  a fix would not be reverted because someone changed their mind. Legitimate
  interest with a voluntary trigger is the honest label. The minimization is the
  split: what the user wrote goes to the public repository, while their identity
  and screenshot stay in our database and the issue refers to them by number
  rather than by name. The policy warns, in terms, that the text reaches the
  open internet. **Not overridden.**
- **The failure this design already had.** #634 found the screenshots stored
  with no `{userId}/` prefix, so `delete-account` could never find them — a
  retention and erasure promise silently broken by a storage layout, not by a
  policy. Worth remembering when weighing any future "we only keep it briefly"
  claim: the claim is only as true as the mechanism that enforces it.
