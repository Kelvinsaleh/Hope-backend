import express from "express";
import { 
  register, 
  login, 
  logout, 
  me, 
  verifyEmail, 
  resendVerificationCode,
  forgotPassword,
  resetPassword
} from "../controllers/authController";
import { auth } from "../middleware/auth";
import { emailService } from "../services/email.service";
import { logger } from "../utils/logger";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

// Test email endpoint
router.post("/test-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email required" });
    }
    
    logger.info(`Testing email service with recipient: ${email}`);
    
    // Check environment variables
    const envCheck = {
      EMAIL_USER: !!process.env.EMAIL_USER,
      EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
      EMAIL_HOST: process.env.EMAIL_HOST || 'not set',
      EMAIL_PORT: process.env.EMAIL_PORT || 'not set',
      NODE_ENV: process.env.NODE_ENV
    };
    
    logger.info('Environment check:', envCheck);
    
    // Try to send test email
    const sent = await emailService.sendVerificationCode(email, "123456", "Test User");
    
    res.json({
      success: true,
      emailSent: sent,
      envCheck,
      message: sent ? "Test email sent successfully!" : "Email service not configured or failed to send"
    });
  } catch (error) {
    logger.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;