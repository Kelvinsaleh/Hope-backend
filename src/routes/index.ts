import express from "express";
import authRoutes from "./auth";
import userRoutes from "./user";
import chatRoutes from "./chat";
import meditationRoutes from "./meditation";
import subscriptionRoutes from "./subscription";
import paymentsRoutes from "./payments";
import analyticsRoutes from "./analytics";
import journalRoutes from "./journal";
import rescuePairsRoutes from "./rescuePairs";
import moodRoutes from "./mood";
import activityRoutes from "./activity";
import memoryEnhancedChatRoutes from "./memoryEnhancedChat";
import playlistRoutes from './playlist';
import communityRoutes from './community';
import adminRoutes from './admin';

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/chat", chatRoutes);
router.use("/meditation", meditationRoutes);
router.use("/subscription", subscriptionRoutes);
router.use("/payments", paymentsRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/journal", journalRoutes);
router.use("/rescue-pairs", rescuePairsRoutes);
router.use("/mood", moodRoutes);
router.use("/activity", activityRoutes);
router.use("/memory-enhanced-chat", memoryEnhancedChatRoutes);
router.use("/playlists", playlistRoutes);
router.use("/community", communityRoutes);
router.use("/admin", adminRoutes);

export default router;
