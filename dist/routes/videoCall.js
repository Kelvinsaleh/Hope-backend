"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const videoCallController_1 = require("../controllers/videoCallController");
const auth_1 = require("../middleware/auth");
const premiumAccess_1 = require("../middleware/premiumAccess");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
// Video call routes (premium only)
router.post("/create", (0, premiumAccess_1.requirePremium)('video_call'), videoCallController_1.createVideoCall);
router.get("/:callId", videoCallController_1.getVideoCallStatus);
router.post("/:callId/join", (0, premiumAccess_1.requirePremium)('video_call'), videoCallController_1.joinVideoCall);
router.post("/:callId/end", videoCallController_1.endVideoCall);
exports.default = router;
