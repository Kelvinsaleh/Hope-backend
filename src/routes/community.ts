import express from 'express';
import multer from 'multer';
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
  getFeed,
  uploadImage,
  uploadVideo,
} from '../controllers/communityController';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB limit for images/videos
  },
  fileFilter: (req, file, cb) => {
    // Accept images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    }
    // Accept videos
    else if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    }
    else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  },
});

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

// Media Upload (already protected by authenticateToken middleware above)
router.post('/upload/image', upload.single('file'), uploadImage);
router.post('/upload/video', upload.single('file'), uploadVideo);

// Images (legacy endpoint)
router.post('/images', saveImageMetadata);

// Challenges
router.post('/challenges/:challengeId/join', joinChallenge);

export default router;
