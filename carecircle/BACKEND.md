# CareCircle — backend design notes (draft)

The prototype stores everything in the browser. A real version needs a backend that matches seniors with helpers, like a ride-hailing dispatcher.

## Core entities
- **User** (role: senior | helper | family), phone-verified.
- **HelperProfile**: identity check status, background-check status, training, service area, languages, rating.
- **Request**: senior_id, category (chat | shopping | company | other), when, notes, approx. location, status.
- **Visit**: request_id, helper_id, safety_code (hashed), check-in/out times, rating.
- **TrustedContact**: family members who can be notified.

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

## Notifications
Push (FCM / Web Push) for new nearby requests, helper accepted, helper arriving, visit finished; SMS fallback for seniors without smartphones.
