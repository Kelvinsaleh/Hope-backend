import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;
    const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const emailPort = parseInt(process.env.EMAIL_PORT || '587');

    if (!emailUser || !emailPass) {
      logger.warn('Email service not configured. EMAIL_USER and EMAIL_PASSWORD environment variables are required.');
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort,
        secure: emailPort === 465, // true for 465, false for other ports
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured. Skipping email send.');
      // In development, log the email content
      if (process.env.NODE_ENV === 'development') {
        logger.info('Development mode - Email would have been sent:');
        logger.info(`To: ${options.to}`);
        logger.info(`Subject: ${options.subject}`);
        logger.info(`Content: ${options.text || options.html}`);
      }
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"Hope Therapy" <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      logger.info(`Email sent successfully to ${options.to}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  async sendVerificationCode(email: string, code: string, name: string): Promise<boolean> {
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

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
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

export const emailService = new EmailService();

