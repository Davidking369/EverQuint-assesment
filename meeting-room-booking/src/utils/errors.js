'use strict';

class AppError extends Error {
  constructor(type, message, statusCode) {
    super(message);
    this.name  = type;
    this.statusCode = statusCode;
  }
}

class ValidationError   extends AppError { constructor(msg) { super('ValidationError',   msg, 400); } }
class NotFoundError     extends AppError { constructor(msg) { super('NotFoundError',     msg, 404); } }
class ConflictError     extends AppError { constructor(msg) { super('ConflictError',     msg, 409); } }
class BusinessRuleError extends AppError { constructor(msg) { super('BusinessRuleError', msg, 400); } }

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, BusinessRuleError };
