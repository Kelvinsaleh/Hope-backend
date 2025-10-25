/**
 * Automatic Empty Sessions Cleanup (No Confirmation)
 * 
 * This script immediately removes all chat sessions with no messages.
 * 
 * Usage: node cleanup-empty-sessions-auto.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define ChatSession schema
const chatSessionSchema = new mongoose.Schema({
  sessionId: String,
  userId: mongoose.Schema.Types.ObjectId,
  messages: Array,
  createdAt: Date,
  startTime: Date,
  status: String,
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

async function cleanupEmptySessions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    // Count before
    const totalBefore = await ChatSession.countDocuments({});
    console.log(`📊 Total sessions before: ${totalBefore}`);

    // Delete empty sessions
    console.log('🗑️  Deleting empty sessions...');
    const result = await ChatSession.deleteMany({
      $or: [
        { messages: { $exists: false } },
        { messages: { $size: 0 } },
        { messages: null }
      ]
    });

    console.log(`✅ Deleted ${result.deletedCount} empty sessions`);

    // Count after
    const totalAfter = await ChatSession.countDocuments({});
    console.log(`📊 Total sessions after: ${totalAfter}`);
    console.log(`💾 Space saved: ${totalBefore - totalAfter} sessions removed\n`);
    
    if (result.deletedCount > 0) {
      console.log('✨ Database cleaned successfully!');
    } else {
      console.log('✨ No empty sessions found. Database already clean!');
    }

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

console.log('🧹 Auto-Cleanup Starting...\n');
cleanupEmptySessions();

