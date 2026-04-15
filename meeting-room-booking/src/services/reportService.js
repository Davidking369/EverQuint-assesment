'use strict';

const { businessHoursBetween } = require('../utils/businessHours');
const { ValidationError }      = require('../utils/errors');

class ReportService {
  constructor(roomRepository, bookingRepository) {
    this.roomRepo    = roomRepository;
    this.bookingRepo = bookingRepository;
  }

  roomUtilization(from, to) {
    if (!from) throw new ValidationError('"from" is required.');
    if (!to)   throw new ValidationError('"to" is required.');

    const fromDate = new Date(from);
    const toDate   = new Date(to);
    if (isNaN(fromDate)) throw new ValidationError('"from" is not valid ISO-8601.');
    if (isNaN(toDate))   throw new ValidationError('"to" is not valid ISO-8601.');
    if (fromDate >= toDate) throw new ValidationError('"from" must be before "to".');

    const totalBizHours = businessHoursBetween(fromDate, toDate);
    const rooms         = this.roomRepo.list();

    return rooms.map(room => {
      const bookings = this.bookingRepo.findConfirmedInRange(
        room.id, fromDate.toISOString(), toDate.toISOString()
      );

      let bookedHours = 0;
      for (const b of bookings) {
        // Clamp booking to [from, to]
        const bStart = Math.max(new Date(b.startTime).getTime(), fromDate.getTime());
        const bEnd   = Math.min(new Date(b.endTime).getTime(),   toDate.getTime());
        bookedHours += Math.max(0, (bEnd - bStart) / 3_600_000);
      }

      const utilizationPercent = totalBizHours > 0
        ? parseFloat((bookedHours / totalBizHours).toFixed(4))
        : 0;

      return {
        roomId:              room.id,
        roomName:            room.name,
        totalBookingHours:   parseFloat(bookedHours.toFixed(4)),
        utilizationPercent,
      };
    });
  }
}

module.exports = ReportService;
