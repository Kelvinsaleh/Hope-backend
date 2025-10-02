"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
// Admin email addresses
const ADMIN_EMAILS = [
    'knsalee@gmail.com'
];
const requireAdmin = (req, res, next) => {
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
    }
    catch (error) {
        console.error("Admin auth middleware error:", error);
        res.status(500).json({
            success: false,
            error: "Server error in admin authentication"
        });
    }
};
exports.requireAdmin = requireAdmin;
