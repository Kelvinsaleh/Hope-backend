import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

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

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "254Universale"
    ) as any;
    
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
