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

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

export default router;