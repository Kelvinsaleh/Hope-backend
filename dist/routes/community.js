"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const communityController_1 = require("../controllers/communityController");
const router = express_1.default.Router();
// Public routes (no auth required)
router.get('/spaces', communityController_1.getCommunitySpaces);
router.get('/stats', communityController_1.getCommunityStats);
router.get('/challenges', communityController_1.getActiveChallenges);
router.get('/prompts', communityController_1.getDailyPrompts);
router.get('/activity', communityController_1.getRecentActivity);
router.get('/posts/:postId/comments', communityController_1.getPostComments);
// Protected routes (auth required)
router.use(auth_1.authenticateToken);
// Posts
router.get('/spaces/:spaceId/posts', communityController_1.getSpacePosts);
router.post('/posts', communityController_1.createPost);
router.post('/posts/:postId/react', communityController_1.reactToPost);
// Comments
router.post('/comments', communityController_1.createComment);
// Challenges
router.post('/challenges/:challengeId/join', communityController_1.joinChallenge);
exports.default = router;
