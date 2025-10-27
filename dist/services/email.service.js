"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const resend_1 = require("resend");
const logger_1 = require("../utils/logger");
class EmailService {
    constructor() {
        this.resend = null;
        this.isConfigured = false;
        this.fromEmail = '';
        this.initialize();
    }
    initialize() {
        const resendApiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.FROM_EMAIL || 'noreply@hope-therapy.com';
        if (!resendApiKey) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('❌ RESEND API KEY NOT CONFIGURED - OTP EMAILS WILL NOT BE SENT!');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('');
            logger_1.logger.error('Required environment variables missing:');
            logger_1.logger.error('  ❌ RESEND_API_KEY is not set');
            logger_1.logger.error('');
            logger_1.logger.error('📖 Setup Guide:');
            logger_1.logger.error('  1. Sign up at https://resend.com/');
            logger_1.logger.error('  2. Get your API key from the dashboard');
            logger_1.logger.error('  3. Add to Render environment variables:');
            logger_1.logger.error('     RESEND_API_KEY=re_your_api_key_here');
            logger_1.logger.error('     FROM_EMAIL=noreply@yourdomain.com');
            logger_1.logger.error('');
            logger_1.logger.error('🔗 Resend Dashboard: https://resend.com/api-keys');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.isConfigured = false;
            return;
        }
        try {
            this.resend = new resend_1.Resend(resendApiKey);
            this.fromEmail = fromEmail;
            this.isConfigured = true;
            logger_1.logger.info('✅ Resend email service initialized successfully');
            logger_1.logger.info(`📧 Using: ${fromEmail} via Resend API`);
        }
        catch (error) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('❌ Failed to initialize Resend email service');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('Error:', error?.message || error);
            logger_1.logger.error('');
            logger_1.logger.error('Common issues:');
            logger_1.logger.error('  1. Invalid RESEND_API_KEY');
            logger_1.logger.error('  2. API key not activated');
            logger_1.logger.error('  3. Domain not verified (if using custom domain)');
            logger_1.logger.error('');
            logger_1.logger.error('🔗 Check your API key at: https://resend.com/api-keys');
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.isConfigured = false;
        }
    }
    async sendEmail(options) {
        if (!this.isConfigured || !this.resend) {
            logger_1.logger.error(`❌ Cannot send email to ${options.to} - Resend service not configured`);
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
            const { data, error } = await this.resend.emails.send({
                from: `"Hope Therapy" <${this.fromEmail}>`,
                to: [options.to],
                subject: options.subject,
                text: options.text,
                html: options.html,
            });
            if (error) {
                throw new Error(`Resend API error: ${error.message}`);
            }
            logger_1.logger.info(`✅ Email sent successfully to ${options.to}`);
            logger_1.logger.info(`📬 Message ID: ${data?.id}`);
            return true;
        }
        catch (error) {
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error(`❌ Failed to send email to ${options.to}`);
            logger_1.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger_1.logger.error('Error details:', error);
            if (error.message) {
                logger_1.logger.error(`Error message: ${error.message}`);
            }
            // Provide helpful error messages
            if (error.message?.includes('Invalid API key')) {
                logger_1.logger.error('');
                logger_1.logger.error('🔐 Invalid API key. Common causes:');
                logger_1.logger.error('  1. Incorrect RESEND_API_KEY');
                logger_1.logger.error('  2. API key not activated');
                logger_1.logger.error('  3. API key expired or revoked');
                logger_1.logger.error('');
                logger_1.logger.error('🔗 Check your API key at: https://resend.com/api-keys');
            }
            else if (error.message?.includes('domain')) {
                logger_1.logger.error('');
                logger_1.logger.error('🌐 Domain verification issue. Common causes:');
                logger_1.logger.error('  1. Domain not verified in Resend');
                logger_1.logger.error('  2. DNS records not properly configured');
                logger_1.logger.error('  3. Using unverified domain in FROM_EMAIL');
                logger_1.logger.error('');
                logger_1.logger.error('🔗 Verify domain at: https://resend.com/domains');
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
    async sendPasswordResetCode(email, code, name) {
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
            border: 2px solid #ef4444;
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
          }
          .code {
            font-size: 42px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #ef4444;
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
            <p>Password Reset Request</p>
          </div>
          
          <h2>Hello ${name}!</h2>
          <p>We received a request to reset your Hope Therapy account password. Use the code below to reset your password:</p>
          
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="info">This code will expire in 15 minutes</div>
          </div>
          
          <p>Enter this code on the password reset page to create a new password.</p>
          
          <div class="warning">
            <strong>⚠️ Security Note:</strong> If you didn't request a password reset, please ignore this email. Your account is still secure.
          </div>
          
          <p>Never share this code with anyone. Hope Therapy will never ask you for this code via phone or email.</p>
          
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
      
      We received a request to reset your Hope Therapy account password. Use the code below to reset your password:
      
      Reset Code: ${code}
      
      This code will expire in 15 minutes.
      
      If you didn't request a password reset, please ignore this email. Your account is still secure.
      
      Best regards,
      Hope Therapy Team
    `;
        return this.sendEmail({
            to: email,
            subject: 'Reset Your Hope Therapy Password',
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
