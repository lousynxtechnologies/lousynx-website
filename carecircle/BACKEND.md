# CareCircle — backend design notes (draft)

The prototype stores everything in the browser. A real version needs a backend that matches seniors with helpers, like a ride-hailing dispatcher.

## Core entities
- **User** (role: senior | helper | family), phone-verified.
- **HelperProfile**: identity check status, background-check status, training, service area, languages, rating.
- **Request**: senior_id, category (chat | shopping | company | other), when, notes, approx. location, status.
- **Visit**: request_id, helper_id, safety_code (hashed), check-in/out times, rating.
- **TrustedContact**: family members who can be notified.

## Accounts, sign-in and profiles
The prototype keeps accounts in the browser (salted PBKDF2 hashes, in-memory throttling). That is **demo-only**: anyone with access to the device can read or copy the data, there is no email verification, no password recovery and no real rate limiting. A real version:
- **Identity:** sign up with email or mobile number + one-time code (seniors often prefer a phone number and may need a family member to help set up). Verify before activating. Offer "set up on behalf of a parent" with consent.
- **Passwords:** if used, hash with Argon2id (or bcrypt/scrypt) on the server with a per-user salt and a pepper kept in a secrets manager; never accept hashes from the client. Consider passkeys (WebAuthn) as the primary login.
- **Sessions:** short-lived access tokens + rotating refresh tokens in `HttpOnly; Secure; SameSite` cookies; server-side revocation; re-authenticate before sensitive changes (password, phone, deleting the account).
- **Abuse controls:** per-IP and per-account rate limits, progressive lockout, CAPTCHA/step-up on suspicious activity, email/SMS alerts on new-device login.
- **Roles and authorisation:** `senior`, `helper`, `family`, `admin`. Enforce on the server (a senior can only read their own requests; a helper only sees fuzzed open requests and, after acceptance, their own visits).
- **Profile data:** store only what's needed (name, rough area, languages, bio, emergency contact; helpers also services/availability). Keep the emergency contact encrypted, let users export and delete their data, and log who accessed it.
- **Helper onboarding:** government-ID check, liveness selfie match, background / vulnerable-sector check, references, training; badge shown on the profile only after passing. Re-verify periodically.
- **Account deletion:** soft-delete then purge on a schedule; keep minimal safety/incident records as required by law.

## Request lifecycle
`open → accepted → arrived → done` (or `cancelled`). Check-in (`accepted → arrived`) requires the helper to submit the safety code the senior holds.

## Suggested REST API
| Method | Path | Purpose |
|---|---|---|
| POST | /v1/requests | Senior creates a request |
| GET | /v1/requests?status=open&near=lat,lng | Helper lists nearby open requests |
| POST | /v1/requests/{id}/accept | Helper accepts (atomic; first wins) |
| POST | /v1/requests/{id}/checkin | Body: `{code}`; rate-limited, lock after 3 wrong tries |
| POST | /v1/requests/{id}/finish | Helper finishes |
| POST | /v1/requests/{id}/rating | Senior rates 1–5 |
| POST | /v1/requests/{id}/cancel | Either side cancels |

## Matching
Start simple: geo-radius + category + helper availability, offered to a few helpers at a time with a short timeout (dispatcher-style). Add ranking by rating, distance, past visits with the same senior.

## Safety and trust (must-haves before launch)
- Identity verification and a criminal-record / vulnerable-sector check for every helper; re-check periodically.
- Safety code at the door; share trip status with a family contact; in-app incident reporting and a 24/7 escalation process.
- Never expose a senior's exact address before acceptance; mask phone numbers (relay calls).
- Ban/suspend flow, audit log, and human review of reports.

## Privacy and compliance
- Collect the minimum data; encrypt at rest and in transit; clear retention policy.
- Health-related or location data may trigger extra rules (e.g. PIPEDA / provincial rules in Canada, HIPAA / state law in the US, GDPR in the EU). Get legal review.
- Marketplace rules: check whether helpers are contractors or employees, insurance/liability, and any licensing for personal-care services.

## Payments (not in the draft)
Use a licensed processor with marketplace/escrow support (e.g. Stripe Connect). Do not hold funds yourself. No cash handling by helpers.

## Live location and the map
The prototype simulates other people on the map. A real version:
- **Transport:** WebSocket (or SSE + POST) channel per visit. Each device posts its position every few seconds only while a visit is `accepted` or `arrived`; the server relays it **only to the other party of that visit** and discards it when the visit ends or is cancelled.
- **Open requests:** store the exact position encrypted; expose to helpers only a fuzzed centre + radius (the prototype uses ~400 m). Use a *stable* per-request offset (not fresh random noise each time) so repeated polling can't be averaged to find the true point.
- **Helper discovery for seniors:** show only coarse "helpers nearby" (fuzzed, ~300 m). Never show an unmatched helper's live position.
- **Spatial index:** PostGIS (`ST_DWithin`) or a geohash/H3 index for "open requests near me".
- **Consent and control:** location sharing is opt-in, can be turned off at any time, and the server keeps no history beyond what safety/incident review needs (set a short retention, e.g. 30 days, encrypted).
- **Safety extras:** "share my visit" link for family, alert if a helper's route stalls or deviates, SOS button that sends the live location to the family contact and operator.
- **Map provider:** the prototype uses the public OpenStreetMap tile server with attribution, which is fine for a demo only. For production use a commercial/self-hosted tile provider (MapTiler, Mapbox, Stadia, or your own) to comply with usage policies.

## In-app chat between matched people
The prototype stores messages inside the request and simulates replies from demo partners. A real version:
- **Who can chat:** only the senior and the helper on an `accepted`/`arrived` visit (plus a read-only window afterwards). The server checks participation on every read/write; no direct messages between strangers, no group chats.
- **Transport:** WebSocket (fallback to long-polling) per visit; push notification (FCM/APNs/Web Push) and SMS fallback for new messages when the app is closed. Delivery and read receipts.
- **Privacy:** keep the conversation in the app; mask phone numbers (relay calls/SMS via a provider such as Twilio Proxy) so neither side needs to share a number. Encrypt in transit and at rest. Define retention (e.g. delete 30–90 days after the visit unless reported).
- **Safety:** server-side checks for card numbers, banking/login words, links, and requests for cash or gift cards; warn the sender and flag for review. One-tap **Report** attaches the last N messages to an incident for a human safety team; repeat offenders are suspended.
- **Limits:** rate-limit messages, cap length (500 chars in the draft), block attachments at first (add images later with scanning).
- **Family visibility:** optionally let a trusted family member see that a chat exists and the visit details — not necessarily the content — unless the senior opts in.
- **Accessibility:** large text, quick-reply chips, optional voice-to-text; read messages aloud for visually impaired seniors.

## Notifications
Push (FCM / Web Push) for new nearby requests, helper accepted, helper arriving, visit finished; SMS fallback for seniors without smartphones.
