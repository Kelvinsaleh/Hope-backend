import mongoose from 'mongoose';
import { CommunitySpace, CommunityPrompt, CommunityChallenge } from '../models/Community';
import { logger } from '../utils/logger';

const seedCommunityData = async () => {
  try {
    // Clear existing data
    await CommunitySpace.deleteMany({});
    await CommunityPrompt.deleteMany({});
    await CommunityChallenge.deleteMany({});
    
    // Create community spaces
    const spaces = [
      // Emotional Support Spaces (Core)
      {
        name: 'Anxiety & Overthinking',
        description: 'A calm space to share your worries and learn coping tools from others.',
        icon: '🌙',
        color: '#93C5FD'
      },
      {
        name: 'Depression & Low Mood',
        description: 'A supportive corner for anyone feeling heavy — you\'re not alone here.',
        icon: '☀️',
        color: '#FEF3C7'
      },
      {
        name: 'Healing from Breakups',
        description: 'For anyone recovering from heartbreak or loss — share, reflect, and rebuild.',
        icon: '💔',
        color: '#FBCFE8'
      },
      {
        name: 'Stress & Burnout',
        description: 'Talk about overwhelm, work pressure, and finding balance again.',
        icon: '🌊',
        color: '#DBEAFE'
      },
      {
        name: 'Loneliness & Connection',
        description: 'For those who feel unseen or disconnected — come as you are.',
        icon: '💭',
        color: '#E0E7FF'
      },
      
      // Growth & Mindfulness Spaces
      {
        name: 'Mindful Living',
        description: 'Share mindfulness habits, grounding practices, and meditation reflections.',
        icon: '🌸',
        color: '#FCE7F3'
      },
      {
        name: 'Gratitude & Positivity',
        description: 'A place to share small wins, appreciation, or moments of joy.',
        icon: '🌿',
        color: '#D1FAE5'
      },
      {
        name: 'Morning Reflections',
        description: 'A daily check-in for intentions, moods, and affirmations.',
        icon: '🌅',
        color: '#FFE4B5'
      },
      {
        name: 'Night Reflections',
        description: 'A safe unwind zone — share your thoughts before bed.',
        icon: '🌙',
        color: '#E0D6FF'
      },
      
      // Social & Peer Connection Spaces
      {
        name: 'Open Chat Café',
        description: 'A general, friendly space for any topic — music, life, or random thoughts.',
        icon: '💬',
        color: '#FFF4CC'
      },
      {
        name: 'Men\'s Circle',
        description: 'Support and brotherhood for men navigating life\'s pressures.',
        icon: '🤝',
        color: '#BFDBFE'
      },
      {
        name: 'Women\'s Circle',
        description: 'A nurturing space to share and grow through women\'s experiences.',
        icon: '🌼',
        color: '#FBCFE8'
      },
      {
        name: 'Student Life & Young Minds',
        description: 'For students dealing with stress, exams, or identity growth.',
        icon: '🌍',
        color: '#A7F3D0'
      },
      
      // Inspiration & Healing Spaces
      {
        name: 'Stories of Healing',
        description: 'Share personal journeys and lessons learned on your path to peace.',
        icon: '📖',
        color: '#FEE2E2'
      },
      {
        name: 'Affirmations & Quotes',
        description: 'Post your favorite quotes or affirmations that keep you going.',
        icon: '✨',
        color: '#FEF3C7'
      },
      {
        name: 'Forgiveness & Letting Go',
        description: 'A reflective zone about releasing pain and moving forward.',
        icon: '🕊️',
        color: '#E0E7FF'
      }
    ];
    
    const createdSpaces = await CommunitySpace.insertMany(spaces);
    logger.info(`Created ${createdSpaces.length} community spaces`);
    
    // Create initial prompts
    const prompts = [
      {
        title: 'Share a breathing technique that helps you feel grounded',
        content: 'What\'s one calming breath or grounding technique you use when you feel overwhelmed?',
        spaceId: createdSpaces[0]._id, // Anxiety & Overthinking
        isActive: true
      },
      {
        title: 'What\'s bringing you joy today?',
        content: 'Share something that made you smile or feel lighter, even if it\'s small.',
        spaceId: createdSpaces[1]._id, // Depression & Low Mood
        isActive: true
      },
      {
        title: 'One thing you\'re grateful for today',
        content: 'Share a moment of gratitude that brought you peace and appreciation.',
        spaceId: createdSpaces[6]._id, // Gratitude & Positivity
        isActive: true
      },
      {
        title: 'Your morning intention',
        content: 'What intention are you setting for yourself today?',
        spaceId: createdSpaces[7]._id, // Morning Reflections
        isActive: true
      },
      {
        title: 'Share a mindful practice that works for you',
        content: 'What mindfulness or meditation technique helps you stay present?',
        spaceId: createdSpaces[5]._id, // Mindful Living
        isActive: true
      }
    ];
    
    await CommunityPrompt.insertMany(prompts);
    logger.info(`Created ${prompts.length} community prompts`);
    
    // Create initial challenges
    const challenges = [
      {
        title: '30 Days of Gratitude',
        description: 'Share one thing you\'re grateful for each day for a month. Build a habit of appreciation and positivity.',
        spaceId: createdSpaces[6]._id, // Gratitude & Positivity
        duration: 30,
        participants: [],
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      {
        title: '21-Day Mindfulness Challenge',
        description: 'Practice 10 minutes of mindfulness daily for 21 days. Share your journey and experiences.',
        spaceId: createdSpaces[5]._id, // Mindful Living
        duration: 21,
        participants: [],
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) // 21 days from now
      },
      {
        title: '7 Days of Grounding',
        description: 'Practice a grounding technique daily when anxiety rises. Share what works for you.',
        spaceId: createdSpaces[0]._id, // Anxiety & Overthinking
        duration: 7,
        participants: [],
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      },
      {
        title: 'Week of Self-Compassion',
        description: 'Perform one act of self-kindness each day for a week. Celebrate your journey.',
        spaceId: createdSpaces[11]._id, // Stories of Healing
        duration: 7,
        participants: [],
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      }
    ];
    
    await CommunityChallenge.insertMany(challenges);
    logger.info(`Created ${challenges.length} community challenges`);
    
    logger.info('Community data seeded successfully!');
  } catch (error) {
    logger.error('Error seeding community data:', error);
    throw error;
  }
};

export default seedCommunityData;