'use strict';

const { v4: uuidv4 }      = require('uuid');
const { ValidationError } = require('../utils/errors');
const { ConflictError }   = require('../utils/errors');

class RoomService {
  constructor(roomRepository) {
    this.roomRepo = roomRepository;
  }

  createRoom({ name, capacity, floor, amenities = [] }) {
    // Validate
    if (!name || typeof name !== 'string' || !name.trim())
      throw new ValidationError('name is required and must be a non-empty string.');
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new ValidationError('capacity must be a positive integer.');
    if (typeof floor !== 'number' || !Number.isInteger(floor))
      throw new ValidationError('floor must be an integer.');
    if (!Array.isArray(amenities) || amenities.some(a => typeof a !== 'string'))
      throw new ValidationError('amenities must be an array of strings.');

    // Uniqueness
    if (this.roomRepo.findByName(name.trim()))
      throw new ConflictError(`A room named "${name.trim()}" already exists.`);

    return this.roomRepo.create({
      id:        uuidv4(),
      name:      name.trim(),
      capacity,
      floor,
      amenities: amenities.map(a => a.trim()),
    });
  }

  listRooms({ minCapacity, amenity } = {}) {
    const filters = {};
    if (minCapacity !== undefined) {
      const mc = Number(minCapacity);
      if (!Number.isInteger(mc) || mc < 1)
        throw new ValidationError('minCapacity must be a positive integer.');
      filters.minCapacity = mc;
    }
    if (amenity !== undefined) filters.amenity = amenity;
    return this.roomRepo.list(filters);
  }

  getRoom(id) {
    const room = this.roomRepo.findById(id);
    if (!room) throw new require('../utils/errors').NotFoundError(`Room "${id}" not found.`);
    return room;
  }
}

module.exports = RoomService;
