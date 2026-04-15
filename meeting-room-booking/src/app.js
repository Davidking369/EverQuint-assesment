'use strict';

const express = require('express');
const { AppError } = require('./utils/errors');

const RoomRepository        = require('./repositories/roomRepository');
const BookingRepository     = require('./repositories/bookingRepository');
const IdempotencyRepository = require('./repositories/idempotencyRepository');
const RoomService           = require('./services/roomService');
const BookingService        = require('./services/bookingService');
const ReportService         = require('./services/reportService');
const { RoomController, BookingController, ReportController } = require('./controllers/controllers');

function createApp(db) {
  const roomRepo        = new RoomRepository(db);
  const bookingRepo     = new BookingRepository(db);
  const idempotencyRepo = new IdempotencyRepository(db);
  const roomService     = new RoomService(roomRepo);
  const bookingService  = new BookingService(roomRepo, bookingRepo, idempotencyRepo);
  const reportService   = new ReportService(roomRepo, bookingRepo);
  const roomCtrl        = new RoomController(roomService);
  const bookingCtrl     = new BookingController(bookingService);
  const reportCtrl      = new ReportController(reportService);

  const app = express();
  app.use(express.json());

  app.post('/rooms',                 (q,s,n) => roomCtrl.create(q,s,n));
  app.get ('/rooms',                 (q,s,n) => roomCtrl.list(q,s,n));
  app.post('/bookings',              (q,s,n) => bookingCtrl.create(q,s,n));
  app.get ('/bookings',              (q,s,n) => bookingCtrl.list(q,s,n));
  app.post('/bookings/:id/cancel',   (q,s,n) => bookingCtrl.cancel(q,s,n));
  app.get ('/reports/room-utilization', (q,s,n) => reportCtrl.roomUtilization(q,s,n));

  app.use((err, _req, res, _next) => {
    if (err instanceof AppError)
      return res.status(err.statusCode).json({ error: err.name, message: err.message });
    console.error(err);
    res.status(500).json({ error: 'InternalError', message: 'Unexpected error.' });
  });

  return app;
}

module.exports = { createApp };
