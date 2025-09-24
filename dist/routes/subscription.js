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
router.get("/status", subscriptionController_1.getSubscriptionStatus);
router.post("/", subscriptionController_1.createSubscription);
router.put("/:subscriptionId", subscriptionController_1.updateSubscription);
router.get("/access/:feature", subscriptionController_1.checkPremiumAccess);
exports.default = router;
