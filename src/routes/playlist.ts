import express from "express";
import {
  getUserPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addMeditationToPlaylist,
  removeMeditationFromPlaylist,
  getPublicPlaylists,
  forkPlaylist,
} from "@/controllers/playlistController";
import { authenticateToken } from "@/middleware/auth";

const router = express.Router();

router.get("/public", getPublicPlaylists);

router.use(authenticateToken);

router.get("/", getUserPlaylists);
router.post("/", createPlaylist);
router.get("/:playlistId", getPlaylist);
router.put("/:playlistId", updatePlaylist);
router.delete("/:playlistId", deletePlaylist);
router.post("/:playlistId/meditations", addMeditationToPlaylist);
router.delete("/:playlistId/meditations/:meditationId", removeMeditationFromPlaylist);
router.post("/:playlistId/fork", forkPlaylist);

export default router;
