"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendVerificationCode = exports.verifyEmail = exports.me = exports.logout = exports.login = exports.register = void 0;
const User_1 = require("../models/User");
const Session_1 = require("../models/Session");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const email_service_1 = require("../services/email.service");
const logger_1 = require("../utils/logger");
// Helper function to generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
const register = async (req, res) => {
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
        const existingUser = await User_1.User.findOne({ email });
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
                    existingUser.password = await bcryptjs_1.default.hash(password, 10);
                }
                await existingUser.save();
                // Send verification email
                const emailSent = await email_service_1.emailService.sendVerificationCode(email, verificationCode, name);
                logger_1.logger.info(`Verification email ${emailSent ? 'sent' : 'failed'} for existing unverified user: ${email}`);
                const response = {
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
                    logger_1.logger.info(`[DEV MODE] OTP for ${email}: ${verificationCode}`);
                }
                return res.status(200).json(response);
            }
            return res.status(409).json({
                success: false,
                message: "Email already in use."
            });
        }
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // Generate verification code
        const verificationCode = generateOTP();
        const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        // Create user (not verified yet)
        const user = new User_1.User({
            name,
            email,
            password: hashedPassword,
            isEmailVerified: false,
            verificationCode,
            verificationCodeExpiry
        });
        await user.save();
        // Send verification email
        const emailSent = await email_service_1.emailService.sendVerificationCode(email, verificationCode, name);
        logger_1.logger.info(`Verification email ${emailSent ? 'sent' : 'failed'} for new user: ${email}`);
        // Respond - Don't create session or token yet
        const response = {
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
            logger_1.logger.info(`[DEV MODE] OTP for ${email}: ${verificationCode}`);
        }
        res.status(201).json(response);
    }
    catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
exports.register = register;
const login = async (req, res) => {
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
        // Find user
        const user = await User_1.User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }
        // Verify password
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }
        // Check if email is verified
        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email before logging in.",
                requiresVerification: true,
                userId: user._id,
            });
        }
        // Generate JWT token with additional entropy to prevent duplicates
        const token = jsonwebtoken_1.default.sign({ userId: user._id, timestamp: Date.now(), random: Math.random() }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "24h" });
        // Create session - delete any old sessions with same token first
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        // Safety: Delete any existing session with this token (prevents duplicate key error)
        await Session_1.Session.deleteOne({ token }).catch(() => { });
        const session = new Session_1.Session({
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
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            token,
            message: "Login successful",
        });
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
exports.login = login;
const logout = async (req, res) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");
        if (token) {
            await Session_1.Session.deleteOne({ token });
        }
        res.json({
            success: true,
            message: "Logged out successfully"
        });
    }
    catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
exports.logout = logout;
// Add me endpoint
const me = async (req, res) => {
    try {
        res.json({
            success: true,
            user: {
                _id: req.user._id,
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                createdAt: req.user.createdAt,
                updatedAt: req.user.updatedAt,
            }
        });
    }
    catch (error) {
        console.error("Me endpoint error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
exports.me = me;
// Verify email with OTP
const verifyEmail = async (req, res) => {
    try {
        const { userId, code } = req.body;
        if (!userId || !code) {
            return res.status(400).json({
                success: false,
                message: "User ID and verification code are required.",
            });
        }
        // Find user
        const user = await User_1.User.findById(userId);
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
        await user.save();
        // Send welcome email
        await email_service_1.emailService.sendWelcomeEmail(user.email, user.name);
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "24h" });
        // Create session
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        const session = new Session_1.Session({
            userId: user._id,
            token,
            expiresAt,
            deviceInfo: req.headers["user-agent"],
        });
        await session.save();
        logger_1.logger.info(`Email verified successfully for user: ${user.email}`);
        // Respond with token and user data
        res.json({
            success: true,
            message: "Email verified successfully! Welcome to Hope Therapy!",
            user: {
                _id: user._id,
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            token,
        });
    }
    catch (error) {
        console.error("Email verification error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.verifyEmail = verifyEmail;
// Resend verification code
const resendVerificationCode = async (req, res) => {
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
            ? await User_1.User.findById(userId)
            : await User_1.User.findOne({ email });
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
        const emailSent = await email_service_1.emailService.sendVerificationCode(user.email, verificationCode, user.name);
        logger_1.logger.info(`Verification code resent ${emailSent ? 'successfully' : 'failed'} for user: ${user.email}`);
        const response = {
            success: true,
            message: emailSent
                ? "Verification code sent to your email."
                : "Email service is currently unavailable.",
        };
        // In development mode, include the OTP in the response when email fails
        if (process.env.NODE_ENV === 'development' && !emailSent) {
            response.devOTP = verificationCode;
            response.message = "Verification code generated! (Dev Mode: Email not sent, use devOTP below)";
            logger_1.logger.info(`[DEV MODE] Resent OTP for ${user.email}: ${verificationCode}`);
        }
        res.json(response);
    }
    catch (error) {
        console.error("Resend verification code error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.resendVerificationCode = resendVerificationCode;
