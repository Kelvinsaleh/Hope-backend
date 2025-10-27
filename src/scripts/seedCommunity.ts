import mongoose from 'mongoose';
import { CommunitySpace, CommunityPrompt } from '../models/Community';
import { logger } from '../utils/logger';

const seedCommunityData = async () => {
  try {
    // Clear existing data
    await CommunitySpace.deleteMany({});
    await CommunityPrompt.deleteMany({});
    
    // Create community spaces
    const spaces = [
      {
        name: 'Daily Reflections',
        description: 'Share your daily thoughts, wins, and moments of gratitude',
        icon: '🌅',
        color: '#FFB347'
      },
      {
        name: 'Anxiety & Calm',
        description: 'A safe space for grounding, stress management, and finding peace',
        icon: '🕊️',
        color: '#87CEEB'
      },
      {
        name: 'Self-Love & Growth',
        description: 'Celebrate your journey, build confidence, and set healthy boundaries',
        icon: '🌱',
        color: '#98FB98'
      },
      {
        name: 'Sleep & Mindfulness',
        description: 'Share meditation experiences, sleep tips, and mindfulness practices',
        icon: '🌙',
        color: '#DDA0DD'
      },
      {
        name: 'Open Journal Prompts',
        description: 'Respond to weekly AI-guided questions and prompts',
        icon: '📝',
        color: '#F0E68C'
      }
    ];
    
    const createdSpaces = await CommunitySpace.insertMany(spaces);
    logger.info(`Created ${createdSpaces.length} community spaces`);
    
    // Create initial prompts
    const prompts = [
      {
        title: 'What\'s one thing you\'re grateful for today?',
        content: 'Take a moment to reflect on something positive from your day, no matter how small.',
        spaceId: createdSpaces[0]._id, // Daily Reflections
        isActive: true
      },
      {
        title: 'Describe a moment when you felt truly calm',
        content: 'Share a peaceful moment that brought you inner stillness and tranquility.',
        spaceId: createdSpaces[1]._id, // Anxiety & Calm
        isActive: true
      },
      {
        title: 'What\'s one way you showed yourself kindness this week?',
        content: 'Celebrate a moment when you treated yourself with compassion and care.',
        spaceId: createdSpaces[2]._id, // Self-Love & Growth
        isActive: true
      },
      {
        title: 'Share a meditation or mindfulness technique that works for you',
        content: 'Help others by sharing a practice that brings you peace and presence.',
        spaceId: createdSpaces[3]._id, // Sleep & Mindfulness
        isActive: true
      },
      {
        title: 'What\'s one small win you\'re proud of?',
        content: 'Celebrate any progress, no matter how small. Every step forward matters.',
        spaceId: createdSpaces[4]._id, // Open Journal Prompts
        isActive: true
      }
    ];
    
    await CommunityPrompt.insertMany(prompts);
    logger.info(`Created ${prompts.length} community prompts`);
    
    logger.info('Community data seeded successfully!');
  } catch (error) {
    logger.error('Error seeding community data:', error);
    throw error;
  }
};

export default seedCommunityData;
