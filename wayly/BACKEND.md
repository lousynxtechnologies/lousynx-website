# Wayly (AI Travel Concierge) — backend design notes (draft)

The prototype is a front-end only web app: flights, hotels and prices are generated sample data, bookings are simulated, and the "AI" is a small rule-based assistant. This document sketches what a real version needs.

## What is real in the draft vs. what needs a server
| Feature | Draft | Real version |
|---|---|---|
| Voice output (reminders, audio guides) | Real: browser `speechSynthesis` | Cloud neural TTS (consistent voices/languages, offline packs) |
| Voice input | Browser `SpeechRecognition` where supported (sends audio to the browser vendor) | Streaming speech-to-text with your own provider, wake word, noise handling |
| Concierge | Rule-based intents | LLM agent with tools (search, book, status, maps), guardrails and memory |
| Flights / hotels | Generated sample data | Supplier APIs (see below) |
| Booking / payment | Simulated | Real booking flow, PCI-compliant payments |
| Reminders | Timers while the app is open | Server-scheduled push (FCM/APNs/Web Push) + SMS/WhatsApp fallback |
| Taxi | Deep links (Uber, Maps) + driver card | Ride-hailing partner APIs, local taxi dispatch, airport rules |
| Audio guides | Short built-in scripts | Licensed, fact-checked content; geofenced triggers; offline downloads; many languages |

## Suggested architecture
- **Client:** PWA first, then native apps for reliable background location, geofencing, and push.
- **API gateway + auth:** user accounts (passkeys/OTP), trips, travellers, preferences.
- **Trip service:** a canonical itinerary (segments: flight, hotel, transfer, activity) with time zones from IANA tz data, not fixed offsets. Import bookings by email forwarding / calendar / booking reference.
- **Search & booking adapters:** one interface, many suppliers. Examples to evaluate: Amadeus, Sabre or Travelport (GDS), Duffel (flights), Expedia / Booking.com / Hotelbeds partner APIs (hotels). Each has contracts, certification and fraud/payment requirements.
- **Real-time status:** flight status and delay feeds (e.g. FlightAware/Cirium/OAG) → re-plan reminders (leave later/earlier, rebook options, gate changes, baggage belt).
- **Reminder engine:** a scheduler computing "leave-by" times from live traffic/transit (Maps/Routes API) + airport process times; delivers push with quiet hours, snooze and escalation; idempotent and time-zone aware.
- **Concierge agent:** LLM with tool calling (itinerary read/write, search, maps, taxi, translation, emergency info). Strict system prompts, tool permission checks, human confirmation before any purchase, logging and evaluation. Keep a deterministic fallback for critical reminders so they never depend on the LLM.
- **Content service:** attraction catalogue with licensed text/audio, accessibility info, opening hours, ticket links, multilingual scripts, and geofence polygons.
- **Notifications:** FCM / APNs / Web Push; SMS via a provider for key moments (e.g. "leave now").

## Payments and regulation
- Take payments only through a PCI-DSS compliant processor (e.g. Stripe, Adyen); never handle raw card data. Marketplace flows may need licensing as a travel agency/seller of travel in some regions (e.g. travel-agent registration and consumer protection rules in some provinces/states, ATOL/ABTA in the UK, package-travel rules in the EU).
- Show full prices, taxes, fees, and cancellation terms before purchase. Keep a clear refund/cancellation process.
- Respect airline/hotel fare rules, ticketing deadlines and passenger-data requirements (names must match passports).

## Privacy and safety
- Itineraries, passport details and location are sensitive: encrypt in transit and at rest, minimise collection, give export/delete, and set retention limits. Comply with GDPR/PIPEDA/CCPA as applicable.
- Location: opt-in, foreground use by default; background geofencing only with explicit consent and a visible reason.
- Voice: tell users when audio leaves the device; avoid storing recordings by default.
- Safety features: local emergency numbers by country, embassy info, "share my trip" link with a trusted contact, a check-in prompt if the user seems stranded or very late.
- AI safeguards: never invent prices, schedules or entry rules. Cite sources and the time of data; say "I don't know" or hand off to a human/official source when unsure.

## Accessibility
Large type, high contrast, captions for all audio, screen-reader labels, voice-first flows, and support for multiple languages and speaking speeds.
