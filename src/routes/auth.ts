import express from "express";
import { 
  register, 
  login, 
  logout, 
  me, 
  verifyEmail, 
  resendVerificationCode 
} from "../controllers/authController";
import { auth } from "../middleware/auth";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendVerificationCode);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

export default router;