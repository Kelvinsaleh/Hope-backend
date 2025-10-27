"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const seedCommunity_1 = __importDefault(require("../scripts/seedCommunity"));
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
// Admin route to seed community data
router.post('/seed', auth_1.authenticateToken, async (req, res) => {
    try {
        // Check if user is admin (you can customize this check)
        const user = req.user;
        if (user.email !== 'knsalee@gmail.com') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        await (0, seedCommunity_1.default)();
        res.json({
            success: true,
            message: 'Community data seeded successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error seeding community data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to seed community data'
        });
    }
});
exports.default = router;
