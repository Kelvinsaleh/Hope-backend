import express from "express";
import { escalateToCrisisSupport } from "../controllers/safetyController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.use(authenticateToken);

// Crisis support routes
router.post("/escalate", escalateToCrisisSupport);

export default router; 