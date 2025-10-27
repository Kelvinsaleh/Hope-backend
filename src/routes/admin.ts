import express from 'express';
import { authenticateToken } from '../middleware/auth';
import seedCommunityData from '../scripts/seedCommunity';
import { logger } from '../utils/logger';

const router = express.Router();

// Admin route to seed community data
router.post('/seed', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you can customize this check)
    const user = req.user;
    if (user.email !== 'knsalee@gmail.com') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    await seedCommunityData();
    
    res.json({
      success: true,
      message: 'Community data seeded successfully'
    });
  } catch (error) {
    logger.error('Error seeding community data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed community data'
    });
  }
});

export default router;
