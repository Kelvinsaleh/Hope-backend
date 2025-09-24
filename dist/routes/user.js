"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const Subscription_1 = require("../models/Subscription");
const mongoose_1 = require("mongoose");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.get("/tier", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const subscription = await Subscription_1.Subscription.findOne({
            userId,
            status: "active",
            endDate: { $gt: new Date() }
        });
        const tier = subscription ? "premium" : "free";
        res.json({
            success: true,
            tier,
            subscription: subscription || null
        });
    }
    catch (error) {
        res.status(500).json({
            error: "Failed to check user tier",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
