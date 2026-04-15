'use strict';

class BookingRepository {
  constructor(db) {
    this.db = db;
  }

  create({ id, roomId, title, organizerEmail, startTime, endTime, createdAt }) {
    this.db.prepare(`
      INSERT INTO bookings (id, room_id, title, organizer_email, start_time, end_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `).run(id, roomId, title, organizerEmail, startTime, endTime, createdAt);
    return this.findById(id);
  }

  findById(id) {
    const row = this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    return row ? this._deserialize(row) : null;
  }

  /**
   * Find confirmed bookings that overlap [startTime, endTime) for a room.
   * Overlap: existing.start < newEnd  AND  existing.end > newStart
   */
  findOverlapping(roomId, startTime, endTime, excludeId = null) {
    let sql = `
      SELECT * FROM bookings
      WHERE  room_id = ?
        AND  status  = 'confirmed'
        AND  start_time < ?
        AND  end_time   > ?
    `;
    const params = [roomId, endTime, startTime];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    return this.db.prepare(sql).all(...params).map(this._deserialize);
  }

  list({ roomId, from, to, limit = 20, offset = 0 } = {}) {
    let sql    = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (roomId) { sql += ' AND room_id = ?';    params.push(roomId); }
    if (from)   { sql += ' AND end_time > ?';   params.push(from); }
    if (to)     { sql += ' AND start_time < ?'; params.push(to); }

    const total = this.db.prepare(
      sql.replace('SELECT *', 'SELECT COUNT(*) as cnt')
    ).get(...params).cnt;

    sql += ' ORDER BY start_time ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = this.db.prepare(sql).all(...params).map(this._deserialize);
    return { items, total, limit, offset };
  }

  /** Returns all confirmed bookings for a room that overlap [from, to] */
  findConfirmedInRange(roomId, from, to) {
    return this.db.prepare(`
      SELECT * FROM bookings
      WHERE  room_id = ?
        AND  status  = 'confirmed'
        AND  start_time < ?
        AND  end_time   > ?
      ORDER BY start_time
    `).all(roomId, to, from).map(this._deserialize);
  }

  updateStatus(id, status) {
    this.db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
    return this.findById(id);
  }

  _deserialize(row) {
    return {
      id:             row.id,
      roomId:         row.room_id,
      title:          row.title,
      organizerEmail: row.organizer_email,
      startTime:      row.start_time,
      endTime:        row.end_time,
      status:         row.status,
      createdAt:      row.created_at,
    };
  }
}

module.exports = BookingRepository;
