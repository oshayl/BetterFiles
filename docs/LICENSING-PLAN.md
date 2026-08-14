# Onboarding & Licensing Plan

Gating the panel behind a one-time-per-machine activation key.

## Decisions (locked)

| Question | Decision |
|---|---|
| Validation model | **Online activation.** Key + machine ID posted to a license API; the seat limit is enforced server-side. |
| Issuer | **Supabase.** Edge functions over a `licenses` / `activations` schema. |
| Offline behaviour | **Hard block.** No reachable server means no panel. |
| Seat policy | **Self-serve deactivate** from the Settings dialog. |

The offline decision is the one with a support cost: a cold-starting edge
function or a studio firewall becomes a plugin that will not open. It is
therefore isolated in a single `OFFLINE_POLICY` constant
(§4.3) so switching to a cached-token grace period is a one-line change and not
a refactor.

## What this can and cannot do

The plugin ships as a readable JavaScript bundle inside a `.ccx`. Anyone
willing to unzip it can delete the gate. This design is not trying to stop
that, and no client-side design can. What it does is make the honest path the
easy path, put a real seat limit on casual key sharing, and give you the
ability to revoke a refunded or charged-back key. Calibrate the effort spent
here against that, not against an unbreakable outcome.

---

## Phase 0 — De-risk in the panel (blocking)

Nothing below is worth writing until these pass **inside Photoshop**. Per
`docs/UXP-CONSTRAINTS.md`, none of it can be verified on a build machine, and
the whole chosen model dies if the first check fails.

Add to `CHECKS` in `src/services/self-test.service.ts`:

| Check id | Asserts | If it fails |
|---|---|---|
| `network` | `fetch()` exists, reaches `https://<ref>.supabase.co/functions/v1/health`, returns 200 and parses as JSON. | Online activation is impossible. Fall back to an offline Ed25519-signed license, which needs a bundled pure-JS crypto implementation and a two-step "read your machine ID / paste a key back" UX. |
| `networkCors` | Same request with a non-trivial `Content-Type` (forces an OPTIONS preflight). | Edge functions need explicit CORS + OPTIONS handling; UXP's fetch is not exempt. |
| `randomness` | `crypto.getRandomValues` is present and fills a `Uint8Array`. | Machine ID falls back to a composite of timestamp, `Math.random()`, and host/platform strings. Not security-critical — the *server* owns the seat binding — but note it in the check's detail. |
| `hostIdentity` | Whatever `require('os')` exposes (`platform()`, `hostname()`, `arch()`) plus `uxp.host`. | Determines what `machineLabel` can contain (§4.1). A missing hostname degrades the rebind heuristic, nothing more. |

`src/utils/hashing.ts:4` already records "UXP has no WebCrypto guarantee" —
the `randomness` check is what turns that assumption into a fact.

**Exit criterion:** `network` passes in Photoshop on both macOS and Windows.

---

## Phase 1 — Supabase

### 1.1 Schema

```sql
create table licenses (
  id            uuid primary key default gen_random_uuid(),
  key_hash      text not null unique,          -- sha256 of the normalised key
  key_prefix    text not null,                 -- first 4 chars, for support lookups
  product       text not null default 'asset-browser',
  seats         int  not null default 1,
  status        text not null default 'active',-- active | revoked | refunded
  owner_email   text,
  order_ref     text,
  created_at    timestamptz not null default now()
);

create table activations (
  id             uuid primary key default gen_random_uuid(),
  license_id     uuid not null references licenses(id) on delete cascade,
  fingerprint    text not null,                -- sha256 of the plugin's machineId
  machine_label  text,                         -- hostname / platform, for the UI
  token_hash     text not null unique,         -- sha256 of the opaque bearer token
  plugin_version text,
  activated_at   timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  deactivated_at timestamptz
);

-- One live activation per machine per license. Re-running activate on the same
-- machine is idempotent instead of burning a second seat.
create unique index activations_one_live_per_machine
  on activations (license_id, fingerprint)
  where deactivated_at is null;
```

**RLS: deny everything.** The plugin never gets a Supabase key that can read
these tables. All access is through edge functions running with the service
role. The only credential in the bundle is the anon key required to invoke a
function, and the functions must not trust it for authorisation.

### 1.2 Key format

Crockford base32, 20 characters, grouped `XXXX-XXXX-XXXX-XXXX-XXXX`, last
character a checksum. Two properties that matter:

- The checksum lets the plugin reject a typo locally, before any network call —
  which is the difference between "that key has a typo" and a confusing 404.
- Crockford's alphabet excludes `I`, `L`, `O`, `U`, so a key read off a phone
  screen or a receipt cannot be mis-transcribed in the usual ways. Normalise
  input by upper-casing, stripping dashes/whitespace, and mapping `I`/`L`→`1`,
  `O`→`0` before hashing.

Store only `key_hash`. A database leak must not yield working keys.

### 1.3 Edge functions

All three return CORS headers and handle `OPTIONS`.

