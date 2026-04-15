# Meeting Room Booking Service

## Requirements
- Node.js >= 18
- npm

## Setup
```bash
npm install
```

## Run
```bash
npm start          # http://localhost:3000
PORT=8080 npm start
```

## Test
```bash
npm test                  # all tests
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only
```

## Quick API Tour

```bash
# Create a room
curl -X POST http://localhost:3000/rooms \
  -H 'Content-Type: application/json' \
  -d '{"name":"Boardroom","capacity":10,"floor":2,"amenities":["projector"]}'

# List rooms (optional filters: ?minCapacity=5&amenity=projector)
curl http://localhost:3000/rooms

# Create a booking
curl -X POST http://localhost:3000/bookings \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"<id>","title":"Standup","organizerEmail":"dev@co.com",
       "startTime":"2025-06-09T09:00:00Z","endTime":"2025-06-09T10:00:00Z"}'

# Idempotent booking
curl -X POST http://localhost:3000/bookings \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: unique-client-key-001' \
  -d '{"roomId":"<id>","title":"Standup","organizerEmail":"dev@co.com",
       "startTime":"2025-06-09T11:00:00Z","endTime":"2025-06-09T12:00:00Z"}'

# List bookings (?roomId=&from=&to=&limit=20&offset=0)
curl http://localhost:3000/bookings

# Cancel a booking
curl -X POST http://localhost:3000/bookings/<id>/cancel

# Utilization report
curl "http://localhost:3000/reports/room-utilization?from=2025-06-09T00:00:00Z&to=2025-06-13T23:59:59Z"
```

## Error Format
All errors return:
```json
{ "error": "ErrorType", "message": "Human-readable description" }
```
