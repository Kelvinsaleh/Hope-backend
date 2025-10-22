# Email Service Setup Guide - CRITICAL FOR OTP EMAILS

## ⚠️ Current Issue
Your OTP emails are not being sent because the email service is not configured in your `.env` file.

## 🔧 Quick Fix

Add these lines to your `Hope-backend/.env` file:

```env
# Email Service Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

## 📧 Setting Up Gmail (Recommended)

### Step 1: Enable 2-Factor Authentication
1. Go to https://myaccount.google.com/security
2. Enable "2-Step Verification" if not already enabled

### Step 2: Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and "Other (Custom name)"
3. Name it "Hope Therapy Backend"
4. Click "Generate"
5. Copy the 16-character password (it will look like: `xxxx xxxx xxxx xxxx`)

### Step 3: Update .env File
```env
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASSWORD=xxxxxxxxxxxxxxxx  # (paste the 16-char password, remove spaces)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### Step 4: Restart Your Backend
After updating the `.env` file, restart your backend server:
```bash
npm run dev
# or for production
npm start
```

## 🌐 Other Email Providers

### Outlook/Office 365
```env
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-outlook-password
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
```

### Yahoo Mail
```env
EMAIL_USER=your-email@yahoo.com
EMAIL_PASSWORD=your-yahoo-app-password
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
```

### SendGrid (Recommended for Production)
```env
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
```

### Custom SMTP Server
```env
EMAIL_USER=your-smtp-username
EMAIL_PASSWORD=your-smtp-password
EMAIL_HOST=your-smtp-host.com
EMAIL_PORT=587  # or 465 for SSL
```

## ✅ Verification

After configuration, the backend logs should show:
```
Email service initialized successfully
```

Instead of:
```
Email service not configured. EMAIL_USER and EMAIL_PASSWORD environment variables are required.
```

## 🚨 Common Issues

### Issue: "Invalid login" error
- **Solution**: Make sure you're using an App Password, not your regular Gmail password
- For Gmail, 2FA must be enabled to generate App Passwords

### Issue: "Less secure app access"
- **Solution**: Use App Passwords instead of enabling "Less secure apps"
- Google deprecated "Less secure apps" in May 2022

### Issue: Emails going to spam
- **Solution**: 
  - Add a proper FROM name in the email service
  - Set up SPF, DKIM records if using custom domain
  - Consider using a dedicated email service like SendGrid

### Issue: Connection timeout
- **Solution**: 
  - Check if port 587 is allowed in your firewall
  - Try port 465 with `secure: true` option
  - Verify SMTP host is correct

## 📝 Testing

After setup, test by:
1. Attempting to register a new account
2. Check backend logs for "Email sent successfully"
3. Check your email inbox (and spam folder)

## 🔒 Security Notes

1. **Never commit** the `.env` file to Git
2. Use different credentials for development and production
3. Rotate App Passwords periodically
4. Consider using environment variable management services in production (Railway, Render, etc.)

## 💡 Production Recommendations

For production environments, consider using:
- **SendGrid**: Free tier includes 100 emails/day
- **AWS SES**: Pay-as-you-go, very reliable
- **Mailgun**: Good for transactional emails
- **Postmark**: Excellent deliverability

These services provide:
- Better deliverability
- Email tracking
- Analytics
- Higher sending limits
- Better spam handling

