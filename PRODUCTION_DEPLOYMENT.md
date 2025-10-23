# 🚀 Production Deployment Guide

This guide covers deploying the Hope AI Therapy Backend to production (Render.com).

---

## 📋 Prerequisites

- [x] Code pushed to GitHub
- [x] Render.com account
- [x] MongoDB Atlas database
- [x] Gmail App Password (for email service)
- [x] Gemini API Key
- [x] Paystack API Keys

---

## 🔧 Environment Variables for Production

### Required Environment Variables on Render

When deploying to Render, add these environment variables:

```env
# Environment
NODE_ENV=production
PORT=3001

# Database
MONGODB_URI=mongodb+srv://knsalee:SyB11T1OcCTa0BGz@hope-ai.yzbppbz.mongodb.net/?retryWrites=true&w=majority&appName=HOPE-AI

# JWT Secret
JWT_SECRET=SsaZ6qoyiZGFHuEOjKoItX/le7yDS8Es7sDUZmwslrA=

# AI Configuration
GEMINI_API_KEY=AIzaSyCCRSas8dVBP3ye4ZY5RBPsYqw7m_2jro8

# Frontend Configuration
FRONTEND_URL=https://ai-therapist-agent-theta.vercel.app
CORS_ORIGIN=https://ai-therapist-agent-theta.vercel.app

# Backend URLs
BACKEND_API_URL=https://hope-backend-2.onrender.com
NEXT_PUBLIC_BACKEND_API_URL=https://hope-backend-2.onrender.com

# Email Service (IMPORTANT!)
EMAIL_USER=knsalee@gmail.com
EMAIL_PASSWORD=gtgctqxedceacrsz
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587

# Payment Configuration
PAYSTACK_SECRET_KEY=sk_test_db09472048d947585e02821c7327f2b9dca2b81b
PAYSTACK_PUBLIC_KEY=pk_test_6b902d9fa756bd8550db12f7572e7640e66e217f
PAYSTACK_MONTHLY_PLAN_CODE=PLN_h992yw0qdyhkq6n
PAYSTACK_ANNUAL_PLAN_CODE=PLN_enqk2khgjxmb8fi

# NextAuth (for compatibility)
NEXTAUTH_URL=https://ai-therapist-agent-theta.vercel.app
NEXTAUTH_SECRET=568eb71487b9f26500740b1d9eac270451f78a887ef30f27038f2ad55594b6ca
```

---

## 📝 Deployment Steps

### 1. Prepare Code for Deployment

```bash
# Ensure you're on main branch
git checkout main

# Pull latest changes
git pull origin main

# Build to verify no errors
npm run build

# Commit any pending changes
git add .
git commit -m "Production deployment updates"
git push origin main
```

### 2. Deploy to Render

#### Option A: Via Render Dashboard

1. **Go to Render Dashboard**
   - URL: https://dashboard.render.com

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `Hope-backend` repository

3. **Configure Service**
   ```
   Name: hope-backend-2
   Environment: Node
   Region: Choose closest to users
   Branch: main
   Build Command: npm install && npm run build
   Start Command: npm start
   ```

4. **Add Environment Variables**
   - Click "Environment"
   - Add all variables from the section above
   - Make sure to use production values!

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)
   - Note your deployment URL

#### Option B: Via Render.yaml (Infrastructure as Code)

Create `render.yaml` in backend root:
```yaml
services:
  - type: web
    name: hope-backend-2
    env: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      # Add all other environment variables from Render dashboard
```

Then push to GitHub and Render will auto-deploy.

### 3. Verify Deployment

After deployment completes:

```bash
# Check health endpoint
curl https://hope-backend-2.onrender.com/health

# Should return:
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": ...,
  "version": "1.0.0"
}
```

### 4. Test Email Service

```bash
# Test registration with real email
curl -X POST https://hope-backend-2.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User"
  }'

# Check if email was sent (check inbox)
```

---

## 🔄 Updating Production

### Quick Update
```bash
# Make changes
git add .
git commit -m "Update: description"
git push origin main

# Render will auto-deploy
```

### Manual Redeploy
1. Go to Render Dashboard
2. Select your service
3. Click "Manual Deploy" → "Deploy latest commit"

