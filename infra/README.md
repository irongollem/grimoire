# Asset infrastructure — Cloudflare CDN + R2 (#577)

Everything asset bytes touch outside Supabase lives here: the Worker that serves
`cdn.dungeongrimoire.com`, its `wrangler.toml`, and this runbook.

## The contract, in one place

Three facts. Anything reading or writing an asset — the browser, an edge
function, the copy script, and eventually the Go service in #578 — must agree on
all three, and nothing else about the storage layer matters.

| | |
| --- | --- |
| Public URL | `https://cdn.dungeongrimoire.com/<bucket>/<path>` |
| R2 object key | `<bucket>/<path>` — the URL's pathname, minus the leading slash |
| R2 bucket | one bucket, `grimoire-assets`, for every storage bucket |

The URL and the key are the same string on purpose. That identity is why moving
a bucket's bytes to R2 rewrites zero rows in the database, and it is the single
thing not to break.

Encoded in code at:

- `assetCdnUrl` / `publicAssetUrl` — `supabase/functions/_shared/cdn-buckets.ts`
- `r2ObjectKey` / `R2_BUCKET_IDS` — `supabase/functions/_shared/r2/config.ts`
- the Worker's key derivation — `grimoire-cdn-worker.js`

## Why a Worker rather than a proxied CNAME

