# DESIGN.md — Meeting Room Booking Service

## Data Model

```
rooms
  id          TEXT PK
  name        TEXT UNIQUE COLLATE NOCASE
  capacity    INTEGER >= 1
  floor       INTEGER
  amenities   TEXT  (JSON array of strings)

bookings
  id               TEXT PK
  room_id          TEXT FK → rooms.id
  title            TEXT
  organizer_email  TEXT
  start_time       TEXT  (ISO-8601, stored as UTC)
  end_time         TEXT  (ISO-8601, stored as UTC)
  status           TEXT  ('confirmed' | 'cancelled')
  created_at       TEXT

idempotency_keys
  idempotency_key  TEXT
  organizer_email  TEXT
  booking_id       TEXT FK → bookings.id (nullable, set on completion)
  status           TEXT  ('in_progress' | 'completed' | 'failed')
  created_at       TEXT
  PRIMARY KEY (idempotency_key, organizer_email)
```

Times are stored as ISO-8601 strings in UTC. SQLite lexicographic ordering
works correctly for ISO-8601 strings, making range queries efficient.

---

## Enforcing No Overlaps

Overlap condition between two intervals [s1, e1) and [s2, e2):
```
s1 < e2  AND  e1 > s2
```

Before inserting a booking, the service queries:
```sql
SELECT * FROM bookings
WHERE  room_id = ?
  AND  status  = 'confirmed'
  AND  start_time < :newEnd
  AND  end_time   > :newStart
```

If any row is returned → `409 ConflictError`.

Cancelled bookings are excluded (`status = 'confirmed'`), so they never block
new bookings.

An index on `(room_id, start_time, end_time, status)` keeps the query O(log n).

---

## Error Handling Strategy

All service-layer errors extend `AppError`, which carries a `statusCode` and a
`name` (type). The Express error-handler middleware maps them to a consistent
JSON envelope:

```json
{ "error": "ValidationError", "message": "startTime must be before endTime" }
```

| Class             | HTTP Status | Use case                             |
|-------------------|-------------|--------------------------------------|
| ValidationError   | 400         | Bad input types / formats            |
| BusinessRuleError | 400         | Duration, working hours, grace period|
| NotFoundError     | 404         | Room or booking not found            |
| ConflictError     | 409         | Duplicate room name, overlap booking |

Unhandled errors fall through to a catch-all that returns 500.

---

## Idempotency Implementation

Scope: key uniqueness is scoped per `(idempotency_key, organizer_email)`.
This means two different organisers can reuse the same key without collision,
which is a reasonable default for a multi-tenant SaaS API.

### Protocol

```
Client → POST /bookings  [Idempotency-Key: k]
           │
           ▼
  tryInsert(k, email) ──success──► create booking ──► markCompleted(k, bookingId)
           │                                                    │
        conflict                                               201
           │
     read existing record
           │
     status='completed' ──► return existing booking (201)
     status='in_progress' ──► 409 (retry later)
     status='failed' ──► 409 (key consumed by failed attempt)
```

### State machine

```
in_progress ──[success]──► completed
in_progress ──[error]────► failed
```

The `idempotency_keys` table is persisted in SQLite (survives process restarts).

---

## Concurrency Handling

`better-sqlite3` executes synchronously. Node.js is single-threaded for JS
execution, so two concurrent HTTP requests are serialised at the event-loop
level — there is no true parallelism within a single process.

The `UNIQUE PRIMARY KEY (idempotency_key, organizer_email)` constraint provides
an additional last-resort guard: if two requests somehow reach the `tryInsert`
call "simultaneously", SQLite will reject the second INSERT with a constraint
violation, which is caught and handled.

For the **overlap check**, the pattern is:
```
1. SELECT overlapping bookings  (read)
2. INSERT booking               (write)
```
In a single Node process these two steps cannot be interleaved. In a
multi-process/multi-instance deployment, this should be wrapped in a
`BEGIN EXCLUSIVE` transaction or a distributed lock.

---

## Utilization Calculation

```
utilizationPercent = totalBookingHours(room, [from, to])
                     ────────────────────────────────────
                     businessHoursBetween(from, to)
```

**Business hours** = Mon–Fri, 08:00–20:00 UTC (12 h/day).

`businessHoursBetween` iterates calendar days in `[from, to]`, skipping
weekends, and sums the intersection of each business window with the query
range.

**Booking hours** are clamped to `[from, to]` before summing, so partial
overlaps (booking starts before `from` or ends after `to`) are counted
correctly.

Only `status = 'confirmed'` bookings contribute to utilization.
