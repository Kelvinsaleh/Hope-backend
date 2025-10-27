import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getCommunitySpaces,
  getSpacePosts,
  createPost,
  reactToPost,
  createComment,
  getPostComments,
  getActiveChallenges,
  joinChallenge,
  getDailyPrompts,
  getCommunityStats
} from '../controllers/communityController';

const router = express.Router();

// Public routes (no auth required)
router.get('/spaces', getCommunitySpaces);
router.get('/stats', getCommunityStats);
router.get('/challenges', getActiveChallenges);
router.get('/prompts', getDailyPrompts);
router.get('/posts/:postId/comments', getPostComments);

// Protected routes (auth required)
router.use(authenticateToken);

// Posts
router.get('/spaces/:spaceId/posts', getSpacePosts);
router.post('/posts', createPost);
router.post('/posts/:postId/react', reactToPost);

// Comments
router.post('/comments', createComment);

// Challenges
router.post('/challenges/:challengeId/join', joinChallenge);

export default router;
