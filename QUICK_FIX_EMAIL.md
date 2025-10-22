# 🚨 QUICK FIX - Email OTP Not Sending

## Problem
Your `.env` file is missing email configuration, so OTP verification emails cannot be sent.

## ⚡ Quick Fix (5 minutes)

### Step 1: Edit Your .env File
Open `Hope-backend/.env` in a text editor and add these lines at the end:

```env
# Email Service Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### Step 2: Get Gmail App Password

1. **Go to**: https://myaccount.google.com/apppasswords
   - You may need to enable 2-Factor Authentication first if not already enabled

2. **Create App Password**:
   - Select "Mail" and "Other (Custom name)"
   - Name it: "Hope Therapy Backend"
   - Click "Generate"

3. **Copy the 16-character password** (looks like: `xxxx xxxx xxxx xxxx`)

4. **Paste into .env** (remove spaces):
   ```env
   EMAIL_PASSWORD=xxxxxxxxxxxxxxxx
   ```

### Step 3: Update Your Email
Replace `your-email@gmail.com` with your actual Gmail address:
```env
EMAIL_USER=youractual@gmail.com
```

### Step 4: Restart Your Backend
```bash
# If running locally:
npm run dev

# If on a platform (Render, Railway, etc.):
# Redeploy or restart the service
```

## ✅ Verification

After restart, check your backend logs. You should see:
```
✅ Email service initialized successfully
📧 Using: youractual@gmail.com via smtp.gmail.com:587
```

Instead of:
```
❌ EMAIL SERVICE NOT CONFIGURED - OTP EMAILS WILL NOT BE SENT!
```

## 🧪 Test It

1. Try to register a new account
2. Check backend logs for: `✅ Email sent successfully to...`
3. Check your email inbox (and spam folder)

## 🆘 Still Not Working?

Check the detailed guide: `EMAIL_SETUP_GUIDE.md`

Common issues:
- ❌ Using regular password instead of App Password
- ❌ 2FA not enabled on Gmail
- ❌ Spaces in the app password
- ❌ Wrong email address

## 📝 Example .env Section

```env
# Email Service Configuration
EMAIL_USER=john.doe@gmail.com
EMAIL_PASSWORD=abcdeFGHijklMNOP  # 16 chars, no spaces
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

## 🔒 Security Note
- Never commit `.env` to Git
- `.env` is already in `.gitignore`
- Use different credentials for dev and production

