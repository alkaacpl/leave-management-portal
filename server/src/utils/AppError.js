export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Authentication required.') {
    return new AppError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found.') {
    return new AppError(404, message);
  }

  static conflict(message, details) {
    return new AppError(409, message, details);
  }

  static unprocessable(message, details) {
    return new AppError(422, message, details);
  }
}
