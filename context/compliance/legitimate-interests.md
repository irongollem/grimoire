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

**The objection record.** The two email purposes rely on being genuinely stoppable, so a
request to stop has to outlive the person who received it. Whatever form that
record takes, it holds an email address indefinitely for the sole purpose of
never using it again — which is lawful and expected, and is the one case where
keeping data *is* the way to honour the objection. See the matching row in
`retention.md`.

## 4. Not yet documented

The privacy policy also claims legitimate interest for **abuse prevention and
security**, **automatic error reporting**, **AI usage logging for pricing
calibration**, and **acting on bug reports and feature requests**. Each is
defensible and none is written down here yet. Tracked as a follow-up — the
reasoning belongs to whoever made those calls, not to a reconstruction after
the fact.
