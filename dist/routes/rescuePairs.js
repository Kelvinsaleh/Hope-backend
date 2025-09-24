"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rescuePairController_1 = require("../controllers/rescuePairController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
// Rescue pair routes
router.get("/matches", rescuePairController_1.findMatches);
router.post("/", rescuePairController_1.createRescuePair);
router.post("/:pairId/accept", rescuePairController_1.acceptRescuePair);
router.post("/:pairId/reject", rescuePairController_1.rejectRescuePair);
router.get("/", rescuePairController_1.getUserRescuePairs);
router.put("/:pairId/status", rescuePairController_1.updateRescuePairStatus);
router.get("/:pairId", rescuePairController_1.getRescuePairDetails);
exports.default = router;
