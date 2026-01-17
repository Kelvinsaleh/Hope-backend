import { Request, Response } from "express";
import { User } from "../models/User";
import { Session } from "../models/Session";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { emailService } from "../services/email.service";
import { logger } from "../utils/logger";
import { isDBConnected, waitForDBConnection } from "../utils/db";

// Helper function to generate 6-digit OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ 
          success: false,
          message: "Name, email, and password are required." 
        });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // If user exists but not verified, allow re-sending verification
      if (!existingUser.isEmailVerified) {
        // Generate new OTP
        const verificationCode = generateOTP();
        const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        existingUser.verificationCode = verificationCode;
        existingUser.verificationCodeExpiry = verificationCodeExpiry;
        
        // Update password if provided
        if (password) {
          existingUser.password = await bcrypt.hash(password, 10);
        }
        
        await existingUser.save();
        
        // Send verification email
        const emailSent = await emailService.sendVerificationCode(email, verificationCode, name);
        logger.info(`Verification email ${emailSent ? 'sent' : 'failed'} for existing unverified user: ${email}`);
        
        const response: any = {
          success: true,
          message: emailSent
            ? "Verification code sent to your email. Please verify your account."
            : "Email service is currently unavailable.",
          requiresVerification: true,
          userId: existingUser._id,
        };

        // In development mode, include the OTP in the response when email fails
        if (process.env.NODE_ENV === 'development' && !emailSent) {
          response.devOTP = verificationCode;
          response.message = "Verification code generated! (Dev Mode: Email not sent, use devOTP below)";
          logger.info(`[DEV MODE] OTP for ${email}: ${verificationCode}`);
        }
        
        return res.status(200).json(response);
      }
      
      return res.status(409).json({ 
        success: false,
        message: "Email already in use." 
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate verification code
    const verificationCode = generateOTP();
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Create user (not verified yet)
    const user = new User({ 
      name, 
      email, 
      password: hashedPassword,
      isEmailVerified: false,
      verificationCode,
      verificationCodeExpiry
    });
    await user.save();
    
    // Send verification email
    const emailSent = await emailService.sendVerificationCode(email, verificationCode, name);
    logger.info(`Verification email ${emailSent ? 'sent' : 'failed'} for new user: ${email}`);
    
    // Respond - Don't create session or token yet
    const response: any = {
      success: true,
      message: emailSent 
        ? "Registration successful! Please check your email for the verification code."
        : "Registration successful! Email service is currently unavailable.",
      requiresVerification: true,
      userId: user._id,
    };

    // In development mode, include the OTP in the response when email fails
    if (process.env.NODE_ENV === 'development' && !emailSent) {
      response.devOTP = verificationCode;
      response.message = "Registration successful! (Dev Mode: Email not sent, use devOTP below)";
      logger.info(`[DEV MODE] OTP for ${email}: ${verificationCode}`);
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ 
          success: false,
          message: "Email and password are required." 
        });
    }

    // Ensure MongoDB connection is ready before querying
    if (!isDBConnected()) {
      logger.warn('Database not connected, waiting for connection...');
      const connected = await waitForDBConnection(20000); // Wait up to 20 seconds
      
      if (!connected) {
        logger.error('Database connection timeout during login');
        return res.status(503).json({
          success: false,
          message: "Database connection unavailable. Please try again in a moment."
        });
      }
    }
    
    // Double-check connection is still valid before querying
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      }
    } catch (pingError) {
      logger.error('Database ping failed during login, connection may be stale');
      return res.status(503).json({
        success: false,
        message: "Database connection issue. Please try again in a moment."
      });
    }

    // Find user - with explicit error handling for connection issues
    let user;
    try {
      user = await User.findOne({ email }).maxTimeMS(5000); // 5 second query timeout
    } catch (dbError: any) {
      logger.error('Database query error during login:', dbError);
      
      // Check if it's a connection/timeout error
      if (dbError.message?.includes('buffering') || dbError.message?.includes('timeout')) {
        return res.status(503).json({
          success: false,
          message: "Database connection issue. Please try again in a moment."
        });
      }
      
      // Re-throw other errors to be caught by outer try-catch
      throw dbError;
    }
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "No account found for that email." 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password." 
      });
    }

    // Note: Email verification is encouraged but not required for login
    // Users can login even if not verified, but may have limited features

    // Generate JWT token with additional entropy to prevent duplicates
    // Use 1-year expiry to match session TTL for persistent login
    // Users stay logged in unless they explicitly logout or login on a new device
    const token = jwt.sign(
      { userId: user._id, timestamp: Date.now(), random: Math.random() },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "365d" } // 1 year to match session TTL
    );

    // Create session - delete all previous sessions for this user (force logout on other devices)
    // FIXED: Using a very long TTL (1 year) to keep sessions effectively indefinite
    // Sessions will only expire on explicit logout or new device login
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Set expiry to 1 year from now

    // Delete all previous sessions for this user
    await Session.deleteMany({ userId: user._id }).catch(() => {});

    const session = new Session({
      userId: user._id,
      token,
      expiresAt,
      deviceInfo: req.headers["user-agent"],
    });
    await session.save();

    // Respond with user data and token
    res.json({
      success: true,
      user: {
        _id: user._id,
        id: user._id, // Add id field for compatibility
        name: user.name,
        email: user.email,
        tier: user.trialEndsAt && new Date() < new Date(user.trialEndsAt) ? 'premium' : (user.subscription?.tier || 'free'),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        trialStartedAt: (user as any)?.trialStartedAt ? new Date((user as any).trialStartedAt).toISOString() : null,
        trialUsed: (user as any)?.trialUsed === true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Forgot password - Send reset email with token
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal that user doesn't exist (security best practice)
      return res.status(200).json({
        success: true,
        message: "If that email exists, a password reset link has been sent."
      });
    }

    // Generate reset token (6-digit OTP)
    const resetToken = generateOTP();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = resetTokenExpiry;
    await user.save();

    // Send reset email
    const emailSent = await emailService.sendPasswordResetCode(email, resetToken, user.name);
    logger.info(`Password reset email ${emailSent ? 'sent' : 'failed'} for user: ${email}`);

    const response: any = {
      success: true,
      message: emailSent
        ? "Password reset code sent to your email."
        : "Email service temporarily unavailable."
    };

    // In development mode, include the reset token in the response when email fails
    if (process.env.NODE_ENV === 'development' && !emailSent) {
      response.devResetToken = resetToken;
      response.message = "Password reset code generated! (Dev Mode: Email not sent, use devResetToken below)";
      logger.info(`[DEV MODE] Reset token for ${email}: ${resetToken}`);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request"
    });
  }
};

