import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSleepIntervention, getRecommendedInterventions as getSleepInterventions } from '../services/interventions/sleepIntervention';
import { getDepressionIntervention, getRecommendedInterventions as getDepressionInterventions } from '../services/interventions/depressionIntervention';
import { getAnxietyIntervention, getRecommendedInterventions as getAnxietyInterventions } from '../services/interventions/anxietyIntervention';
import { getStressIntervention, getRecommendedInterventions as getStressInterventions } from '../services/interventions/stressIntervention';
import { getBreakupIntervention, getRecommendedInterventions as getBreakupInterventions } from '../services/interventions/breakupIntervention';
import { getGriefIntervention, getRecommendedInterventions as getGriefInterventions } from '../services/interventions/griefIntervention';
import { getFocusIntervention, getRecommendedInterventions as getFocusInterventions } from '../services/interventions/focusIntervention';
import { detectInterventionNeeds, generateInterventionSuggestions } from '../services/interventions/interventionDetector';
import { promptForEffectivenessRating, processEffectivenessRating } from '../services/interventions/effectivenessPrompts';
import { measureInterventionOutcome, getUserInterventionOutcomes, formatOutcomeMessage } from '../services/interventions/outcomeMeasurement';

const router = express.Router();

// All intervention routes require authentication
router.use(authenticateToken);

/**
 * GET /interventions/sleep
 * Get recommended sleep interventions based on user's needs
 */
