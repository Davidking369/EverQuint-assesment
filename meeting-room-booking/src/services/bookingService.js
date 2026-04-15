'use strict';

const { v4: uuidv4 }                    = require('uuid');
const { validateBusinessWindow }        = require('../utils/businessHours');
const { ValidationError, NotFoundError,
        ConflictError, BusinessRuleError } = require('../utils/errors');

const MIN_DURATION_MS =  15 * 60 * 1000;   //  15 min
const MAX_DURATION_MS = 4 * 60 * 60 * 1000; //   4 hr
const CANCEL_GRACE_MS = 60 * 60 * 1000;    //   1 hr

class BookingService {
  constructor(roomRepository, bookingRepository, idempotencyRepository) {
    this.roomRepo         = roomRepository;
    this.bookingRepo      = bookingRepository;
    this.idempotencyRepo  = idempotencyRepository;
  }

  // ── Create Booking ───────────────────────────────────────────────────────
  createBooking(body, idempotencyKey = null) {
    const { roomId, title, organizerEmail, startTime, endTime } = body;

    // ── Structural validation ───────────────────────────────────────────────
    if (!roomId)          throw new ValidationError('roomId is required.');
    if (!title || !title.trim()) throw new ValidationError('title is required.');
    if (!organizerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail))
      throw new ValidationError('organizerEmail must be a valid email address.');
    if (!startTime)       throw new ValidationError('startTime is required (ISO-8601).');
    if (!endTime)         throw new ValidationError('endTime is required (ISO-8601).');

    const start = new Date(startTime);
    const end   = new Date(endTime);

    if (isNaN(start.getTime())) throw new ValidationError('startTime is not a valid ISO-8601 date.');
    if (isNaN(end.getTime()))   throw new ValidationError('endTime is not a valid ISO-8601 date.');

    // ── Business rules ──────────────────────────────────────────────────────
    if (start >= end)
      throw new ValidationError('startTime must be before endTime.');

    const duration = end - start;
    if (duration < MIN_DURATION_MS)
      throw new BusinessRuleError('Booking duration must be at least 15 minutes.');
    if (duration > MAX_DURATION_MS)
      throw new BusinessRuleError('Booking duration must not exceed 4 hours.');

    const windowError = validateBusinessWindow(start, end);
    if (windowError) throw new BusinessRuleError(windowError);

    // ── Room must exist ─────────────────────────────────────────────────────
    const room = this.roomRepo.findById(String(roomId));
    if (!room) throw new NotFoundError(`Room "${roomId}" not found.`);

    // ── Idempotency path ────────────────────────────────────────────────────
    if (idempotencyKey) {
      return this._createWithIdempotency(
        idempotencyKey, organizerEmail.toLowerCase(),
        room, { title: title.trim(), organizerEmail, startTime: start.toISOString(), endTime: end.toISOString() }
      );
    }

    // ── Non-idempotent path ─────────────────────────────────────────────────
    return this._insertBookingWithOverlapCheck(
      room.id, title.trim(), organizerEmail, start.toISOString(), end.toISOString()
    );
  }

  _createWithIdempotency(key, normalizedEmail, room, fields) {
    /**
     * Strategy: use a DB UNIQUE constraint on (idempotency_key, organizer_email).
     * 1. Try to INSERT 'in_progress' row atomically.
     * 2a. If INSERT succeeded → create booking → mark 'completed'.
     * 2b. If INSERT failed (duplicate) → return existing result.
     *
     * Because better-sqlite3 is synchronous and Node.js is single-threaded,
     * the tryInsert + createBooking sequence executes atomically from JS's
     * perspective (no await = no interleaving). For multi-process deployments
     * the DB UNIQUE constraint provides the last line of defense.
     */
    const now = new Date().toISOString();
    const { inserted, record } = this.idempotencyRepo.tryInsert(key, normalizedEmail, now);

    if (!inserted) {
      // Key already seen
      if (record.status === 'completed') {
        const existing = this.bookingRepo.findById(record.booking_id);
        if (existing) return existing;
      }
      // in_progress or failed — return 409 if in_progress, otherwise retry semantics
      if (record.status === 'in_progress') {
        throw new ConflictError('A request with this Idempotency-Key is already in progress.');
      }
      // If failed previously, we consider the key consumed — return 409
      throw new ConflictError('This Idempotency-Key was used for a previously failed request.');
    }

    // Inserted successfully — now create the booking
    try {
      const booking = this._insertBookingWithOverlapCheck(
        room.id, fields.title, fields.organizerEmail, fields.startTime, fields.endTime
      );
      this.idempotencyRepo.markCompleted(key, normalizedEmail, booking.id);
      return booking;
    } catch (err) {
      this.idempotencyRepo.markFailed(key, normalizedEmail);
      throw err;
    }
  }

  _insertBookingWithOverlapCheck(roomId, title, organizerEmail, startTime, endTime) {
    const overlapping = this.bookingRepo.findOverlapping(roomId, startTime, endTime);
    if (overlapping.length > 0) {
      throw new ConflictError(
        `Room already has a confirmed booking from ${overlapping[0].startTime} to ${overlapping[0].endTime}.`
      );
    }
    return this.bookingRepo.create({
      id:             uuidv4(),
      roomId,
      title,
      organizerEmail,
      startTime,
      endTime,
      createdAt:      new Date().toISOString(),
    });
  }

  // ── List Bookings ────────────────────────────────────────────────────────
  listBookings({ roomId, from, to, limit, offset } = {}) {
    const filters = {};
    if (roomId) filters.roomId = String(roomId);
    if (from)   { if (isNaN(new Date(from))) throw new ValidationError('from is not valid ISO-8601.'); filters.from = from; }
    if (to)     { if (isNaN(new Date(to)))   throw new ValidationError('to is not valid ISO-8601.');   filters.to   = to;   }

    filters.limit  = Math.min(Math.max(1, parseInt(limit  || 20, 10)), 100);
    filters.offset = Math.max(0, parseInt(offset || 0,  10));
    return this.bookingRepo.list(filters);
  }

  // ── Cancel Booking ───────────────────────────────────────────────────────
  cancelBooking(id) {
    const booking = this.bookingRepo.findById(id);
    if (!booking) throw new NotFoundError(`Booking "${id}" not found.`);

    if (booking.status === 'cancelled') return booking;  // no-op

    const now   = Date.now();
    const start = new Date(booking.startTime).getTime();
    if (now > start - CANCEL_GRACE_MS) {
      throw new BusinessRuleError(
        'Cancellation is only allowed up to 1 hour before the booking start time.'
      );
    }

    return this.bookingRepo.updateStatus(id, 'cancelled');
  }
}

module.exports = BookingService;
