'use strict';

// ── Room Controller ──────────────────────────────────────────────────────────
class RoomController {
  constructor(roomService) {
    this.roomService = roomService;
  }

  create(req, res, next) {
    try {
      const room = this.roomService.createRoom(req.body);
      res.status(201).json(room);
    } catch (err) { next(err); }
  }

  list(req, res, next) {
    try {
      const rooms = this.roomService.listRooms(req.query);
      res.json(rooms);
    } catch (err) { next(err); }
  }
}

// ── Booking Controller ───────────────────────────────────────────────────────
class BookingController {
  constructor(bookingService) {
    this.bookingService = bookingService;
  }

  create(req, res, next) {
    try {
      const idempotencyKey = req.headers['idempotency-key'] || null;
      const booking = this.bookingService.createBooking(req.body, idempotencyKey);
      res.status(201).json(booking);
    } catch (err) { next(err); }
  }

  list(req, res, next) {
    try {
      const result = this.bookingService.listBookings(req.query);
      res.json(result);
    } catch (err) { next(err); }
  }

  cancel(req, res, next) {
    try {
      const booking = this.bookingService.cancelBooking(req.params.id);
      res.json(booking);
    } catch (err) { next(err); }
  }
}

// ── Report Controller ────────────────────────────────────────────────────────
class ReportController {
  constructor(reportService) {
    this.reportService = reportService;
  }

  roomUtilization(req, res, next) {
    try {
      const { from, to } = req.query;
      const report = this.reportService.roomUtilization(from, to);
      res.json(report);
    } catch (err) { next(err); }
  }
}

module.exports = { RoomController, BookingController, ReportController };
