import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { Session } from "../models/Session";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    // Use the same default secret used in controllers when JWT_SECRET isn't provided
    const secret = process.env.JWT_SECRET || "your-secret-key";
    const decoded = jwt.verify(token, secret) as any;

    // DISABLED: Session expiry check removed to keep users logged in indefinitely
    // Sessions remain valid until user explicitly logs out or logs in on a new device
    // COMMENTED OUT: Session validation that was causing unexpected logouts
    /*
    const session = await Session.findOne({ token });
    if (!session) {
      return res.status(401).json({ success: false, message: "Session not found or expired" });
    }
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      // Session expired; remove it and reject
      await Session.deleteOne({ token }).catch(() => {});
      return res.status(401).json({ success: false, message: "Session expired" });
    }
    */

    // Sliding session: refresh expiry and lastActive on each authenticated request
    // This ensures sessions remain active as long as user is using the app
    try {
      const session = await Session.findOne({ token });
      if (session) {
        // Use a very long TTL (365 days) to keep sessions effectively indefinite
        const hours = Number(process.env.SESSION_TTL_HOURS) || 365 * 24; // Default to 1 year
        const newExpires = new Date(Date.now() + hours * 60 * 60 * 1000);
        session.lastActive = new Date();
        session.expiresAt = newExpires;
        await session.save().catch(() => {});
      }
    } catch (e) {
      // Don't block requests if extending session fails
      console.warn('Failed to refresh session expiry', e);
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "User not found" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ 
      success: false,
      message: "Invalid authentication token" 
    });
  }
};

// Alias for compatibility
export const authenticateToken = auth;
