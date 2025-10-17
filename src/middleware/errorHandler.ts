import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      details: process.env.NODE_ENV === 'production' ? undefined : (err as any)?.stack,
    });
  }

  // Log unexpected errors
  logger.error("Unexpected error:", err);

  // Send generic error for unexpected errors
  return res.status(500).json({
    status: "error",
    message: "Something went wrong",
    details: process.env.NODE_ENV === 'production' ? undefined : (err as any)?.stack,
  });
};