A proxied CNAME at `<ref>.supabase.co` returns Cloudflare error 1014 ("CNAME
Cross-User Banned"): Supabase Storage is itself behind Cloudflare, on Supabase's
account, and no plan tier lets one customer orange-cloud into another's zone. The
Origin Rule `host_header` override that would otherwise fix routing is a paid-plan
entitlement. A Worker's outbound `fetch()` is neither, so it is the only path —
and it is also where the dual-read lives.

## Deploying the Worker

```bash
cd infra
wrangler deploy
```

The route and DNS record already exist on the zone; redeploying does not touch
them. If the `ASSETS` R2 binding does not resolve, the Worker serves everything
from Supabase Storage — deploying ahead of the bucket is a no-op, not an outage.

---

## Stage 2 runbook — moving a bucket's bytes to R2

Everything below needs Cloudflare credentials. **Every registry bucket is
R2-listed** (`R2_BUCKET_IDS` is derived from the write policy), so once the
secrets in step 2 exist, all new uploads land in R2; steps 1–2 are a one-time
setup, and step 3 moves the historical bytes at your pace.

### 1. Create the bucket and credentials (once)

**First, activate R2 on the account** — dashboard → **R2 Object Storage →
Enable R2**. This is a one-time product opt-in that requires accepting the R2
terms and a payment method on file, free tier or not, and it cannot be done over
the API. Until it is done, every R2 call fails with

```text
10042  Please enable R2 through the Cloudflare Dashboard.
```

which looks like a permissions problem and is not one. (A genuine permissions
failure reads `10000 Authentication error` instead — the two are easy to
confuse, and only one of them is fixed by editing the API token.)

Then:

```bash
wrangler r2 bucket create grimoire-assets
```

Then in the Cloudflare dashboard, **R2 → Manage API tokens → Create token**:

- Permissions: **Object Read & Write**
- Scope: the `grimoire-assets` bucket only

Note the Access Key ID and Secret Access Key — the secret is shown once.

**Create one token, not one per consumer.** Supabase Edge Functions need it now;
the Go service in #578 will need the same credential later, and a per-consumer
token means rotating N secrets instead of one.

**R2 has no object versioning.** Do not go looking for it: `PutBucketVersioning`
answers `501 NotImplemented`, and there is no REST route for it either. An
earlier draft of this runbook said to enable it, which was simply wrong.

That matters, because the gap it was meant to close is real: Supabase's daily
backups cover Postgres only, so bucket contents have never been backed up
anywhere, and moving them to R2 does not by itself change that. R2's actual
protection mechanism is **bucket locks** — retention rules that refuse deletion
or overwrite of matching objects for a set period:

```bash
# Inspect current rules (empty by default)
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/r2/buckets/grimoire-assets/lock"
```

A lock is worth adding **only after** the migration has settled — during the copy
window the ability to delete and re-copy an object is exactly what you want, and
a retention rule would take it away. Revisit it with #617, which is where the
Supabase originals (the current, real rollback) are finally released.

### 2. Configure the environments

Order matters, for the same reason it did in stage 1.

**a. Supabase secrets** (edge functions — `uploadWithRetry`, `r2-sign-upload`,
`r2-delete`):

```bash
supabase secrets set \
  R2_ACCOUNT_ID=<account id> \
  R2_BUCKET=grimoire-assets \
  R2_ACCESS_KEY_ID=<key id> \
  R2_SECRET_ACCESS_KEY=<secret>
```

`ASSET_CDN_URL` is already set from stage 1. If it were ever unset, every R2 path
would fall back to Supabase Storage rather than write bytes no URL points at —
that fallback is deliberate, but it means a missing CDN var silently disables
stage 2 rather than breaking it.

**b. The Worker binding**: already declared in `wrangler.toml`. Redeploy so it
takes effect:

```bash
cd infra && wrangler deploy
```

**c. R2 CORS**, so the browser may PUT to a presigned URL. Without this every
client upload to an R2-backed bucket fails at the preflight:

```bash
wrangler r2 bucket cors put grimoire-assets --rules '[{
  "allowed": {
    "origins": ["https://app.dungeongrimoire.com", "http://localhost:5173"],
    "methods": ["PUT"],
    "headers": ["content-type"]
  },
  "maxAgeSeconds": 3600
}]'
```

`content-type` must be allowed: `image/webp` is not a CORS-safelisted value, so
the PUT is preflighted. `content-length` is set by the browser itself and cannot
be listed.

**d. Local `.env.local`**, only if you intend to run the copy script — see
`.env.example` for the four `R2_*` names.

### 3. Copy the historical bytes

**The write flip has already happened, in code.** Every bucket is listed in
`R2_BUCKET_IDS`, so from the moment step 2 is done, new uploads land in R2. That
needed no copy first: the Worker's dual-read means objects written *before* the
flip keep resolving from Supabase Storage indefinitely, with no rewritten rows.

What remains is moving the historical objects — which is what actually stops
paying Supabase egress on the long tail (the reason stage 2 exists at all; see
the costing comment on #577). It is operational, not a deploy, and can be run at
any time after step 2, one bucket at a time:

```bash
npm run r2:copy -- --bucket <id> --dry-run        # what would move
npm run r2:copy -- --bucket <id>                  # move it (resumable, re-runnable)
npm run r2:copy -- --bucket <id> --verify         # exits non-zero if anything differs
npm run r2:copy -- --bucket <id> --verify --deep  # additionally SHA-256-compares both copies
```

Plain `--verify` compares byte length only, which a same-size corruption would
pass; `--deep` downloads both copies of every size-matched object and compares
hashes. Use `--deep` at least once per bucket before trusting it for #617's
deletion decision — it is the gate between "the copy ran" and "the copy is
provably byte-identical".

Safe against a live bucket: the Worker serves from either store, so a half-copied
bucket is not a broken bucket, and nothing is deleted from Supabase. Re-run after
a verify failure — it skips everything already present at the same size, so a
second pass only catches writes that landed during the first.

`mini-models` holds only the admin-seeded `bases/` plinths. Note that
`npm run ingest-mini-bases` writes to **Supabase Storage only** (it uploads via a
raw REST call, not the R2-aware path), so re-running it does NOT seat the bases
in R2 — copy them like any other bucket:

```bash
npm run r2:copy -- --bucket mini-models
```

Until that runs, the bases keep serving through the Worker's Supabase fallback,
which is invisible today but becomes a 404 the day the fallback retires (#617) —
so do it with the other buckets, not "eventually".

Suggested order — smallest and least painful to re-do first, so any surprise
surfaces cheaply: `sound-images`, `pantheon-emblems`, `loot-images`, then the
remaining image buckets, then `sounds` (the largest, ~180 MB).

### 4. Do NOT delete the Supabase copies

Not as a final step of this runbook, not "once verify is clean". Nothing in
stage 2 deletes a single byte from Supabase Storage, and that is deliberate.

The Supabase copy is the only rollback this migration has. While it exists, a
mistake anywhere — a bad key derivation, a Worker misconfiguration, a copy that
silently truncated — is repaired by turning the R2 path off and letting the
dual-read serve the originals again. Delete the copies and every one of those
mistakes becomes permanent, in a bucket that has never had a backup.

So the deletion is its own story, run **weeks** after the fact, once the new path
has demonstrably held in production. Tracked separately; do not fold it back into
this runbook. Retiring the Worker's `serveFromOrigin` fallback belongs to the
same story and for the same reason — until then it is what serves every object
that has not been copied yet.

### Verifying by hand

**First, check what you are actually resolving.** The zone moved from Vercel's
nameservers to Cloudflare's on 5 Aug 2026, and any machine that cached the old
record keeps hitting Vercel — which answers `404` with
`x-vercel-error: DEPLOYMENT_NOT_FOUND` and no `cf-ray` header. That looks exactly
like "the CDN is broken" and is nothing of the sort.

```bash
dig +short cdn.dungeongrimoire.com            # your resolver
dig +short cdn.dungeongrimoire.com @1.1.1.1   # the truth
```

Cloudflare answers are `104.21.x` / `172.67.x`; Vercel's are `64.29.17.x`. If
they disagree, flush and re-test:
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.

**If flushing does not fix it, the staleness is upstream, not on your machine.**
The zone's registry delegation carries a 48-hour TTL, and Vercel's nameservers
kept answering authoritatively for their old copy of the zone after the 5 Aug
2026 move — so an ISP resolver that cached the old delegation (KPN did) keeps
asking Vercel and serving its dead `64.29.17.x` answers until its cache expires.
Diagnose with `dig cdn.dungeongrimoire.com @ns1.vercel-dns.com` — if that still
answers, the old zone is the source. The bridge fix is to add `cdn` A records in
Vercel's own DNS pointing at this zone's Cloudflare anycast IPs (what
`dig @elsa.ns.cloudflare.com` returns): Cloudflare routes proxied traffic by
hostname, so answers from the stale zone then land on the right edge anyway.
Those records go inert once delegation expires everywhere.

**A `cf-ray` header on the response is the proof the Worker ran.** Pin the IP to
bypass a stale cache entirely:

```bash
CF=$(dig +short cdn.dungeongrimoire.com @1.1.1.1 | head -1)

# Full object — expect 200, cf-ray present, and our immutable Cache-Control.
curl -sI --resolve "cdn.dungeongrimoire.com:443:$CF" \
  https://cdn.dungeongrimoire.com/<bucket>/<path>

# Range requests must work, or the soundboard re-downloads every track in full.
curl -s -o /dev/null -w '%{http_code}\n' -r 0-99 \
  --resolve "cdn.dungeongrimoire.com:443:$CF" \
  https://cdn.dungeongrimoire.com/sounds/<path>   # expect 206
```

The Worker sets no header distinguishing an R2 hit from an origin fallback, so
to confirm a bucket is genuinely being served from R2, watch Supabase egress
fall, or check the R2 bucket's object count against the source bucket's.

### Failure modes worth recognising

| Symptom | Cause |
| --- | --- |
| Uploads work, images 404 | Bytes in R2, `ASSET_CDN_URL` unset — the URL points at the origin |
| `403 SignatureDoesNotMatch` on PUT | Body length differs from the signed `Content-Length`, or the URL expired (15 min) |
| Preflight failure on upload | R2 CORS missing the app origin or `content-type` |
| Everything falls back to Supabase | One of the four `R2_*` secrets missing — `r2ConfigFrom` returns null on a partial config, by design |
| `"<bucket>" is not served from R2` | Client asked to presign a bucket not in `R2_BUCKET_IDS` — `bug-reports` / `downtime-images` live outside the registry, so this is a correct refusal, not a bug |

Note the shape of the first and fourth rows: an upload that cannot reach R2 —
unconfigured, CORS wrong, network down, signature expired — **falls back to
Supabase Storage rather than failing** (see `R2UnavailableError` in
`src/lib/storage/r2.ts`). Only a 403 from `r2-sign-upload` is fatal, because that
is a real decision about the caller and Supabase's own policies would refuse it
too. So a misconfiguration here degrades to the previous behaviour with a console
warning; it does not break uploads. Check the browser console for
`[uploadToBucket]` / `[uploadToR2]` warnings before concluding R2 is working.

### Note for #578 (Go poller)

The Go service writes to `mini-models`, which is R2-backed. It needs the same
four `R2_*` values and must reproduce the contract at the top of this file:
SigV4 against `https://<account>.r2.cloudflarestorage.com`, region `auto`,
service `s3`, key `<bucket>/<path>`, and the public URL built from
`ASSET_CDN_URL`. `supabase/functions/_shared/r2/` is the reference
implementation — `sigv4.ts` in particular documents the two S3 deviations from
generic SigV4 (single path encoding, no normalisation) that a naive port gets
wrong.