**`POST /activate`** — `{ key, machineId, machineLabel, pluginVersion }`

```
200  { token, expiresAt, seatsUsed, seatsTotal, machineLabel }
400  { error: "malformed_key" }
403  { error: "revoked" }
404  { error: "invalid_key" }
409  { error: "seat_limit", activations: [{ id, machineLabel, lastSeenAt }] }
```

Logic: normalise → hash → look up license → reject unless `status = 'active'` →
upsert on `(license_id, fingerprint)`. If a live activation for this fingerprint
already exists, **rotate its token and return 200** — the same machine
re-activating is not a new seat. Only a *different* fingerprint beyond `seats`
returns 409, and it returns the existing activation list so the UI can offer
"deactivate that one instead".

**`POST /validate`** — `{ token }` → `200 { ok, expiresAt }` | `401 { error }`.
Updates `last_seen_at`. This is the call the hard-block policy makes on launch.

**`POST /deactivate`** — `{ token }` → `204`. Sets `deactivated_at`, freeing
the seat.

**`GET /health`** — unauthenticated, returns `{ ok: true }`. Exists for the
Phase 0 self-test and for diagnosing "is it them or is it me".

### 1.4 Non-negotiables

- **Rate limit `/activate`** by key hash and by IP. Without it the endpoint is a
  key-guessing oracle. 5 attempts per key per hour, 20 per IP per hour.
- **Opaque tokens, not JWTs.** 256 bits from `crypto.randomUUID()`-grade
  randomness, stored hashed. The plugin cannot verify a signature anyway (no
  WebCrypto), and an opaque token stored server-side is revocable *instantly* —
  a JWT is not.
- **Never log a raw key or token.** Log `key_prefix` only.

---

## Phase 2 — Manifest & build

`manifest.json` currently declares only `localFileSystem` and `launchProcess`.
Add:

```jsonc
"requiredPermissions": {
  "network": { "domains": ["https://<project-ref>.supabase.co"] },
  // ...existing
}
```

Then extend `scripts/build.mjs`, which already rejects an array `host` and
verifies icon scale variants, with two more assertions:

- `network.domains` is present, and contains no `"*"` wildcard.
- The domain matches the API base URL compiled into the bundle — a mismatch
  fails silently at runtime, which is the exact failure mode
  `docs/UXP-CONSTRAINTS.md` was written to prevent.

Record the new permission in `docs/UXP-CONSTRAINTS.md` once Phase 0 proves how
UXP's fetch actually behaves (CORS, timeouts, TLS, proxy handling).

---

## Phase 3 — Plugin data model

### 3.1 New files

```
src/models/license.ts                    types + state machine (pure, testable)
src/services/licensing.service.ts        LicenseProvider iface + Supabase impl
src/adapters/network/uxp-fetch.ts        timeout, typed errors, no retry storms
src/components/onboarding/ActivationGate.tsx
```

### 3.2 Persistence

A fourth `JsonDocumentStore` in `src/app/services.ts`, alongside folders /
assets / settings:

```ts
licenseStore: new JsonDocumentStore<LicenseRecord>(storage, 'database/license.json', {
  version: SCHEMA_VERSIONS.license,   // add to the SCHEMA_VERSIONS const
  createDefault: () => ({ status: 'unactivated', machineId: newMachineId() }),
  normalize: normalizeLicense,
}),
```

```ts
export interface LicenseRecord {
  readonly status: 'unactivated' | 'activated';
  /** 128-bit hex, generated on first run. Never leaves the machine unhashed. */
  readonly machineId: string;
  readonly keyPrefix?: string;      // for display: "3F7K-••••-••••-••••-••••"
  readonly token?: string;
  readonly expiresAt?: number;
  readonly machineLabel?: string;
  readonly lastValidatedAt?: number;
}
```

The crash-safe write/verify/replace in `database.service.ts` applies for free.

### 3.3 Machine identity

`machineId` is a random 128-bit hex generated on first run and persisted in
`database/license.json`. `fingerprint = sha256(machineId)` is what the server
stores; the raw id never leaves the machine.

The honest limitation: the data folder is user-deletable, so a wipe produces a
new `machineId` and consumes a second seat. Two mitigations, in order of
preference:

1. **Label-based rebind (recommended).** `machineLabel` carries the hostname.
   When `/activate` hits the seat limit and an existing activation has a
   matching label, the 409 payload surfaces it first and the UI offers "this
   looks like this machine — reactivate it here". One click, no support ticket.
2. **Do not** write a hidden marker file to the user's home directory to survive
   the wipe. `fullAccess` makes it technically possible; it is user-hostile, and
   it is the kind of thing that gets flagged in marketplace review.

---

## Phase 4 — Gate & UI

### 4.1 Where it hooks in

`src/app/store.ts` already has `ready` / `bootError` and an `initialize()`.
Add a licensing slice that resolves **before** `initialize()` does its
filesystem work — there is no reason to index a 25,000-asset library for a user
who is about to be shown a key prompt.