---

## 📊 Monitoring Production

### Health Checks
- Render automatically monitors: `GET /health`
- Frequency: Every 5 minutes
- Expected: 200 status

### Logs
```bash
# View logs in Render Dashboard
# Or use Render CLI:
render logs -s hope-backend-2
```

### Common Issues

#### Service Won't Start
```bash
# Check logs for errors
# Common fixes:
- Verify all environment variables are set
- Check MongoDB connection string
- Ensure PORT is 3001
- Verify build succeeded
```

#### Email Not Sending
```bash
# Check environment variables:
EMAIL_USER=knsalee@gmail.com
EMAIL_PASSWORD=gtgctqxedceacrsz
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587

# Verify Gmail App Password is valid
# Generate new one if needed: https://myaccount.google.com/apppasswords
```

#### CORS Errors
```bash
# Verify CORS_ORIGIN matches frontend URL
CORS_ORIGIN=https://ai-therapist-agent-theta.vercel.app

# Update if frontend URL changed
```

#### Database Connection Issues
```bash
# Verify MongoDB URI is correct
# Check IP whitelist in MongoDB Atlas (allow all: 0.0.0.0/0)
# Verify database user permissions
```

---

## 🔒 Security Best Practices

### Environment Variables
- ✅ Never commit .env file with real credentials
- ✅ Use different secrets for production vs development
- ✅ Rotate secrets regularly
- ✅ Use Render's secret management

### MongoDB
- ✅ Use strong password
- ✅ Enable IP whitelist (or allow all for serverless)
- ✅ Use MongoDB Atlas for production
- ✅ Enable backup

### Gmail
- ✅ Use App Password, not real password
- ✅ Enable 2-Step Verification
- ✅ Monitor email sending limits (500/day)
- ✅ Consider SendGrid for higher volume

---

## 📈 Scaling Considerations

### Current Setup
- Free tier on Render
- Spins down after inactivity
- Wakes up on request (~30 seconds)

### Upgrade Options

#### Paid Plan ($7/month)
- No spin down
- Always online
- Better performance
- More resources

#### Database Scaling
- MongoDB Atlas M0 (Free)
- Upgrade to M2/M5 for more storage/throughput

#### Email Scaling
- Gmail: 500 emails/day
- SendGrid: 100 emails/day (free), then paid
- AWS SES: $0.10 per 1000 emails

---

## 🧪 Testing Production

### Smoke Tests

```bash
# 1. Health check
curl https://hope-backend-2.onrender.com/health

# 2. Register user
curl -X POST https://hope-backend-2.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test"}'

# 3. Verify email (check inbox for OTP)

# 4. Login
curl -X POST https://hope-backend-2.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

### Integration Tests
- Test from frontend deployed on Vercel
- Verify all features work end-to-end
- Check email delivery
- Test payment flow
- Verify AI responses

---

## 📚 Additional Resources

- **Render Docs**: https://render.com/docs
- **MongoDB Atlas**: https://www.mongodb.com/cloud/atlas
- **Gmail App Passwords**: https://myaccount.google.com/apppasswords
- **Gemini AI**: https://ai.google.dev/
- **Paystack**: https://paystack.com/docs

---

## 🎯 Checklist Before Going Live

- [ ] All environment variables set on Render
- [ ] Email service configured and tested
- [ ] Database connected and accessible
- [ ] Health endpoint returns 200
- [ ] Frontend can connect to backend
- [ ] CORS configured correctly
- [ ] SSL/HTTPS enabled (automatic on Render)
- [ ] Error logging configured
- [ ] Monitoring set up
- [ ] Backup strategy for database
- [ ] Email sending tested
- [ ] Payment flow tested (test mode)
- [ ] All API endpoints working

---

## 🚀 You're Production Ready!

Once all checks pass, your backend is production-ready and can handle real users!

**Current Deployment**: https://hope-backend-2.onrender.com

**Next Steps**:
1. Deploy frontend to Vercel
2. Update frontend env vars with production backend URL
3. Test complete user flows
4. Monitor logs and errors
5. Set up alerts for downtime

---

**Last Updated**: October 23, 2025
**Status**: ✅ Production Configuration Complete

