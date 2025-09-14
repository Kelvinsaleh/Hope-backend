import express from "express";
import {
  createJournalEntry,
  getJournalEntries,
  getJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getJournalAnalytics,
} from "../controllers/journalController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Journal entry routes
router.post("/", createJournalEntry);
router.get("/", getJournalEntries);
router.get("/analytics", getJournalAnalytics);
router.get("/:entryId", getJournalEntry);
router.put("/:entryId", updateJournalEntry);
router.delete("/:entryId", deleteJournalEntry);

export default router;
