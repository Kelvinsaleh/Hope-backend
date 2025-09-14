import express from "express";
import {
  findMatches,
  createRescuePair,
  getRescuePairs,
  updateRescuePair,
  deleteRescuePair,
} from "../controllers/rescuePairController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Rescue pair routes
router.get("/matches", findMatches);
router.get("/", getRescuePairs);
router.post("/", createRescuePair);
router.put("/:pairId", updateRescuePair);
router.delete("/:pairId", deleteRescuePair);

export default router;
