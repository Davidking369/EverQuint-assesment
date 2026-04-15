'use strict';

const { createTestDb, initTestEnv } = require('../../src/db/database');

beforeAll(async () => { await initTestEnv(); });
const RoomRepository            = require('../../src/repositories/roomRepository');
const BookingRepository         = require('../../src/repositories/bookingRepository');
const IdempotencyRepository     = require('../../src/repositories/idempotencyRepository');
const BookingService            = require('../../src/services/bookingService');
const { validateBusinessWindow } = require('../../src/utils/businessHours');
const { businessHoursBetween }  = require('../../src/utils/businessHours');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeServices(db) {
  const roomRepo        = new RoomRepository(db);
  const bookingRepo     = new BookingRepository(db);
  const idempotencyRepo = new IdempotencyRepository(db);
  return {
    roomRepo,
    bookingRepo,
    bookingService: new BookingService(roomRepo, bookingRepo, idempotencyRepo),
  };
}

function seedRoom(roomRepo, overrides = {}) {
  return roomRepo.create({
    id:        'room-1',
    name:      'Alpha',
    capacity:  10,
    floor:     1,
    amenities: ['projector'],
    ...overrides,
  });
}

// Next Monday 09:00 UTC
function nextMonday(hour = 9, minute = 0) {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  const day = d.getUTCDay();           // 0=Sun
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

function iso(date) { return date.toISOString(); }
function addMs(date, ms) { return new Date(date.getTime() + ms); }
const H = 3_600_000;
const M = 60_000;

// ── Tests ────────────────────────────────────────────────────────────────────
describe('validateBusinessWindow', () => {
  test('valid Mon 09:00–10:00', () => {
    const start = nextMonday(9);
    const end   = addMs(start, H);
    expect(validateBusinessWindow(start, end)).toBeNull();
  });

  test('rejects Saturday', () => {
    const sat = new Date('2025-01-04T10:00:00Z'); // Saturday
    const end = addMs(sat, H);
    expect(validateBusinessWindow(sat, end)).toMatch(/Monday/);
  });

  test('rejects before 08:00', () => {
    const start = nextMonday(7, 30);
    expect(validateBusinessWindow(start, addMs(start, H))).toMatch(/08:00/);
  });

  test('rejects after 20:00', () => {
    const start = nextMonday(19, 30);
    expect(validateBusinessWindow(start, addMs(start, H))).toMatch(/20:00/);
  });

  test('rejects spanning midnight', () => {
    const start = nextMonday(9);
    const nextDay = new Date(start);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(9, 0, 0, 0);
    expect(validateBusinessWindow(start, nextDay)).not.toBeNull();
  });
});

describe('BookingService — duration rules', () => {
  let db, bookingService, roomRepo;

  beforeEach(() => {
    db = createTestDb();
    ({ bookingService, roomRepo } = makeServices(db));
    seedRoom(roomRepo);
  });

  afterEach(() => db.close());

  const base = (start, end) => ({
    roomId: 'room-1', title: 'Test', organizerEmail: 'a@b.com',
    startTime: iso(start), endTime: iso(end),
  });

  test('rejects < 15 min', () => {
    const start = nextMonday(9);
    expect(() => bookingService.createBooking(base(start, addMs(start, 14 * M))))
      .toThrow('15 minutes');
  });

  test('rejects > 4 hours', () => {
    const start = nextMonday(9);
    expect(() => bookingService.createBooking(base(start, addMs(start, 4 * H + M))))
      .toThrow('4 hours');
  });

  test('accepts exactly 15 min', () => {
    const start = nextMonday(9);
    const b = bookingService.createBooking(base(start, addMs(start, 15 * M)));
    expect(b.status).toBe('confirmed');
  });

  test('accepts exactly 4 hours', () => {
    const start = nextMonday(9);
    const b = bookingService.createBooking(base(start, addMs(start, 4 * H)));
    expect(b.status).toBe('confirmed');
  });

  test('rejects startTime >= endTime', () => {
    const start = nextMonday(9);
    expect(() => bookingService.createBooking(base(start, start)))
      .toThrow('before endTime');
  });
});

describe('BookingService — overlap detection', () => {
  let db, bookingService, roomRepo;

  beforeEach(() => {
    db = createTestDb();
    ({ bookingService, roomRepo } = makeServices(db));
    seedRoom(roomRepo);
  });

  afterEach(() => db.close());

  function book(startH, endH) {
    const start = nextMonday(startH);
    return bookingService.createBooking({
      roomId: 'room-1', title: 'T', organizerEmail: 'a@b.com',
      startTime: iso(start), endTime: iso(addMs(start, (endH - startH) * H)),
    });
  }

  test('no overlap — adjacent slots accepted', () => {
    book(9, 10);
    expect(() => book(10, 11)).not.toThrow();
  });

  test('rejects full overlap', () => {
    book(9, 11);
    expect(() => book(9, 11)).toThrow('confirmed booking');
  });

  test('rejects partial overlap (start inside existing)', () => {
    book(9, 11);
    expect(() => book(10, 12)).toThrow('confirmed booking');
  });

  test('rejects partial overlap (end inside existing)', () => {
    book(10, 12);
    expect(() => book(9, 11)).toThrow('confirmed booking');
  });

  test('rejects contained booking', () => {
    book(9, 12);
    expect(() => book(10, 11)).toThrow('confirmed booking');
  });

  test('cancelled booking does not block new booking', () => {
    const b = book(9, 10);
    // manually set far-future start so cancellation is within grace
    // Instead: directly cancel via repo to bypass grace period check
    const bookingRepo = new BookingRepository(db);
    bookingRepo.updateStatus(b.id, 'cancelled');
    expect(() => book(9, 10)).not.toThrow();
  });
});

describe('BookingService — working hours', () => {
  let db, bookingService, roomRepo;

  beforeEach(() => {
    db = createTestDb();
    ({ bookingService, roomRepo } = makeServices(db));
    seedRoom(roomRepo);
  });

  afterEach(() => db.close());

  test('rejects weekend booking', () => {
    const sat = new Date('2025-06-07T10:00:00Z'); // Saturday
    expect(() => bookingService.createBooking({
      roomId: 'room-1', title: 'T', organizerEmail: 'a@b.com',
      startTime: iso(sat), endTime: iso(addMs(sat, H)),
    })).toThrow(/Monday/);
  });

  test('rejects booking starting before 08:00', () => {
    const start = nextMonday(7);
    expect(() => bookingService.createBooking({
      roomId: 'room-1', title: 'T', organizerEmail: 'a@b.com',
      startTime: iso(start), endTime: iso(addMs(start, H)),
    })).toThrow(/08:00/);
  });
});

describe('BookingService — cancellation grace period', () => {
  let db, bookingService, roomRepo, bookingRepo;

  beforeEach(() => {
    db = createTestDb();
    ({ bookingService, roomRepo, bookingRepo } = makeServices(db));
    seedRoom(roomRepo);
  });

  afterEach(() => db.close());

  test('cancelling a booking 2h before start succeeds', () => {
    // Insert a booking that starts 3 hours from now on a weekday
    const future = new Date(Date.now() + 3 * H);
    // Ensure it's a weekday 09:00
    future.setUTCHours(9, 0, 0, 0);
    const dayOfWeek = future.getUTCDay();
    if (dayOfWeek === 0) future.setUTCDate(future.getUTCDate() + 1);
    if (dayOfWeek === 6) future.setUTCDate(future.getUTCDate() + 2);

    const b = bookingRepo.create({
      id: 'b-cancel-ok', roomId: 'room-1', title: 'T',
      organizerEmail: 'a@b.com',
      startTime: future.toISOString(),
      endTime:   addMs(future, H).toISOString(),
      createdAt: new Date().toISOString(),
    });

    const cancelled = bookingService.cancelBooking(b.id);
    expect(cancelled.status).toBe('cancelled');
  });

  test('cancelling within 1h of start throws BusinessRuleError', () => {
    const soon = new Date(Date.now() + 30 * M); // 30 min from now
    const b = bookingRepo.create({
      id: 'b-cancel-fail', roomId: 'room-1', title: 'T',
      organizerEmail: 'a@b.com',
      startTime: soon.toISOString(),
      endTime:   addMs(soon, H).toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(() => bookingService.cancelBooking(b.id)).toThrow('1 hour');
  });

  test('cancelling already-cancelled booking is a no-op', () => {
    const future = new Date(Date.now() + 3 * H);
    const b = bookingRepo.create({
      id: 'b-noop', roomId: 'room-1', title: 'T',
      organizerEmail: 'a@b.com',
      startTime: future.toISOString(),
      endTime:   addMs(future, H).toISOString(),
      createdAt: new Date().toISOString(),
    });
    bookingRepo.updateStatus(b.id, 'cancelled');
    const result = bookingService.cancelBooking(b.id);
    expect(result.status).toBe('cancelled');
  });
});

describe('businessHoursBetween', () => {
  test('Mon 08:00 to Mon 20:00 = 12h', () => {
    const from = new Date('2025-01-06T08:00:00Z');
    const to   = new Date('2025-01-06T20:00:00Z');
    expect(businessHoursBetween(from, to)).toBeCloseTo(12);
  });

  test('Mon 08:00 to Fri 20:00 = 60h', () => {
    const from = new Date('2025-01-06T08:00:00Z'); // Mon
    const to   = new Date('2025-01-10T20:00:00Z'); // Fri
    expect(businessHoursBetween(from, to)).toBeCloseTo(60);
  });

  test('Fri 08:00 to Mon 20:00 = 24h (skips weekend)', () => {
    const from = new Date('2025-01-10T08:00:00Z'); // Fri
    const to   = new Date('2025-01-13T20:00:00Z'); // Mon
    expect(businessHoursBetween(from, to)).toBeCloseTo(24);
  });

  test('partial day overlap', () => {
    const from = new Date('2025-01-06T10:00:00Z'); // Mon 10:00
    const to   = new Date('2025-01-06T14:00:00Z'); // Mon 14:00
    expect(businessHoursBetween(from, to)).toBeCloseTo(4);
  });
});
