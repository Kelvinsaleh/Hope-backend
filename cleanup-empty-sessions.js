/**
 * Cleanup Script: Remove All Empty Chat Sessions
 * 
 * This script removes all chat sessions that have no messages.
 * Run this once to clean up your database.
 * 
 * Usage: node cleanup-empty-sessions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-therapy';

// Define ChatSession schema (minimal version for cleanup)
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
    console.log('✅ Connected successfully!\n');

    // Count total sessions before cleanup
    const totalBefore = await ChatSession.countDocuments({});
    console.log(`📊 Total sessions before cleanup: ${totalBefore}`);

    // Find empty sessions
    const emptySessions = await ChatSession.find({
      $or: [
        { messages: { $exists: false } },
        { messages: { $size: 0 } },
        { messages: null }
      ]
    });

    console.log(`🗑️  Found ${emptySessions.length} empty sessions to delete\n`);

    if (emptySessions.length === 0) {
      console.log('✨ No empty sessions found. Database is clean!');
      process.exit(0);
    }

    // Show some examples
    console.log('Examples of empty sessions:');
    emptySessions.slice(0, 5).forEach((session, idx) => {
      console.log(`  ${idx + 1}. Session ID: ${session.sessionId}`);
      console.log(`     Created: ${session.createdAt || session.startTime}`);
      console.log(`     Messages: ${session.messages ? session.messages.length : 0}\n`);
    });

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question(`⚠️  Delete ${emptySessions.length} empty sessions? (yes/no): `, async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        console.log('\n🗑️  Deleting empty sessions...');
        
        const result = await ChatSession.deleteMany({
          $or: [
            { messages: { $exists: false } },
            { messages: { $size: 0 } },
            { messages: null }
          ]
        });

        console.log(`✅ Deleted ${result.deletedCount} empty sessions`);

        const totalAfter = await ChatSession.countDocuments({});
        console.log(`📊 Total sessions after cleanup: ${totalAfter}`);
        console.log(`💾 Saved space: ${totalBefore - totalAfter} sessions removed\n`);
        console.log('✨ Cleanup complete!');
      } else {
        console.log('\n❌ Cleanup cancelled');
      }

      readline.close();
      await mongoose.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run cleanup
console.log('🧹 Starting Empty Sessions Cleanup\n');
cleanupEmptySessions();

