# Privacy Policy

**Grimoire** is operated by CroCode BV (info@dungeongrimoire.com), a private limited company registered in the Netherlands.  
**Last updated:** June 2026

---

## 1. Who we are

Grimoire is a campaign management tool for tabletop role-playing games, available at **dungeongrimoire.com**. When this policy says "we", "us", or "our", it refers to CroCode BV.

---

## 2. What data we collect

### Account data
When you create an account we collect your **email address** and an optional **display name** (username). Your password is hashed by our authentication provider and is never stored in plain text.

### Campaign content
Everything you create inside Grimoire — campaigns, NPCs, monsters, notes, encounters, calendar events, locations, items, spells, and other content — is stored and associated with your account.

### AI feature data
If you use the AI generation features:

- **Bring Your Own Key (BYOK) — server-stored:** Your API key (OpenAI, Anthropic, Google, or fal.ai) is stored **encrypted at rest** (AES-256-GCM) in our database. The key is decrypted server-side only at the moment of a generation request and is never sent to your browser in plain text.
- **Platform-key mode:** If you do not supply your own key, AI generations use Grimoire's own provider keys and are charged against your account's credit balance. Your prompts (and any reference images you provide) are sent to the relevant AI provider listed below to fulfil the request.
- **Bring Your Own Key (BYOK) — local-only mode:** If you opt into local-only key storage in Campaign Settings, your API key is stored only in your browser — the encryption key is a non-extractable key held in IndexedDB and the encrypted API key is held in local storage — and is **never transmitted to or stored by CroCode BV**. In this mode all AI generation happens directly between your browser and the AI provider — our servers are not involved. You can verify this via your browser's network inspector.
- **Usage logs:** Each AI generation is logged with the model name, provider, approximate token counts, and estimated cost. These logs are used solely for service improvement and pricing calibration. No AI-generated content is sent to third parties beyond the AI provider used for the request.

### Payment data
If you purchase AI credits, payments are processed by **Stripe**. We receive a payment confirmation and a customer reference; we never see or store your full card number or bank details.

### Technical data
Standard server and client logs may include your IP address, browser type, and timestamps for security and diagnostic purposes. We use a session cookie to keep you logged in; no advertising or tracking cookies are used. If you connect optional integrations, the relevant tokens are stored in your browser's local storage — Spotify access/refresh tokens (if you link Spotify for music playback) and your encrypted local-only API key (if you enable that mode).

---

## 3. Why we process your data

| Purpose | Legal basis |
|---|---|
| Providing and operating the service | Contract performance |
| Sending email confirmations and security notices | Contract performance |
| Preventing abuse and ensuring security | Legitimate interest |
| AI usage logging for pricing calibration | Legitimate interest |
| Processing payments | Contract performance |

We do not use your data for advertising, sell it to third parties, or use it to train AI models.

---

## 4. Who we share data with

We use the following sub-processors:

| Provider | Purpose | Location |
|---|---|---|
| **Supabase** | Database, authentication, file storage, Edge Functions | EU (AWS eu-west-1) |
| **Stripe** | Payment processing | EU / US |
| **OpenAI** | AI text and image generation (BYOK or Grimoire platform key) | US |
| **Anthropic** | AI text generation (BYOK or Grimoire platform key) | US |
| **Google** | AI text and audio generation (BYOK or Grimoire platform key) | US |
| **fal.ai** | AI image generation (BYOK or Grimoire platform key) | US |
| **Freesound** | Sound-effect search and previews (your search terms are sent to find matching sounds) | EU |
| **Spotify** | Optional music-playback integration you connect via your own Spotify account (OAuth) | EU / US |

AI providers receive the prompts you generate (and any reference images you provide); in BYOK mode they also receive the API key you supplied. They are subject to their own privacy policies.

**Local-only key mode:** If you use local-only key storage, your API key and generation requests go directly from your browser to the AI provider. CroCode BV never sees your key or acts as an intermediary for the request itself — only anonymised usage metadata (model name, token counts) is logged.

---

## 5. Data retention

Your data is retained for as long as your account is active. When you delete your account, your personal data and campaign content are deleted within 30 days, except where retention is required by law (e.g. payment records, which are kept for 7 years per Dutch accounting requirements).

---

## 6. Your rights (GDPR)

As a resident of the EU/EEA you have the right to:

- **Access** the personal data we hold about you
- **Rectify** inaccurate data
- **Erase** your data ("right to be forgotten")
- **Restrict** processing in certain circumstances
- **Portability** — receive your data in a machine-readable format
- **Object** to processing based on legitimate interest
- **Lodge a complaint** with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens): [autoriteitpersoonsgegevens.nl](https://www.autoriteitpersoonsgegevens.nl)

To exercise any of these rights, contact us at **info@dungeongrimoire.com**.

---

## 7. Security

We use industry-standard measures including encrypted data at rest, TLS in transit, row-level security policies on all database tables, and AES-256-GCM encryption for stored API keys. No method of transmission or storage is 100% secure; in the event of a breach we will notify you as required by GDPR.

---

## 8. Children

Grimoire is not directed at children under 16. We do not knowingly collect data from children. If you believe a child has provided personal data, contact us and we will delete it.

---

## 9. Changes to this policy

We may update this policy as the service evolves. We will notify you of material changes by email or in-app notice. The date at the top of this page reflects the last revision.

---

## 10. Contact

**CroCode BV**  
info@dungeongrimoire.com

For privacy enquiries or to exercise your data rights, email us with the subject line **"Privacy Request"**.
