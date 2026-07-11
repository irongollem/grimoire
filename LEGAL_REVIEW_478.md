# Legal Review — Grimoire pre-launch legal pages

**Re:** GitHub issue [#478](https://github.com/irongollem/grimoire/issues/478) — lawyer-review pass on liability / consumer-withdrawal / transfer wording
**Documents reviewed:** `src/legal/terms.md`, `src/legal/privacy.md`, `src/legal/refunds.md`, plus the two Stripe checkout consent flows (`stripe-create-checkout`, `stripe-create-credit-checkout`)
**Reviewer perspective:** Dutch legal advisor (B2C SaaS, EU/NL focus)
**Date:** 28 June 2026

> **Status of this review.** This is a substantive advisory review against Dutch (BW) and EU law, not a formal opinion from an advocaat admitted to the Nederlandse Orde van Advocaten. For a public launch with paid consumer subscriptions I'd still recommend a one-page sign-off from an admitted lawyer or a consumer-law specialist — but the issues below are the ones that sign-off would focus on, and most are fixable in-house. The drafting is genuinely good for a solo/small operator: the structure, plain-language tone, sub-processor table, retention basis and the recorded clickwrap are all above the baseline I usually see. The gaps are concentrated and concrete.

> **Update — 28 June 2026: most fixes now applied in-page.** The document-level items (R1, R2, R5, R6, R7, R8, R9, R10, R12) have been edited into `terms.md`, `privacy.md` and `refunds.md`. What remains is **three checkout code/behaviour items (R3, R4, R11)** plus **two operational pre-conditions (the KvK registration and the office address going live)**. See the **Status tracker and "What's left" in §4**. Section 3 retains the original recommended wording for reference.

---

## 1. Overall verdict

The three documents are **launch-viable after a focused set of fixes**, not before. None of the problems require a rewrite. Two of them (the liability cap against consumers, and the missing international-transfer basis) are the kind a regulator or a disputing consumer would actually reach for, so they should block go-live. The rest are hardening.

The single most important structural point: **across all three documents, mandatory Dutch/EU consumer-protection law overrides whatever the contract says.** A choice of Dutch law and a liability cap do not survive contact with the consumer "black list" (art. 6:236 BW) or Rome I art. 6. So the safest drafting move everywhere is to _state the limit, then expressly preserve the consumer's mandatory rights_. Do that consistently and most of the residual risk evaporates.

---

## 2. Risk assessment

| #   | Finding                                                                        | Document                    | Severity        | Why it matters                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------ | --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Liability cap + blanket exclusions with no consumer carve-out                  | ToS §10                     | **High**        | Clauses excluding/limiting liability against a consumer risk being void under the art. 6:236/6:237 BW black & grey lists; you cannot exclude liability for intent/conscious recklessness, death or personal injury. As written, the whole clause is vulnerable.                                            |
| R2  | No international data-transfer safeguard disclosed                             | Privacy §4                  | **High**        | OpenAI, Anthropic, Google, fal.ai (and Stripe US) are US transfers under GDPR Ch. V. The policy lists them but names no transfer mechanism (DPF certification / SCCs). Required disclosure under art. 13(1)(f) GDPR and a substantive compliance gap.                                                      |
| R3  | Withdrawal waiver bundled into the general ToS-acceptance checkbox             | Checkout flows + Refunds §4 | **Medium-High** | Art. 6:230p(1)(d) BW needs a _separate, specific_ express consent + acknowledgement, not a waiver folded into "I agree to the Terms." If you can't prove it cleanly you lose the waiver — and chargeback disputes.                                                                                         |
| R4  | No durable-medium order confirmation of the consent/acknowledgement            | Checkout flows              | **Medium**      | Art. 6:230v(7) BW requires confirmation of the contract on a durable medium _including_ the recorded express consent + acknowledgement. Need to confirm a post-purchase email carries this.                                                                                                                |
| R5  | Subscription "no partial refund" wording vs. statutory withdrawal pro-rata     | Refunds §2 vs §4            | **Medium**      | A consumer who withdraws within the 14-day window after expressly starting a service owes only a pro-rata amount (art. 6:230s BW) and is entitled to the rest back. §2's flat "no partial refunds" is saved by §4 but the tension should be removed so §2 can't be read as overriding the statutory right. |
| R6  | Forum clause forces NL courts on all users                                     | ToS §11                     | **Medium**      | Under Brussels I-bis, an EU consumer can only be sued in their own domicile and may sue there too. A blanket "disputes go to NL courts" is unenforceable against consumers and is itself a grey-list term.                                                                                                 |
| R7  | Choice of Dutch law with no mandatory-rights preservation                      | ToS §11                     | **Medium**      | Rome I art. 6: choosing Dutch law cannot deprive a consumer of the mandatory protections of their home country. Add the standard carve-out.                                                                                                                                                                |
| R8  | Missing statutory trader-identity details                                      | All three                   | **Medium**      | Art. 3:15d BW + consumer info duties (art. 6:230m BW) require geographic address, KvK number and VAT number. Currently only "CroCode BV, NL, email" is given.                                                                                                                                              |
| R9  | "Continued use = acceptance" of changed terms                                  | ToS §12                     | **Low-Medium**  | Fine for minor changes; for material changes to a paid consumer contract, pair it with an explicit right to terminate before the change takes effect.                                                                                                                                                      |
| R10 | Price-change clause lacks notice period + cancellation right                   | ToS §6                      | **Low-Medium**  | A unilateral price-change right is grey-list-sensitive. Specify the notice period and the right to cancel without penalty before it applies.                                                                                                                                                               |
| R11 | No model withdrawal form / "order with obligation to pay" button check         | Checkout                    | **Low**         | Art. 6:230v(3) BW button-labelling and the model withdrawal form (Annex I) are formal distance-selling duties. Verify Stripe's button label and either include the model form or a plain link.                                                                                                             |
| R12 | Privacy policy omits "right to withdraw consent" and controller postal address | Privacy §6, §1              | **Low**         | Minor completeness items under art. 13 GDPR.                                                                                                                                                                                                                                                               |

---

## 3. Detailed findings and recommended wording

### Terms of Service

**§10 Limitation of liability (R1) — the priority fix.** The current clause excludes data loss outright, excludes all indirect/consequential damages, and caps total liability at 12 months' fees. Against a _consumer_, Dutch law does not allow this in unqualified form. Add a carve-out immediately after the cap, e.g.:

> _Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, for intent or conscious recklessness (opzet of bewuste roekeloosheid), or for any liability that cannot be excluded or limited under mandatory law, including your mandatory rights as a consumer. Where you are a consumer, the limitations in this section apply only to the extent permitted by mandatory Dutch consumer law._

Keep the cap and the exclusions for B2B/non-consumer use — they're reasonable there. The carve-out is what makes the clause survive against consumers instead of being struck in full.

**§11 Governing law & forum (R6, R7).** Keep Dutch law and NL courts as the default, but append:

> _If you are a consumer resident in the EU, this choice of law does not deprive you of the protection of mandatory provisions of the law of your country of residence, and you may bring proceedings in, and may only be sued in, the courts of your country of residence._

**§6 Subscriptions & price changes (R10).** Replace "reasonable notice" with a concrete period and an exit right: _"We will give you at least 30 days' notice of any price increase. If you do not accept it, you may cancel before it takes effect and will not be charged the new price."_

**§12 Changes to terms (R9).** Add: for material changes, the same 30-day notice + right to cancel before the change applies, rather than relying solely on continued use as acceptance. (Signup is already recorded clickwrap per #472 — good; this closes the equivalent gap for _ongoing_ changes.)

**Trader identity (R8).** In the header/§13, add CroCode BV's registered office address, KvK number and VAT (BTW) number. This is a hard information duty, not a nicety.

The AI disclaimer (§5), notice-and-takedown (§7), and BYOK/local-key wording are well done and need no change.

### Privacy Policy

**§4 International transfers (R2) — the priority fix.** Add a row or short paragraph stating the Chapter V basis for each US recipient. Concretely: verify whether OpenAI, Anthropic, Google and fal.ai (and Stripe for its US processing) are **certified under the EU–U.S. Data Privacy Framework**; for any that are, transfers ride on the Commission's adequacy decision; for any that are not, you must rely on the **EU Standard Contractual Clauses** (and ideally note a transfer impact assessment). Then add wording like:

> _Some of our sub-processors are located in the United States. Where they are certified under the EU–U.S. Data Privacy Framework we rely on the European Commission's adequacy decision; otherwise we rely on the European Commission's Standard Contractual Clauses. You may request a copy of the relevant safeguards by emailing us._

Note the DPF's adequacy decision (10 July 2023) survived the _Latombe_ challenge in the General Court (Sept 2025) but an appeal is pending at the CJEU as of 2026 — so don't rely on DPF alone where SCCs are easy to have as a fallback.

**§6 Your rights (R12).** Add the **right to withdraw consent** (and note it doesn't affect prior processing) and the right not to be subject to solely-automated decisions if relevant. Add CroCode BV's postal address to §1/§10.

Retention (§5, 7-year payment records — correct under art. 52 AWR), the legitimate-interest basis table, the children-under-16 line (correct NL digital-consent age), and the "no tracking cookies" disclosure are all sound.

### Refund & Cancellation Policy

**§2 vs §4 (R5).** §2 says no partial refunds for the unused portion once a period starts; §4 correctly preserves withdrawal for the not-yet-supplied part. Remove the tension by qualifying §2: _"except for your statutory right of withdrawal (see §4), under which you are refunded for any part of the period not yet supplied."_ As written, a consumer reading only §2 could be misled, which itself is a fairness risk.

**Credits (§3).** The treatment is _more_ generous than the law requires (refundable until actually used), which is safe and consumer-friendly — keep it.

### Checkout consent flows (the mechanism behind the waiver)

The implementation uses Stripe `consent_collection: { terms_of_service: "required" }` plus a `custom_text` message that states the express request + acknowledgement. Two refinements:

- **R3 — unbundle the acknowledgement.** Right now the immediate-performance request and the withdrawal-loss acknowledgement are merged into the _same_ mandatory checkbox as general ToS acceptance. Art. 6:230p(1)(d) BW wants the express consent and the acknowledgement to be _specific and unambiguous_. Stripe's single ToS checkbox is defensible (it's unticked by default and Stripe timestamps it), but the cleaner, more defensible pattern is a **separate, dedicated checkbox** for "I request immediate performance and accept that I lose my 14-day withdrawal right once the service is supplied / the credits are used," distinct from "I agree to the Terms." If Stripe's hosted checkout can't host a second checkbox, capture this consent on your own pricing page before redirecting, and store the consent text + version + timestamp server-side (you already store `terms_accepted_at`/`terms_version` for signup — mirror that here).
- **R4 — durable-medium confirmation.** Ensure the post-purchase email (or invoice) repeats the recorded express consent + acknowledgement text. Art. 6:230v(7) BW requires the confirmation on a durable medium to include it. If the Stripe receipt doesn't, add it to your own confirmation email.
- **R11** — verify the checkout button reads as a payment obligation ("Subscribe"/"Pay" is fine; an ambiguous "Continue" is not), and link the model withdrawal form.

---

## 4. Status tracker & what's left

### Status of each finding (as of 28 June 2026)

| #   | Finding                                             | Status                                                                                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1  | Liability consumer carve-out (ToS §10)              | ✅ Done — carve-out added                                                                         |
| R2  | International-transfer basis (Privacy §4)           | ⚠️ Wording added — **verify DPF/SCC status per provider**                                         |
| R3  | Unbundle withdrawal consent at checkout             | ⛔ Open — code change                                                                             |
| R4  | Durable-medium order confirmation                   | ⛔ Open — verify confirmation email                                                               |
| R5  | Refunds §2/§4 reconciliation                        | ✅ Done                                                                                           |
| R6  | Consumer forum clause (ToS §11)                     | ✅ Done                                                                                           |
| R7  | Mandatory-rights preservation (ToS §11)             | ✅ Done                                                                                           |
| R8  | Trader-identity details (all three)                 | ⚠️ Text added (KvK 76933067, BTW NL860845011B01, Koraalrood 54F) — **see operational note below** |
| R9  | Term-change cancellation right (ToS §12)            | ✅ Done                                                                                           |
| R10 | Price-change notice + exit right (ToS §6)           | ✅ Done                                                                                           |
| R11 | Withdrawal form + button-label check (checkout)     | ⛔ Open — verify/add                                                                              |
| R12 | Consent-withdrawal right + address (Privacy §6/§10) | ✅ Done                                                                                           |

### Still to do before launch

**Code / checkout behaviour (the only substantive open items):**

1. **R3 — separate the withdrawal consent.** Today the immediate-performance request + withdrawal-loss acknowledgement ride on the single Stripe ToS checkbox. Give it its own dedicated, specifically-worded, unticked checkbox and store its text + version + timestamp server-side (mirror the existing `terms_accepted_at` / `terms_version` pattern from signup, per #472). Most defensible fix under art. 6:230p(1)(d) BW.
2. **R4 — durable-medium confirmation.** Confirm the post-purchase email (or Stripe receipt) repeats the recorded express-consent + acknowledgement text. If it doesn't, add it to your own confirmation email (art. 6:230v(7) BW).
3. **R11 — checkout formalities.** Verify the checkout button reads as a payment obligation ("Subscribe"/"Pay", not an ambiguous "Continue") and link the EU model withdrawal form.

**Verification (text is in place, fact needs confirming):** 4. **R2 — provider transfer status.** Confirm which of OpenAI, Anthropic, Google, fal.ai and Stripe(-US) are EU–U.S. Data Privacy Framework certified; for any that aren't, ensure SCCs are actually in place. The policy wording already covers both bases, but the underlying mechanism must exist.

### Operational pre-conditions (R8 — company & address)

The trader-identity block now states **CroCode BV · Koraalrood 54F, 2718 SC Zoetermeer · KvK 76933067 · BTW NL860845011B01**, on the working assumption that this is the formal address. Two things must be true by go-live for that to hold:

- **Address discrepancy — to confirm.** The Koraalrood 54F office is only in effect from October 2026 and is **not yet the registered KvK establishment address**. The stated address must match CroCode BV's actual registered establishment at the moment a consumer contracts. Action: register/update the KvK vestigingsadres to Koraalrood 54F when the office is live, and either launch on/after that point or temporarily show the current registered address until then. Also re-check the postcode (2718 SC vs 2718 SB on that street) against the lease/KvK.
- **KvK registration must be live.** The information duties (art. 3:15d / 6:230m BW) assume a registered trader. Close the KvK-registration gap before taking paid consumer sign-ups.

### Mapping to issue #478

The items #478 flagged for lawyer review — liability (#471 ToS), consumer-withdrawal (#473 refunds + checkout), and transfer wording (#470 privacy) — are now addressed in the document text. The residual lawyer sign-off should be narrow: (a) the R3 checkout-consent mechanism, and (b) confirming the provider DPF/SCC position. Everything else is drafting that's now in place.

---

_This memo is advisory and does not constitute formal legal advice or create an attorney–client relationship. Confirm provider DPF/SCC status, close the KvK-registration and registered-address points, and have an admitted Dutch lawyer or consumer-law specialist sign off the final liability and withdrawal wording before public launch._
