"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subscriptionController_1 = require("../controllers/subscriptionController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticateToken);
// Subscription routes
router.get("/status", subscriptionController_1.getSubscriptionStatus);
router.post("/", subscriptionController_1.createSubscription);
router.post("/start-trial", subscriptionController_1.startFreeTrial);
router.put("/:subscriptionId", subscriptionController_1.updateSubscription);
router.get("/premium/:feature", subscriptionController_1.checkPremiumAccess);
// User tier management
router.post("/update-tier", subscriptionController_1.updateUserTier);
exports.default = router;
