"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Community_1 = require("../models/Community");
const logger_1 = require("../utils/logger");
const seedCommunityData = async () => {
    try {
        // Clear existing data
        await Community_1.CommunitySpace.deleteMany({});
        await Community_1.CommunityPrompt.deleteMany({});
        await Community_1.CommunityChallenge.deleteMany({});
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
        const createdSpaces = await Community_1.CommunitySpace.insertMany(spaces);
        logger_1.logger.info(`Created ${createdSpaces.length} community spaces`);
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
        await Community_1.CommunityPrompt.insertMany(prompts);
        logger_1.logger.info(`Created ${prompts.length} community prompts`);
        // Create initial challenges
        const challenges = [
            {
                title: '7 Days of Gratitude',
                description: 'Share one thing you\'re grateful for each day for a week. Build a habit of appreciation and positivity.',
                spaceId: createdSpaces[0]._id, // Daily Reflections
                duration: 7,
                participants: [],
                isActive: true,
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
            },
            {
                title: 'Mindful Breathing Challenge',
                description: 'Practice 5 minutes of mindful breathing daily for 5 days. Share your experiences and techniques.',
                spaceId: createdSpaces[3]._id, // Sleep & Mindfulness
                duration: 5,
                participants: [],
                isActive: true,
                startDate: new Date(),
                endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days from now
            },
            {
                title: 'Self-Care Week',
                description: 'Commit to one self-care activity each day for a week. Share what you did and how it made you feel.',
                spaceId: createdSpaces[2]._id, // Self-Love & Growth
                duration: 7,
                participants: [],
                isActive: true,
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
            }
        ];
        await Community_1.CommunityChallenge.insertMany(challenges);
        logger_1.logger.info(`Created ${challenges.length} community challenges`);
        logger_1.logger.info('Community data seeded successfully!');
    }
    catch (error) {
        logger_1.logger.error('Error seeding community data:', error);
        throw error;
    }
};
exports.default = seedCommunityData;
