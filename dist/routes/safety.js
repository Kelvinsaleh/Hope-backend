"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const safetyController_1 = require("../controllers/safetyController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
// Safety reporting routes
router.post("/report", safetyController_1.submitReport);
// User blocking routes
router.post("/block", safetyController_1.blockUser);
router.get("/blocked", safetyController_1.getBlockedUsers);
router.post("/unblock", safetyController_1.unblockUser);
exports.default = router;
