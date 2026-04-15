'use strict';

const request = require('supertest');
const { createApp }    = require('../../src/app');
const { createTestDb, initTestEnv } = require('../../src/db/database');
const BookingRepository = require('../../src/repositories/bookingRepository');

beforeAll(async () => { await initTestEnv(); });

// ── Helpers ──────────────────────────────────────────────────────────────────
const H = 3_600_000;
const M = 60_000;
function addMs(date, ms) { return new Date(date.getTime() + ms); }
function iso(d) { return d.toISOString(); }

function nextWeekday(dayOfWeek /* 1=Mon…5=Fri */, hour = 9) {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  let diff = dayOfWeek - d.getUTCDay();
  if (diff <= 0) diff += 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}
const MONDAY = () => nextWeekday(1);

// ── Shared app setup ─────────────────────────────────────────────────────────
let app, db;

beforeEach(() => {
  db  = createTestDb();
  app = createApp(db);
});

afterEach(() => db.close());

// ── Room Endpoints ────────────────────────────────────────────────────────────
describe('POST /rooms', () => {
  test('creates a room and returns 201', async () => {
    const res = await request(app).post('/rooms').send({
      name: 'Boardroom', capacity: 10, floor: 2, amenities: ['projector', 'whiteboard'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Boardroom', capacity: 10 });
    expect(res.body.id).toBeTruthy();
  });

  test('rejects duplicate name (case-insensitive)', async () => {
    await request(app).post('/rooms').send({ name: 'Alpha', capacity: 5, floor: 1, amenities: [] });
    const res = await request(app).post('/rooms').send({ name: 'ALPHA', capacity: 5, floor: 1, amenities: [] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ConflictError');
  });

  test('rejects capacity < 1', async () => {
    const res = await request(app).post('/rooms').send({ name: 'X', capacity: 0, floor: 1, amenities: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /rooms', () => {
  beforeEach(async () => {
    await request(app).post('/rooms').send({ name: 'Small', capacity: 4, floor: 1, amenities: ['tv'] });
    await request(app).post('/rooms').send({ name: 'Large', capacity: 20, floor: 3, amenities: ['projector', 'tv'] });
    await request(app).post('/rooms').send({ name: 'Bare',  capacity: 8, floor: 2, amenities: [] });
  });

  test('lists all rooms', async () => {
    const res = await request(app).get('/rooms');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  test('filters by minCapacity', async () => {
    const res = await request(app).get('/rooms?minCapacity=8');
    expect(res.body).toHaveLength(2);
    res.body.forEach(r => expect(r.capacity).toBeGreaterThanOrEqual(8));
  });

  test('filters by amenity', async () => {
    const res = await request(app).get('/rooms?amenity=projector');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Large');
  });
});

// ── Booking Endpoints ─────────────────────────────────────────────────────────
describe('POST /bookings — happy path', () => {
  let roomId;

  beforeEach(async () => {
    const res = await request(app).post('/rooms').send({ name: 'R1', capacity: 5, floor: 1, amenities: [] });
    roomId = res.body.id;
  });

  test('creates confirmed booking', async () => {
    const start = MONDAY();
    const res = await request(app).post('/bookings').send({
      roomId, title: 'Standup', organizerEmail: 'dev@co.com',
      startTime: iso(start), endTime: iso(addMs(start, H)),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.roomId).toBe(roomId);
  });

  test('returns 404 for unknown room', async () => {
    const start = MONDAY();
    const res = await request(app).post('/bookings').send({
      roomId: 'nonexistent', title: 'T', organizerEmail: 'a@b.com',
      startTime: iso(start), endTime: iso(addMs(start, H)),
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  test('returns 409 for overlapping booking', async () => {
    const start = MONDAY();
    await request(app).post('/bookings').send({
      roomId, title: 'First', organizerEmail: 'a@b.com',
      startTime: iso(start), endTime: iso(addMs(start, 2 * H)),
    });
    const res = await request(app).post('/bookings').send({
      roomId, title: 'Second', organizerEmail: 'b@b.com',
      startTime: iso(addMs(start, H)), endTime: iso(addMs(start, 3 * H)),
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ConflictError');
  });

  test('returns consistent JSON error shape', async () => {
    const res = await request(app).post('/bookings').send({ roomId });
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });
});

describe('GET /bookings — list & pagination', () => {
  let roomId;

  beforeEach(async () => {
    const r = await request(app).post('/rooms').send({ name: 'R2', capacity: 5, floor: 1, amenities: [] });
    roomId = r.body.id;

    const mon = MONDAY();
    for (let i = 0; i < 3; i++) {
      const start = addMs(mon, i * 2 * H);
      await request(app).post('/bookings').send({
        roomId, title: `Meeting ${i}`, organizerEmail: 'x@y.com',
        startTime: iso(start), endTime: iso(addMs(start, H)),
      });
    }
  });

  test('returns paginated shape', async () => {
    const res = await request(app).get('/bookings');
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
    expect(res.body.items).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });

  test('filters by roomId', async () => {
    const r2 = await request(app).post('/rooms').send({ name: 'R3', capacity: 5, floor: 1, amenities: [] });
    const res = await request(app).get(`/bookings?roomId=${r2.body.id}`);
    expect(res.body.total).toBe(0);
  });

  test('limit and offset work', async () => {
    const res = await request(app).get('/bookings?limit=2&offset=1');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.offset).toBe(1);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────
describe('POST /bookings — Idempotency-Key', () => {
  let roomId;

  beforeEach(async () => {
    const r = await request(app).post('/rooms').send({ name: 'Idem', capacity: 5, floor: 1, amenities: [] });
    roomId = r.body.id;
  });

  test('same key + same organizer returns same booking (no duplicate)', async () => {
    const start = MONDAY();
    const body  = {
      roomId, title: 'Idem Test', organizerEmail: 'idem@co.com',
      startTime: iso(start), endTime: iso(addMs(start, H)),
    };

    const r1 = await request(app).post('/bookings')
      .set('Idempotency-Key', 'key-abc-123').send(body);
    const r2 = await request(app).post('/bookings')
      .set('Idempotency-Key', 'key-abc-123').send(body);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.id).toBe(r2.body.id);   // same booking

    // DB should have exactly 1 booking
    const list = await request(app).get('/bookings');
    expect(list.body.total).toBe(1);
  });

  test('different keys create separate bookings', async () => {
    const start1 = MONDAY();
    const start2 = addMs(MONDAY(), 2 * H);

    await request(app).post('/bookings')
      .set('Idempotency-Key', 'key-1')
      .send({ roomId, title: 'A', organizerEmail: 'a@co.com',
              startTime: iso(start1), endTime: iso(addMs(start1, H)) });

    await request(app).post('/bookings')
      .set('Idempotency-Key', 'key-2')
      .send({ roomId, title: 'B', organizerEmail: 'b@co.com',
              startTime: iso(start2), endTime: iso(addMs(start2, H)) });

    const list = await request(app).get('/bookings');
    expect(list.body.total).toBe(2);
  });

  test('same key, different organizer → different bookings', async () => {
    const start1 = MONDAY();
    const start2 = addMs(MONDAY(), 2 * H);

    const r1 = await request(app).post('/bookings')
      .set('Idempotency-Key', 'shared-key')
      .send({ roomId, title: 'A', organizerEmail: 'a@co.com',
              startTime: iso(start1), endTime: iso(addMs(start1, H)) });

    const r2 = await request(app).post('/bookings')
      .set('Idempotency-Key', 'shared-key')
      .send({ roomId, title: 'B', organizerEmail: 'b@co.com',
              startTime: iso(start2), endTime: iso(addMs(start2, H)) });

    expect(r1.body.id).not.toBe(r2.body.id);
  });
});

// ── Cancellation ──────────────────────────────────────────────────────────────
describe('POST /bookings/:id/cancel', () => {
  let roomId, bookingId;

  beforeEach(async () => {
    const r = await request(app).post('/rooms').send({ name: 'CRoom', capacity: 5, floor: 1, amenities: [] });
    roomId = r.body.id;

    // Insert a booking starting 3 hours from now directly in the DB
    const bRepo = new BookingRepository(db);
    const future = new Date(Date.now() + 3 * H);
    const b = bRepo.create({
      id: 'test-booking', roomId, title: 'Cancel Me',
      organizerEmail: 'c@co.com',
      startTime: iso(future),
      endTime:   iso(addMs(future, H)),
      createdAt: new Date().toISOString(),
    });
    bookingId = b.id;
  });

  test('cancels a booking within grace period', async () => {
    const res = await request(app).post(`/bookings/${bookingId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  test('returns 404 for unknown booking', async () => {
    const res = await request(app).post('/bookings/unknown/cancel');
    expect(res.status).toBe(404);
  });

  test('returns 400 when past grace period', async () => {
    const bRepo = new BookingRepository(db);
    const imminent = new Date(Date.now() + 30 * M); // only 30 min away
    const b = bRepo.create({
      id: 'imminent', roomId, title: 'Imminent',
      organizerEmail: 'c@co.com',
      startTime: iso(imminent),
      endTime:   iso(addMs(imminent, H)),
      createdAt: new Date().toISOString(),
    });
    const res = await request(app).post(`/bookings/${b.id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1 hour/);
  });
});

// ── Utilization Report ────────────────────────────────────────────────────────
describe('GET /reports/room-utilization', () => {
  let roomId;

  beforeEach(async () => {
    const r = await request(app).post('/rooms').send({ name: 'UtilRoom', capacity: 5, floor: 1, amenities: [] });
    roomId = r.body.id;
  });

  test('returns 0 utilization when no bookings', async () => {
    const res = await request(app).get(
      '/reports/room-utilization?from=2025-01-06T08:00:00Z&to=2025-01-06T20:00:00Z'
    );
    expect(res.status).toBe(200);
    const room = res.body.find(r => r.roomId === roomId);
    expect(room.utilizationPercent).toBe(0);
    expect(room.totalBookingHours).toBe(0);
  });

  test('calculates correct utilization for a 6h booking on a 12h day', async () => {
    // Insert 6h booking directly to bypass business-hour start check for this test
    const bRepo = new BookingRepository(db);
    bRepo.create({
      id: 'util-b', roomId, title: 'T',
      organizerEmail: 'u@co.com',
      startTime: '2025-01-06T09:00:00Z',  // Mon
      endTime:   '2025-01-06T15:00:00Z',
      createdAt: new Date().toISOString(),
    });

    const res = await request(app).get(
      '/reports/room-utilization?from=2025-01-06T08:00:00Z&to=2025-01-06T20:00:00Z'
    );
    const room = res.body.find(r => r.roomId === roomId);
    expect(room.totalBookingHours).toBeCloseTo(6);
    expect(room.utilizationPercent).toBeCloseTo(0.5);   // 6/12
  });

  test('partial overlap: booking starts before "from"', async () => {
    const bRepo = new BookingRepository(db);
    bRepo.create({
      id: 'util-partial', roomId, title: 'T',
      organizerEmail: 'u@co.com',
      startTime: '2025-01-06T07:00:00Z',   // starts 1h before window
      endTime:   '2025-01-06T10:00:00Z',
      createdAt: new Date().toISOString(),
    });

    const res = await request(app).get(
      '/reports/room-utilization?from=2025-01-06T08:00:00Z&to=2025-01-06T20:00:00Z'
    );
    const room = res.body.find(r => r.roomId === roomId);
    // Only 08:00–10:00 = 2h counts
    expect(room.totalBookingHours).toBeCloseTo(2);
    expect(room.utilizationPercent).toBeCloseTo(2 / 12);
  });

  test('returns 400 when "from" is missing', async () => {
    const res = await request(app).get('/reports/room-utilization?to=2025-01-06T20:00:00Z');
    expect(res.status).toBe(400);
  });

  test('returns 400 when "from" >= "to"', async () => {
    const res = await request(app).get(
      '/reports/room-utilization?from=2025-01-06T20:00:00Z&to=2025-01-06T08:00:00Z'
    );
    expect(res.status).toBe(400);
  });
});
