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
  getCommunityStats,
  getRecentActivity,
  deletePost,
  deleteComment,
  saveImageMetadata,
  sharePost,
  getFeed
} from '../controllers/communityController';

const router = express.Router();

// Public routes (no auth required)
router.get('/spaces', getCommunitySpaces);
router.get('/stats', getCommunityStats);
router.get('/challenges', getActiveChallenges);
router.get('/prompts', getDailyPrompts);
router.get('/activity', getRecentActivity);
router.get('/posts/:postId/comments', getPostComments);
router.get('/feed', getFeed);

// Protected routes (auth required)
router.use(authenticateToken);

// Posts
router.get('/spaces/:spaceId/posts', getSpacePosts);
router.post('/posts', createPost);
router.post('/posts/:postId/react', reactToPost);
router.post('/posts/:postId/share', sharePost);
router.delete('/posts/:postId', deletePost);

// Comments
router.post('/comments', createComment);
router.delete('/comments/:commentId', deleteComment);

// Images
router.post('/images', saveImageMetadata);

// Challenges
router.post('/challenges/:challengeId/join', joinChallenge);

export default router;
