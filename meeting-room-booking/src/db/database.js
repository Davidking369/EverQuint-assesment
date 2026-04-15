'use strict';

class SqlJsDb {
  constructor(sqlJsDb) { this._db = sqlJsDb; }

  prepare(sql) {
    const raw = this._db;
    return {
      run: (...args) => {
        const params = args.flat();
        const stmt = raw.prepare(sql);
        try { stmt.run(params); } finally { stmt.free(); }
      },
      get: (...args) => {
        const params = args.flat();
        const stmt = raw.prepare(sql);
        try {
          stmt.bind(params);
          if (!stmt.step()) return null;
          return stmt.getAsObject();
        } finally { stmt.free(); }
      },
      all: (...args) => {
        const params = args.flat();
        const stmt = raw.prepare(sql);
        try {
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally { stmt.free(); }
      },
    };
  }

  exec(sql)    { this._db.run(sql); }
  pragma(str)  { this._db.run(`PRAGMA ${str}`); }
  close()      { this._db.close(); }
}

let _db = null;

async function getDb() {
  if (_db) return _db;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  _db = new SqlJsDb(new SQL.Database());
  applySchema(_db);
  return _db;
}

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity >= 1),
      floor INTEGER NOT NULL, amenities TEXT NOT NULL DEFAULT '[]'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_name_ci ON rooms (name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL, title TEXT NOT NULL,
      organizer_email TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room_id, start_time, end_time, status);
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT NOT NULL, organizer_email TEXT NOT NULL,
      booking_id TEXT, status TEXT NOT NULL DEFAULT 'in_progress', created_at TEXT NOT NULL,
      PRIMARY KEY (idempotency_key, organizer_email)
    );
  `);
}

function createTestDb() {
  if (!createTestDb._SQL) throw new Error('Call await initTestEnv() first');
  const db = new SqlJsDb(new createTestDb._SQL.Database());
  applySchema(db);
  return db;
}

async function initTestEnv() {
  if (createTestDb._SQL) return;
  const initSqlJs = require('sql.js');
  createTestDb._SQL = await initSqlJs();
}

function resetDb() { _db = null; }

module.exports = { getDb, createTestDb, initTestEnv, resetDb };