router.get('/sleep', async (req, res) => {
  try {
    const sleepProblem = req.query.problem as 'difficulty_falling_asleep' | 'waking_frequently' | 'early_waking' | 'poor_sleep_quality' || 'difficulty_falling_asleep';
    const severity = req.query.severity as 'mild' | 'moderate' | 'severe' || 'moderate';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getSleepInterventions(sleepProblem, severity, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Sleep interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sleep interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/sleep/:interventionId
 * Get a specific sleep intervention by ID
 */
router.get('/sleep/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getSleepIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Sleep intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sleep intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/depression
 * Get recommended depression interventions based on user's needs
 */
router.get('/depression', async (req, res) => {
  try {
    const severity = req.query.severity as 'mild' | 'moderate' | 'severe' || 'moderate';
    const primarySymptom = req.query.symptom as 'low_mood' | 'loss_interest' | 'fatigue' | 'isolation' | 'self_criticism' || 'low_mood';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getDepressionInterventions(severity, primarySymptom, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Depression interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve depression interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/depression/:interventionId
 * Get a specific depression intervention by ID
 */
router.get('/depression/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getDepressionIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Depression intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve depression intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/anxiety
 * Get recommended anxiety interventions based on user's needs
 */
router.get('/anxiety', async (req, res) => {
  try {
    const anxietyType = req.query.type as 'general' | 'social' | 'panic' | 'specific_phobia' | 'worries' || 'general';
    const severity = req.query.severity as 'mild' | 'moderate' | 'severe' || 'moderate';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getAnxietyInterventions(anxietyType, severity, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Anxiety interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve anxiety interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/anxiety/:interventionId
 * Get a specific anxiety intervention by ID
 */
router.get('/anxiety/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getAnxietyIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Anxiety intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve anxiety intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/stress
 * Get recommended stress management interventions based on user's needs
 */
router.get('/stress', async (req, res) => {
  try {
    const stressSource = req.query.source as 'work' | 'relationships' | 'time_pressure' | 'life_changes' | 'general' || 'general';
    const severity = req.query.severity as 'mild' | 'moderate' | 'severe' || 'moderate';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getStressInterventions(stressSource, severity, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Stress management interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stress management interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/stress/:interventionId
 * Get a specific stress management intervention by ID
 */
router.get('/stress/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getStressIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Stress management intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stress management intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/breakup
 * Get recommended breakup interventions based on user's needs
 */
router.get('/breakup', async (req, res) => {
  try {
    const daysSince = parseInt(req.query.daysSince as string) || 0;
    const primaryChallenge = req.query.challenge as 'emotional_pain' | 'loneliness' | 'identity_loss' | 'contact_urges' | 'self_blame' || 'emotional_pain';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getBreakupInterventions(daysSince, primaryChallenge, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Breakup interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve breakup interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/breakup/:interventionId
 * Get a specific breakup intervention by ID
 */
router.get('/breakup/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getBreakupIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Breakup intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve breakup intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/grief
 * Get recommended grief interventions based on user's needs
 */
router.get('/grief', async (req, res) => {
  try {
    const monthsSince = parseInt(req.query.monthsSince as string) || 0;
    const primaryChallenge = req.query.challenge as 'emotional_overwhelm' | 'loneliness' | 'meaning_loss' | 'guilt' | 'numbness' || 'emotional_overwhelm';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getGriefInterventions(monthsSince, primaryChallenge, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Grief interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve grief interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/grief/:interventionId
 * Get a specific grief intervention by ID
 */
router.get('/grief/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getGriefIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Grief intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve grief intervention',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/focus
 * Get recommended focus/discipline interventions based on user's needs
 */
router.get('/focus', async (req, res) => {
  try {
    const primaryChallenge = req.query.challenge as 'procrastination' | 'distractions' | 'lack_of_routine' | 'overwhelm' | 'low_motivation' || 'procrastination';
    const experienceLevel = req.query.experienceLevel as 'beginner' | 'intermediate' | 'advanced' || 'beginner';

    const interventions = getFocusInterventions(primaryChallenge, experienceLevel);

    res.json({
      success: true,
      data: interventions,
      message: 'Focus interventions retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve focus interventions',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/focus/:interventionId
 * Get a specific focus intervention by ID
 */
router.get('/focus/:interventionId', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const intervention = getFocusIntervention(interventionId);

    if (!intervention) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found',
      });
    }

    res.json({
      success: true,
      data: intervention,
      message: 'Focus intervention retrieved successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve focus intervention',
      details: error.message,
    });
  }
});

/**
 * POST /interventions/:interventionId/rate
 * Rate intervention effectiveness (1-10)
 */
router.post('/:interventionId/rate', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const { rating } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 10) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be a number between 1 and 10',
      });
    }

    const result = await processEffectivenessRating(
      new (require('mongoose')).Types.ObjectId(userId),
      interventionId,
      rating
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message || 'Failed to save rating',
      });
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        interventionId,
        rating,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to process effectiveness rating',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/:interventionId/outcome
 * Get intervention outcome measurement (mood before/after)
 */
router.get('/:interventionId/outcome', async (req, res) => {
  try {
    const { interventionId } = req.params;
    const userId = (req as any).user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const outcome = await measureInterventionOutcome(
      new (require('mongoose')).Types.ObjectId(userId),
      interventionId
    );

    if (!outcome) {
      return res.status(404).json({
        success: false,
        error: 'Intervention not found or no outcome data available',
      });
    }

    const outcomeMessage = formatOutcomeMessage(outcome);

    res.json({
      success: true,
      data: outcome,
      message: outcomeMessage,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to measure intervention outcome',
      details: error.message,
    });
  }
});

/**
 * GET /interventions/outcomes
 * Get all intervention outcomes for the user
 */
router.get('/outcomes', async (req, res) => {
  try {
    const userId = (req as any).user?._id;
    const interventionType = req.query.type as string | undefined;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const outcomes = await getUserInterventionOutcomes(
      new (require('mongoose')).Types.ObjectId(userId),
      interventionType as any
    );

    res.json({
      success: true,
      data: outcomes,
      message: `Retrieved ${outcomes.length} intervention outcomes`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve intervention outcomes',
      details: error.message,
    });
  }
});

/**
 * POST /interventions/detect
 * Detect intervention needs from message and return recommended interventions
 */
router.post('/detect', async (req, res) => {
  try {
    const { message, recentMessages, moodPatterns } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const detectedNeed = detectInterventionNeeds(
      message,
      recentMessages || [],
      moodPatterns || []
    );

    let interventionSuggestions: Array<{
      interventionId: string;
      interventionName: string;
      description: string;
      whyNow: string;
      nextSteps: string[];
    }> = [];

    if (detectedNeed.type && detectedNeed.confidence > 0.5) {
      const experienceLevel = (req.body.experienceLevel || 'beginner') as 'beginner' | 'intermediate' | 'advanced';
      const userId = (req as any).user?._id ? new (require('mongoose')).Types.ObjectId((req as any).user._id) : undefined;
      // Pass userId for personalization - backend will prioritize interventions that worked well before
      interventionSuggestions = await generateInterventionSuggestions(detectedNeed, experienceLevel, userId);
    }

    res.json({
      success: true,
      data: {
        detectedNeed,
        interventionSuggestions,
      },
      message: 'Intervention needs detected successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to detect intervention needs',
      details: error.message,
    });
  }
});

export default router;
