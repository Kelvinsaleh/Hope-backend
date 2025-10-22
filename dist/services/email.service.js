"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../utils/logger");
class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.initialize();
    }
    initialize() {
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASSWORD;
        const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
        const emailPort = parseInt(process.env.EMAIL_PORT || '587');
        if (!emailUser || !emailPass) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('❌ EMAIL SERVICE NOT CONFIGURED - OTP EMAILS WILL NOT BE SENT!');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('');
            logger_1.logger.error('Required environment variables missing:');
            if (!emailUser)
                logger_1.logger.error('  ❌ EMAIL_USER is not set');
            if (!emailPass)
                logger_1.logger.error('  ❌ EMAIL_PASSWORD is not set');
            logger_1.logger.error('');
            logger_1.logger.error('📖 Setup Guide: See Hope-backend/EMAIL_SETUP_GUIDE.md');
            logger_1.logger.error('🔗 Quick Start: https://myaccount.google.com/apppasswords');
            logger_1.logger.error('');
            logger_1.logger.error('Add to your .env file:');
            logger_1.logger.error('  EMAIL_USER=your-email@gmail.com');
            logger_1.logger.error('  EMAIL_PASSWORD=your-16-char-app-password');
            logger_1.logger.error('  EMAIL_HOST=smtp.gmail.com');
            logger_1.logger.error('  EMAIL_PORT=587');
            logger_1.logger.error('');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.isConfigured = false;
            return;
        }
        try {
            this.transporter = nodemailer_1.default.createTransport({
                host: emailHost,
                port: emailPort,
                secure: emailPort === 465, // true for 465, false for other ports
                auth: {
                    user: emailUser,
                    pass: emailPass,
                },
                // Add connection timeout
                connectionTimeout: 10000,
                greetingTimeout: 10000,
            });
            this.isConfigured = true;
            logger_1.logger.info('✅ Email service initialized successfully');
            logger_1.logger.info(`📧 Using: ${emailUser} via ${emailHost}:${emailPort}`);
        }
        catch (error) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('❌ Failed to initialize email service');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('Error:', error?.message || error);
            logger_1.logger.error('');
            logger_1.logger.error('Common issues:');
            logger_1.logger.error('  1. Invalid EMAIL_PASSWORD (use App Password for Gmail)');
            logger_1.logger.error('  2. 2FA not enabled on Gmail account');
            logger_1.logger.error('  3. Incorrect SMTP host or port');
            logger_1.logger.error('  4. Firewall blocking SMTP connection');
            logger_1.logger.error('');
            logger_1.logger.error('📖 See EMAIL_SETUP_GUIDE.md for detailed instructions');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.isConfigured = false;
        }
    }
    async sendEmail(options) {
        if (!this.isConfigured || !this.transporter) {
            logger_1.logger.error(`❌ Cannot send email to ${options.to} - Email service not configured`);
            logger_1.logger.error('📧 Subject: ' + options.subject);
            // In development, log the email content
            if (process.env.NODE_ENV === 'development') {
                logger_1.logger.info('━━━ Development mode - Email would have been sent ━━━');
                logger_1.logger.info(`To: ${options.to}`);
                logger_1.logger.info(`Subject: ${options.subject}`);
                logger_1.logger.info(`Content: ${options.text || options.html}`);
                logger_1.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }
            return false;
        }
        try {
            logger_1.logger.info(`📤 Attempting to send email to ${options.to}...`);
            const info = await this.transporter.sendMail({
                from: `"Hope Therapy" <${process.env.EMAIL_USER}>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
            });
            logger_1.logger.info(`✅ Email sent successfully to ${options.to}`);
            logger_1.logger.info(`📬 Message ID: ${info.messageId}`);
            logger_1.logger.info(`📊 Response: ${info.response}`);
            return true;
        }
        catch (error) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error(`❌ Failed to send email to ${options.to}`);
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('Error details:', error);
            if (error.code) {
                logger_1.logger.error(`Error code: ${error.code}`);
            }
            if (error.response) {
                logger_1.logger.error(`SMTP Response: ${error.response}`);
            }
            // Provide helpful error messages
            if (error.code === 'EAUTH') {
                logger_1.logger.error('');
                logger_1.logger.error('🔐 Authentication failed. Common causes:');
                logger_1.logger.error('  1. Incorrect EMAIL_PASSWORD (must use App Password for Gmail)');
                logger_1.logger.error('  2. 2FA not enabled on Gmail account');
                logger_1.logger.error('  3. App Password not generated correctly');
                logger_1.logger.error('');
                logger_1.logger.error('🔗 Generate Gmail App Password: https://myaccount.google.com/apppasswords');
            }
            else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
                logger_1.logger.error('');
                logger_1.logger.error('🌐 Connection timeout. Common causes:');
                logger_1.logger.error('  1. SMTP port blocked by firewall');
                logger_1.logger.error('  2. Incorrect EMAIL_HOST or EMAIL_PORT');
                logger_1.logger.error('  3. Network connectivity issues');
                logger_1.logger.error('');
                logger_1.logger.error(`Current config: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
            }
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            return false;
        }
    }
    async sendVerificationCode(email, code, name) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9fafb;
            border-radius: 12px;
            padding: 40px;
            margin: 20px 0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #6366f1;
            margin-bottom: 10px;
          }
          .code-box {
            background-color: white;
            border: 2px solid #6366f1;
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
          }
          .code {
            font-size: 42px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #6366f1;
            font-family: 'Courier New', monospace;
          }
          .info {
            color: #666;
            font-size: 14px;
            margin-top: 20px;
          }
          .warning {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">✨ Hope Therapy</div>
            <p>Welcome! We're glad you're here.</p>
          </div>
          
          <h2>Hello ${name}!</h2>
          <p>Thank you for signing up for Hope Therapy. To complete your registration, please verify your email address using the code below:</p>
          
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="info">This code will expire in 10 minutes</div>
          </div>
          
          <p>Enter this code in the verification page to activate your account and start your journey to better mental wellness.</p>
          
          <div class="warning">
            <strong>⚠️ Security Note:</strong> Never share this code with anyone. Hope Therapy will never ask you for this code via phone or email.
          </div>
          
          <p>If you didn't create an account with Hope Therapy, you can safely ignore this email.</p>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Hope Therapy. All rights reserved.</p>
            <p>Your partner in mental wellness and growth.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        const text = `
      Hello ${name}!
      
      Thank you for signing up for Hope Therapy. To complete your registration, please verify your email address using the code below:
      
      Verification Code: ${code}
      
      This code will expire in 10 minutes.
      
      If you didn't create an account with Hope Therapy, you can safely ignore this email.
      
      Best regards,
      Hope Therapy Team
    `;
        return this.sendEmail({
            to: email,
            subject: 'Verify Your Hope Therapy Account',
            html,
            text,
        });
    }
    async sendWelcomeEmail(email, name) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 40px;
            color: white;
          }
          .content {
            background-color: white;
            color: #333;
            border-radius: 8px;
            padding: 30px;
            margin-top: 20px;
          }
          .feature {
            margin: 20px 0;
            padding: 15px;
            background-color: #f9fafb;
            border-radius: 6px;
          }
          .cta-button {
            display: inline-block;
            background-color: #6366f1;
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            margin: 20px 0;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 style="text-align: center; margin: 0;">🎉 Welcome to Hope Therapy!</h1>
          <p style="text-align: center; margin-top: 10px; opacity: 0.9;">Your journey to better mental wellness starts here</p>
          
          <div class="content">
            <h2>Hi ${name}!</h2>
            <p>We're thrilled to have you join our community. Hope Therapy is your personal mental wellness companion, designed to support you every step of the way.</p>
            
            <h3>What you can do now:</h3>
            
            <div class="feature">
              <strong>💬 Start a Therapy Session</strong>
              <p>Connect with our AI therapist for supportive, judgment-free conversations anytime you need.</p>
            </div>
            
            <div class="feature">
              <strong>🧘 Explore Guided Meditations</strong>
              <p>Access our library of calming meditation sessions to reduce stress and improve focus.</p>
            </div>
            
            <div class="feature">
              <strong>📝 Track Your Mood</strong>
              <p>Monitor your emotional well-being and gain insights into your mental health patterns.</p>
            </div>
            
            <div class="feature">
              <strong>📖 Journal Your Thoughts</strong>
              <p>Express yourself freely in a private, secure journaling space.</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'https://ai-therapist-agent-theta.vercel.app'}" class="cta-button">Get Started Now</a>
            </div>
            
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              Remember, taking care of your mental health is a sign of strength, not weakness. We're here to support you every day.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
        const text = `
      Welcome to Hope Therapy, ${name}!
      
      We're thrilled to have you join our community. Hope Therapy is your personal mental wellness companion.
      
      What you can do now:
      - Start a Therapy Session: Connect with our AI therapist anytime
      - Explore Guided Meditations: Access calming meditation sessions
      - Track Your Mood: Monitor your emotional well-being
      - Journal Your Thoughts: Express yourself in a private space
      
      Get started now at ${process.env.FRONTEND_URL || 'https://ai-therapist-agent-theta.vercel.app'}
      
      Best regards,
      Hope Therapy Team
    `;
        return this.sendEmail({
            to: email,
            subject: '🎉 Welcome to Hope Therapy!',
            html,
            text,
        });
    }
}
exports.emailService = new EmailService();
