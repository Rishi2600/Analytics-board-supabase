# Ingestion API

The public contract. This is the document a customer reads when their events are not
showing up.

## Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/ingest
```

## Authentication

Send your project API key as a bearer token, or in `X-API-Key`:

```
Authorization: Bearer pk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Two kinds of key, and the difference is not cosmetic.

| Prefix     | Where it belongs          | Rules                                                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `pk_live_` | browser code, mobile apps | may only write; requests carrying an `Origin` must match the project's allowed origins |
| `sk_live_` | your servers              | rejected outright if the request carries an `Origin` header                            |

A public key is not a secret and is not treated as one. What protects it is that it can
only write, and only from origins you listed. A secret key sent from a browser is refused
rather than quietly accepted, because accepting it would let you ship a credential that
anyone can read out of developer tools.

Keys are shown once, when you create them. We store a salted SHA-256 hash, so we genuinely
cannot show it to you again. Lost a key? Revoke it and make another.

## Request

```http
POST /functions/v1/ingest
Authorization: Bearer pk_live_xxxxxxxxxxxx
Content-Type: application/json

{
  "batch": [
    {
      "event": "checkout_completed",
      "distinct_id": "u_8812",
      "session_id": "s_44a1",
      "ts": "2026-09-20T10:31:02.115Z",
      "ingest_id": "evt_01J8Z6M2K3",
      "properties": { "plan": "pro", "amount": 4900, "currency": "INR" },
      "context": { "url": "https://example.com/checkout", "sdk": "web", "sdk_version": "1.0.0" }
    }
  ]
}
```

| Field         | Required        | Notes                                                     |
| ------------- | --------------- | --------------------------------------------------------- |
| `event`       | yes             | lowercased and trimmed on arrival, max 64 characters      |
| `distinct_id` | yes             | who did it, max 200 characters                            |
| `session_id`  | no              | groups events into a visit                                |
| `ts`          | no              | when it happened, ISO 8601. Defaults to arrival time      |
| `ingest_id`   | no, but send it | idempotency key. See below                                |
| `properties`  | no              | max 64 keys, values max 1KB each, max 3 levels deep       |
| `context`     | no              | SDK, URL, referrer. We add user agent, device and country |

## Limits

| Limit                   | Value                                           | What happens past it                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Body size               | 512 KB                                          | `413 payload_too_large`, before parsing               |
| Events per batch        | 500                                             | `400 invalid_request`                                 |
| Rate                    | 100 events/second sustained, 500 burst, per key | `429 rate_limited` with `Retry-After`                 |
| Property keys per event | 64                                              | that event is rejected, the rest of the batch is kept |
| Property value size     | 1 KB                                            | same                                                  |
| Property nesting        | 3 levels                                        | same                                                  |

## Idempotency

Send an `ingest_id` with every event. Generate it on the client, once, when the event is
created, and reuse it on every retry of that same event.

The server has a unique index on `(project_id, ingest_id)` and inserts with
`ON CONFLICT DO NOTHING`. Replaying a batch inserts nothing and still returns `202`, with
the duplicates reported separately:

```json
{ "accepted": 0, "duplicates": 48, "rejected": [] }
```

This matters more than it looks. Every network has timeouts, and a client that retries
without an idempotency key double counts the events it was most anxious about. An
undercount looks like a bad week and gets investigated; an overcount looks like a good one
and does not.

## Timestamps

Two timestamps are stored for every event: `ts`, when you say it happened, and
`received_at`, when we observed it. Charts use `ts`. Aggregation walks `received_at`.

Client clocks are wrong constantly, so `ts` is clamped:

- more than **7 days in the past**, or more than **1 hour in the future**, is replaced with
  the arrival time and flagged with `context.ts_clamped: true`
- an unparseable `ts` is treated the same way
- a missing `ts` is not an error and means "now"

Genuinely late events are fine. A batch delivered three weeks after the fact, with its
original timestamps, lands in the correct historical buckets after the next rollup. What is
clamped is _skew_, not _lateness_: an event claiming to be from 2031 would otherwise land
in a bucket nothing will ever chart.

## Responses

### `202 Accepted`

```json
{
  "accepted": 48,
  "duplicates": 0,
  "rejected": [
    {
      "index": 12,
      "reason": "property_value_too_large",
      "detail": "\"blob\" is 2431 bytes, the limit is 1024"
    }
  ]
}
```

A partially bad batch is never failed wholesale. Good events are kept, bad ones are written
to a rejection log you can read on the ingestion health screen, with a sample of the
payload. You find out the same day instead of noticing a gap weeks later.

`202` rather than `200` is deliberate: the events are durable, but they are not yet
aggregated, so they will not appear in a rollup driven chart for a few minutes.

### Errors

Every non-2xx carries a stable `error.code`. Write your retry logic against the code, not
the message: codes are part of the contract, messages are not.

```json
{
  "error": {
    "code": "rate_limited",
    "message": "This key is sending events faster than its limit."
  }
}
```

| Code                      | Status | Meaning                                     | Retry?                   |
| ------------------------- | ------ | ------------------------------------------- | ------------------------ |
| `invalid_json`            | 400    | body is not JSON                            | no                       |
| `invalid_request`         | 400    | missing `batch`, or more than 500 events    | no                       |
| `payload_too_large`       | 413    | body over 512 KB                            | no, send smaller batches |
| `unauthorized`            | 401    | key unknown, revoked, or missing            | no                       |
| `origin_not_allowed`      | 403    | browser origin not on the project allowlist | no                       |
| `secret_key_from_browser` | 403    | `sk_live_` key sent with an `Origin` header | no                       |
| `rate_limited`            | 429    | over the token bucket                       | yes, after `Retry-After` |
| `method_not_allowed`      | 405    | not a POST                                  | no                       |
| `internal_error`          | 500    | our fault; nothing was recorded             | yes                      |

Unknown keys and revoked keys return exactly the same `401`. Distinguishing them would turn
this endpoint into a way to test whether a key exists.

## What gets rejected, and why

| Reason                     | Meaning                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `invalid_event`            | a required field is missing or the wrong type              |
| `too_many_properties`      | more than 64 property keys                                 |
| `property_key_too_long`    | a property key over 64 characters                          |
| `property_value_too_large` | a property value over 1 KB                                 |
| `property_too_deep`        | properties nested more than 3 levels                       |
| `bot_filtered`             | the user agent matched a known bot and bot filtering is on |

Every one of these is visible on the ingestion health screen, grouped by reason, with a
sample payload and a timestamp.

## Privacy

We never store a raw IP address. The client IP is hashed with a salt that rotates daily, so
the hash is useful for same-day deduplication and useless for following someone across
weeks. Rotating the salt breaks that link on purpose. See `docs/RUNBOOK.md` for how.

## A working example

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/ingest' \
  -H 'Authorization: Bearer sk_live_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "batch": [
      { "event": "test_event", "distinct_id": "u_1", "ingest_id": "evt_demo_1" }
    ]
  }'
```

Run it twice. The first returns `{"accepted":1,"duplicates":0,...}`, the second returns
`{"accepted":0,"duplicates":1,...}`. That is idempotency working.
