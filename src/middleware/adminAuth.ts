import { Request, Response, NextFunction } from "express";

// Admin email addresses
const ADMIN_EMAILS = [
  'knsalee@gmail.com'
];

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated first
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: "Authentication required" 
      });
    }

    // Check if user email is in admin list
    if (!ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(403).json({ 
        success: false,
        error: "Admin access required. This action is restricted to administrators only." 
      });
    }

    // User is admin, proceed
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({ 
      success: false,
      error: "Server error in admin authentication" 
    });
  }
}; 