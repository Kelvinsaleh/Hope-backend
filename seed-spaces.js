const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Import the compiled models
const seedData = require('./dist/scripts/seedCommunity');

async function seed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-therapy');
    console.log('✅ Connected to MongoDB');

    // Run the seed function
    await seedData.default();
    
    console.log('✅ All community spaces have been successfully added to your database!');
    console.log('\n📊 Summary:');
    console.log('   • 16 Community Spaces');
    console.log('   • 5 Prompts');
    console.log('   • 4 Challenges');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed();

