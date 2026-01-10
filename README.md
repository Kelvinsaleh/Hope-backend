# Hope AI Therapist Backend

A comprehensive backend API for the Hope AI Therapist application, providing mental health support, therapy sessions, and peer support features.

## Features

###  AI Therapy & Chat
- **Memory-Enhanced Chat**: AI therapist with context from user's journal, mood, and meditation history
- **Session Management**: Track therapy sessions and conversation history
- **Personalized Responses**: AI responses based on user's mental health patterns

###  Journal & Mood Tracking
- **Journal Entries**: Create, read, update, and delete journal entries
- **Mood Tracking**: Track daily mood with analytics and trends
- **Analytics**: Get insights into writing patterns, mood trends, and emotional patterns

###  Meditation & Wellness
- **Meditation Library**: Browse and access guided meditations
- **Session Tracking**: Track meditation sessions and progress
- **Analytics**: Monitor meditation frequency and preferences

###  Peer Support (Rescue Pairs)
- **Matching System**: Find compatible peer support partners
- **Pair Management**: Create and manage rescue pair relationships
- **Trust Building**: Track trust levels and relationship progress

###  Authentication & Security
- **JWT Authentication**: Secure user authentication
- **Session Management**: Track user sessions and device info
- **Data Privacy**: Secure handling of sensitive mental health data

## Tech Stack

- **Node.js** with **Express.js**
- **TypeScript** for type safety
- **MongoDB** with **Mongoose** ODM
- **Google Gemini AI** for therapy responses
- **JWT** for authentication
- **Inngest** for background tasks
- **Winston** for logging

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Chat & Therapy
- `POST /api/chat/sessions` - Create chat session
- `GET /api/chat/sessions/:sessionId` - Get chat session
- `POST /api/chat/sessions/:sessionId/messages` - Send message
- `POST /api/chat/memory-enhanced` - Memory-enhanced chat

### Journal
- `POST /api/journal` - Create journal entry
- `GET /api/journal` - Get journal entries
- `GET /api/journal/:entryId` - Get specific entry
- `PUT /api/journal/:entryId` - Update entry
- `DELETE /api/journal/:entryId` - Delete entry
- `GET /api/journal/analytics` - Get journal analytics

### Mood Tracking
- `POST /api/mood` - Log mood
- `GET /api/mood` - Get mood history

### Meditations
- `GET /api/meditations` - Get meditations
- `GET /api/meditations/:meditationId` - Get specific meditation
- `POST /api/meditations/sessions` - Start meditation session
- `PUT /api/meditations/sessions/:sessionId/complete` - Complete session
- `GET /api/meditations/history` - Get meditation history
- `GET /api/meditations/analytics` - Get meditation analytics

### Rescue Pairs
- `GET /api/rescue-pairs/matches` - Find potential matches
- `GET /api/rescue-pairs` - Get user's rescue pairs
- `POST /api/rescue-pairs` - Create rescue pair
- `PUT /api/rescue-pairs/:pairId` - Update rescue pair
- `DELETE /api/rescue-pairs/:pairId` - Delete rescue pair

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server configuration
PORT=3001

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# JWT Secret
JWT_SECRET=your-jwt-secret-key

# AI API Keys
GEMINI_API_KEY=your-gemini-api-key

# Inngest (optional)
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Hope-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Database Schema

### User
- `name`: String
- `email`: String (unique)
- `password`: String (hashed)

### Journal Entry
- `userId`: ObjectId (ref: User)
- `title`: String
- `content`: String
- `mood`: Number (1-10)
- `tags`: [String]
- `isPrivate`: Boolean

### Meditation
- `title`: String
- `description`: String
- `duration`: Number (minutes)
- `audioUrl`: String (optional)
- `category`: String
- `isPremium`: Boolean
- `tags`: [String]

### Rescue Pair
- `user1Id`: ObjectId (ref: User)
- `user2Id`: ObjectId (ref: User)
- `status`: String (pending/active/paused/ended)
- `compatibilityScore`: Number (0-100)
- `sharedChallenges`: [String]
- `complementaryGoals`: [String]
- `communicationStyle`: String
- `experienceLevel`: String
- `trustLevel`: Number (0-100)
- `emergencySupport`: Boolean

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for password security
- **CORS Protection**: Configured CORS policies
- **Helmet**: Security headers
- **Input Validation**: Request validation and sanitization
- **Rate Limiting**: (Can be added)

## Email Configuration

The backend uses **Resend** for sending password reset and email verification emails.

### Setup Steps

1. **Sign up for Resend**: https://resend.com/
2. **Get API Key**: https://resend.com/api-keys
3. **Verify Domain**: Add `hopementalhealthsupport.xyz` at https://resend.com/domains
4. **Set Environment Variables**:
   ```bash
   RESEND_API_KEY=re_your_api_key_here
   FROM_EMAIL=support@hopementalhealthsupport.xyz
   ```

### Documentation

- **Full Setup Guide**: See `EMAIL_SETUP_GUIDE.md` in project root
- **Quick Checklist**: See `EMAIL_SETUP_CHECKLIST.md`
- **Environment Template**: See `env-email-template.txt`

### Email Features

- ✅ Email verification codes
- ✅ Password reset codes
- ✅ Welcome emails
- ✅ Professional HTML email templates

## Deployment

The backend can be deployed to any Node.js hosting platform:

- **Heroku**
- **Railway**
- **DigitalOcean**
- **AWS**
- **Google Cloud**
- **Render** (recommended)

Make sure to set all environment variables in your deployment platform, including:
- `RESEND_API_KEY`
- `FROM_EMAIL`
- Database connection strings
- JWT secrets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