```
license: { state: 'checking' | 'unactivated' | 'activating' | 'activated'
                  | 'blocked' | 'revoked' | 'seat_limit',
           error?: string, activations?: ActivationSummary[] }
```

`App.tsx` renders `<ActivationGate />` instead of the panel body for every
state except `activated`. This sits at the same level as the existing
`BootErrorState` in `src/components/feedback/States.tsx` and should follow its
conventions.

### 4.2 UXP constraints the gate must respect

These are not style notes; each one is a bug this codebase has already shipped
at least once.

- **No `<button>`.** `docs/UXP-CONSTRAINTS.md` and the ESLint
  `no-restricted-syntax` rule forbid it. `Pressable` is the only button
  primitive. Give the Activate control an explicit `label` — per the review
  finding on `Pressable.tsx:86`, relying on the `title` fallback makes the
  tooltip the accessible name.
- **The key input must be uncontrolled**, with local `useState` committed on
  submit. Do not round-trip each keystroke through the async store: that is the
  exact shape flagged in `BulkImportDialog.tsx:119`, and it is the classic setup
  for a UXP text field dropping the caret to the end mid-word.
- **If the gate scrolls, it needs an explicit pixel height** from
  `utils/layout.ts` and `flex: 0 0 auto`. `flex: 1 1 auto` does not bound a
  child in UXP — that is what clipped the Settings dialog's Cache and Data
  section. Prefer making the gate fit without scrolling at all.
- **No transitions or animation.** "Activating…" as plain text; there is no
  spinner that will move.
- **Fits at 280×360**, the manifest's `minimumSize`. Every error string has to
  be short enough to read in a docked panel.

### 4.3 The offline policy

```ts
/**
 * What happens when the license server cannot be reached at launch.
 *
 * 'block'  - the panel refuses to open. Current product decision.
 * 'grace'  - the cached token is honoured until `expiresAt`, and revalidation
 *            retries in the background.
 *
 * This is the single point of change. Nothing else in the licensing path may
 * branch on reachability.
 */
export const OFFLINE_POLICY: 'block' | 'grace' = 'block';
```

Under `'block'`, the gate shows a distinct, non-accusatory state — "Can't reach
the licence server. Check your connection and try again." with a Retry
`Pressable` — never the key-entry form. A user who is already paid up must
never be asked to re-enter their key because of an outage.

### 4.4 Settings

A "Licence" section in `SettingsDialog.tsx`: masked key, machine label,
activation date, seats used, and a **Deactivate this machine** control. It
confirms first (it is destructive and remote), calls `/deactivate`, clears
`license.json`, and drops back to the gate.

Note the review finding on `SettingsDialog.tsx:154` while you are in this file —
the unverified native `<input type="range">` has the same "is this in UXP's
subset?" risk that this plan spends Phase 0 retiring for `fetch`.

---

## Phase 5 — Key issuance

Out of scope for the plugin, needed before launch. Smallest thing that works:
an admin-only edge function or a SQL snippet that mints a key, prints it once,
and stores the hash. If you later add a storefront, its purchase webhook calls
the same path. Decide separately whether refunds auto-revoke.

---

## Phase 6 — Tests

The repo's unit tests are host-free, and licensing should stay that way. Keep
every branchable decision in pure modules:

- `models/license.ts` — key normalisation, checksum validation, the state
  machine's transitions, and response→state mapping for all of 200/400/403/404/
  409/timeout.
- `licensing.service.ts` against a fake `LicenseProvider`: activate, seat limit,
  rebind, deactivate, token expiry, unreachable server.
- Migration test: a v0 `license.json` upgrades without dropping the activation.

Avoid the trap the review found in `tests/unit/virtualization.test.ts:120` —
a test that asserts constants against the same constants proves nothing. The
license tests must assert against fixed expected *values* and recorded HTTP
response fixtures, not against the code's own definitions.

---

## Sequencing

1. **Phase 0 first, alone.** It is one afternoon and it can invalidate
   everything below it.
2. Fix the `.dialog__body` `flex: 1 1 auto` finding from the code review before
   Phase 4 — the gate reuses that bounded-region pattern, and building on it
   while it is broken means debugging both at once.
3. Phases 1 and 3 are independent; the plugin side can be built against a fake
   `LicenseProvider` while the Supabase side is written.
4. Phase 2 (manifest) lands with Phase 1, so real requests are testable early.

## Open questions

- Trial period, or paid-only from first launch? A gate with no trial is a
  harder sell for a browsing tool where the value is only visible once a library
  is indexed.
- Does a revoked key take effect immediately (next `/validate`) or at token
  expiry? Immediate is the point of opaque tokens; confirm it is what you want.
- Token lifetime. Shorter means faster revocation and more launch-time failures
  under `'block'`. 30 days is a reasonable default.
- Multi-product future: `licenses.product` exists for it, but nothing else in
  this plan is multi-product aware.
