"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const email_service_1 = require("../services/email.service");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
router.post("/register", authController_1.register);
router.post("/login", authController_1.login);
router.post("/verify-email", authController_1.verifyEmail);
router.post("/resend-code", authController_1.resendVerificationCode);
router.post("/forgot-password", authController_1.forgotPassword);
router.post("/reset-password", authController_1.resetPassword);
router.post("/logout", auth_1.auth, authController_1.logout);
router.get("/me", auth_1.auth, authController_1.me);
// Test email endpoint
router.post("/test-email", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: "Email required" });
        }
        logger_1.logger.info(`Testing email service with recipient: ${email}`);
        // Check environment variables
        const envCheck = {
            EMAIL_USER: !!process.env.EMAIL_USER,
            EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
            EMAIL_HOST: process.env.EMAIL_HOST || 'not set',
            EMAIL_PORT: process.env.EMAIL_PORT || 'not set',
            NODE_ENV: process.env.NODE_ENV
        };
        logger_1.logger.info('Environment check:', envCheck);
        // Try to send test email
        const sent = await email_service_1.emailService.sendVerificationCode(email, "123456", "Test User");
        res.json({
            success: true,
            emailSent: sent,
            envCheck,
            message: sent ? "Test email sent successfully!" : "Email service not configured or failed to send"
        });
    }
    catch (error) {
        logger_1.logger.error('Test email error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
