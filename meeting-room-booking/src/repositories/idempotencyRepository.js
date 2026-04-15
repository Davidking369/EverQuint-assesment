'use strict';

class IdempotencyRepository {
  constructor(db) { this.db = db; }

  tryInsert(idempotencyKey, organizerEmail, now) {
    try {
      this.db.prepare(`
        INSERT INTO idempotency_keys (idempotency_key, organizer_email, status, created_at)
        VALUES (?, ?, 'in_progress', ?)
      `).run(idempotencyKey, organizerEmail, now);
      return { inserted: true };
    } catch (e) {
      // sql.js throws "UNIQUE constraint failed: ..." 
      if (/UNIQUE constraint/i.test(e.message)) {
        const record = this.findByKeyAndOrganizer(idempotencyKey, organizerEmail);
        return { inserted: false, record };
      }
      throw e;
    }
  }

  findByKeyAndOrganizer(key, organizerEmail) {
    return this.db.prepare(`
      SELECT * FROM idempotency_keys WHERE idempotency_key = ? AND organizer_email = ?
    `).get(key, organizerEmail);
  }

  markCompleted(key, organizerEmail, bookingId) {
    this.db.prepare(`
      UPDATE idempotency_keys SET status = 'completed', booking_id = ?
      WHERE idempotency_key = ? AND organizer_email = ?
    `).run(bookingId, key, organizerEmail);
  }

  markFailed(key, organizerEmail) {
    this.db.prepare(`
      UPDATE idempotency_keys SET status = 'failed'
      WHERE idempotency_key = ? AND organizer_email = ?
    `).run(key, organizerEmail);
  }
}

module.exports = IdempotencyRepository;
