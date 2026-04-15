'use strict';

class RoomRepository {
  constructor(db) {
    this.db = db;
  }

  create({ id, name, capacity, floor, amenities }) {
    this.db.prepare(`
      INSERT INTO rooms (id, name, capacity, floor, amenities)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, capacity, floor, JSON.stringify(amenities));
    return this.findById(id);
  }

  findById(id) {
    const row = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    return row ? this._deserialize(row) : null;
  }

  findByName(name) {
    const row = this.db.prepare(
      'SELECT * FROM rooms WHERE name = ? COLLATE NOCASE'
    ).get(name);
    return row ? this._deserialize(row) : null;
  }

  list({ minCapacity, amenity } = {}) {
    let sql  = 'SELECT * FROM rooms WHERE 1=1';
    const params = [];

    if (minCapacity !== undefined) {
      sql += ' AND capacity >= ?';
      params.push(minCapacity);
    }

    const rows = this.db.prepare(sql).all(...params);
    let rooms  = rows.map(this._deserialize);

    // Amenity filter — done in JS since amenities is a JSON column
    if (amenity) {
      const needle = amenity.toLowerCase();
      rooms = rooms.filter(r =>
        r.amenities.some(a => a.toLowerCase() === needle)
      );
    }
    return rooms;
  }

  _deserialize(row) {
    return {
      id:        row.id,
      name:      row.name,
      capacity:  row.capacity,
      floor:     row.floor,
      amenities: JSON.parse(row.amenities),
    };
  }
}

module.exports = RoomRepository;
