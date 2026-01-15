"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const communityController_1 = require("../controllers/communityController");
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
router.get('/spaces', communityController_1.getCommunitySpaces);
router.get('/stats', communityController_1.getCommunityStats);
router.get('/challenges', communityController_1.getActiveChallenges);
router.get('/prompts', communityController_1.getDailyPrompts);
router.get('/activity', communityController_1.getRecentActivity);
router.get('/feed', communityController_1.getFeed);
router.get('/posts/:postId', communityController_1.getPost);
router.get('/posts/:postId/comments', communityController_1.getPostComments);
// Protected routes (auth required)
router.use(auth_1.authenticateToken);
// Posts
router.get('/spaces/:spaceId/posts', communityController_1.getSpacePosts);
router.post('/posts', communityController_1.createPost);
router.post('/posts/:postId/react', communityController_1.reactToPost);
router.post('/posts/:postId/share', communityController_1.sharePost);
router.delete('/posts/:postId', communityController_1.deletePost);
// Comments
router.post('/comments', communityController_1.createComment);
router.delete('/comments/:commentId', communityController_1.deleteComment);
// Media Upload (already protected by authenticateToken middleware above)
router.post('/upload/image', upload.single('file'), communityController_1.uploadImage);
router.post('/upload/video', upload.single('file'), communityController_1.uploadVideo);
// Images (legacy endpoint)
router.post('/images', communityController_1.saveImageMetadata);
// Challenges
router.post('/challenges/:challengeId/join', communityController_1.joinChallenge);
exports.default = router;