// Reset password - Verify token and update password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "Token, password, and confirmPassword are required"
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "Passwords do not match"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long"
      });
    }

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() } // Token not expired
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset token"
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    logger.info(`Password successfully reset for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password"
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (token) {
      await Session.deleteOne({ token });
    }
    res.json({ 
      success: true,
      message: "Logged out successfully" 
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Add me endpoint
export const me = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt).toISOString() : null;
    const trialStartedAt = (user as any)?.trialStartedAt ? new Date((user as any).trialStartedAt).toISOString() : null;
    const trialIsActive = trialEndsAt ? new Date(trialEndsAt) > new Date() : false;
    const derivedTier = trialIsActive ? 'premium' : (user.subscription?.tier || 'free');

    const responseUser = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tier: derivedTier,
      subscription: user.subscription,
      trialEndsAt,
      trialStartedAt,
      trialUsed: (user as any)?.trialUsed === true,
    };

    res.json({ 
      success: true,
      ...responseUser,
      user: responseUser,
      trial: {
        isActive: trialIsActive,
        trialStart: trialStartedAt,
        trialStartedAt,
        trialEndsAt,
        plan: user.subscription?.planId || 'trial'
      }
    });
  } catch (error) {
    console.error("Me endpoint error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Verify email with OTP
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({
        success: false,
        message: "User ID and verification code are required.",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified.",
      });
    }

    // Check if code exists
    if (!user.verificationCode || !user.verificationCodeExpiry) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new code.",
      });
    }

    // Check if code expired
    if (new Date() > user.verificationCodeExpiry) {
      return res.status(400).json({
        success: false,
        message: "Verification code expired. Please request a new code.",
        codeExpired: true,
      });
    }

    // Verify code
    if (user.verificationCode !== code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
      });
    }

    // Mark as verified
    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    
    // Activate 7-day premium trial for new users (only on first email verification)
    // Check if user is eligible for trial (new user, no previous trial, no premium subscription)
    if (!user.trialEndsAt && !user.subscription?.isActive) {
      // Check account age - only grant trial if account was created within last 7 days (to prevent abuse)
      const accountAge = Date.now() - new Date(user.createdAt).getTime();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      
      if (accountAge <= sevenDaysInMs) {
        // Abuse prevention checks
        let canActivateTrial = true;
        
        // 1. Check IP address - limit trials per IP (max 3 trials per IP in last 30 days)
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (clientIp) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const trialsFromSameIp = await User.countDocuments({
            trialEndsAt: { $exists: true, $gte: thirtyDaysAgo },
            // Store IP in a separate field or use a hash of IP + user agent
            // For simplicity, we'll check email domain and account creation patterns
          });
          
          // Check for suspicious patterns: multiple accounts from same email domain
          const emailDomain = user.email.split('@')[1];
          const accountsFromSameDomain = await User.countDocuments({
            email: new RegExp(`@${emailDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            createdAt: { $gte: thirtyDaysAgo }
          });
          
          // Block common disposable email domains
          const disposableEmailDomains = [
            'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
            'throwaway.email', 'temp-mail.org', 'fakeinbox.com', 'mohmal.com'
          ];
          
          if (disposableEmailDomains.some(domain => emailDomain.toLowerCase().includes(domain))) {
            canActivateTrial = false;
            logger.warn(`Trial activation blocked: disposable email domain detected for ${user.email}`);
          } else if (accountsFromSameDomain > 3) {
            // More than 3 accounts from same domain in last 30 days - suspicious
            canActivateTrial = false;
            logger.warn(`Trial activation blocked: too many accounts from same domain (${emailDomain})`);
          }
        }
        
        if (canActivateTrial) {
          // Grant 7-day trial
          const trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + 7);
          user.trialEndsAt = trialEndDate;
          
          logger.info(`7-day premium trial activated for new user: ${user.email} (trial ends: ${trialEndDate.toISOString()}, IP: ${clientIp})`);
        } else {
          logger.info(`Trial activation skipped for user: ${user.email} due to abuse prevention checks`);
        }
      }
    }
    
    await user.save();

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.name);

    // Generate JWT token with 1-year expiry for persistent login
    // Users stay logged in unless they explicitly logout or login on a new device
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "365d" } // 1 year to match session TTL
    );

    // Create session - FIXED: Using a very long TTL (1 year) for persistent sessions
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Set expiry to 1 year from now

    const session = new Session({
      userId: user._id,
      token,
      expiresAt,
      deviceInfo: req.headers["user-agent"],
    });
    await session.save();

    logger.info(`Email verified successfully for user: ${user.email}`);

    // Respond with token and user data
    res.json({
      success: true,
      message: "Email verified successfully! Welcome to Hope Therapy!",
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        tier: user.trialEndsAt && new Date() < new Date(user.trialEndsAt) ? 'premium' : (user.subscription?.tier || 'free'),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
      trialActivated: !!user.trialEndsAt && new Date() < new Date(user.trialEndsAt),
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Resend verification code
export const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        message: "User ID or email is required.",
      });
    }

    // Find user
    const user = userId 
      ? await User.findById(userId)
      : await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified.",
      });
    }

    // Generate new code
    const verificationCode = generateOTP();
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.verificationCode = verificationCode;
    user.verificationCodeExpiry = verificationCodeExpiry;
    await user.save();

    // Send verification email
    const emailSent = await emailService.sendVerificationCode(
      user.email,
      verificationCode,
      user.name
    );
    
    logger.info(`Verification code resent ${emailSent ? 'successfully' : 'failed'} for user: ${user.email}`);

    const response: any = {
      success: true,
      message: emailSent
        ? "Verification code sent to your email."
        : "Email service is currently unavailable.",
    };

    // In development mode, include the OTP in the response when email fails
    if (process.env.NODE_ENV === 'development' && !emailSent) {
      response.devOTP = verificationCode;
      response.message = "Verification code generated! (Dev Mode: Email not sent, use devOTP below)";
      logger.info(`[DEV MODE] Resent OTP for ${user.email}: ${verificationCode}`);
    }

    res.json(response);
  } catch (error) {
    console.error("Resend verification code error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
