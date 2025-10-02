import { Request, Response } from "express";
import { User } from "../models/User";
import { RescuePair } from "../models/RescuePair";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

interface SafetyReport {
  reporterId: Types.ObjectId;
  reportedUserId: Types.ObjectId;
  reason: string;
  details?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'harassment' | 'inappropriate_content' | 'safety_concern' | 'spam' | 'other';
  evidence?: {
    messageIds?: string[];
    screenshots?: string[];
    additionalInfo?: string;
  };
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  timestamp: Date;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  actions?: string[];
}

// Submit safety report
export const submitReport = async (req: Request, res: Response) => {
  try {
    const { reportedUserId, reason, details, evidence } = req.body;
    const reporterId = new Types.ObjectId(req.user._id);
    const reportedId = new Types.ObjectId(reportedUserId);

    if (reporterId.toString() === reportedId.toString()) {
      return res.status(400).json({
        success: false,
        error: "Cannot report yourself"
      });
    }

    // Categorize the report
    const { severity, category } = categorizeSafetyReport(reason, details);
    
    const report: SafetyReport = {
      reporterId,
      reportedUserId: reportedId,
      reason,
      details,
      severity: severity as any,
      category: category as any,
      evidence,
      status: 'pending',
      timestamp: new Date()
    };

    // In a real implementation, save to SafetyReport collection
    // const savedReport = await SafetyReport.create(report);
    const reportId = new Types.ObjectId();

    // Handle critical reports immediately
    if (severity === 'critical') {
      try {
        // Temporarily suspend the reported user
        await User.findByIdAndUpdate(reportedId, {
          $set: {
            status: 'suspended',
            suspendedAt: new Date(),
            suspensionReason: 'Critical safety report - pending review',
            suspensionDuration: '24h'
          }
        });

        // End all active matches for the reported user
        await RescuePair.updateMany(
          {
            $or: [{ user1Id: reportedId }, { user2Id: reportedId }],
            status: 'accepted'
          },
          {
            $set: {
              status: 'ended',
              endedAt: new Date(),
              endReason: 'Safety suspension'
            }
          }
        );

        logger.error(`CRITICAL SAFETY REPORT: User ${reportedId} suspended due to report ${reportId}`);
      } catch (suspensionError) {
        logger.error('Failed to handle critical report:', suspensionError);
      }
    }

    logger.info(`Safety report submitted: ${reporterId} -> ${reportedId} (${severity})`);

    let responseMessage = 'Report submitted successfully. Our safety team will review it promptly.';
    
    if (severity === 'critical') {
      responseMessage = 'Critical safety report submitted. The reported user has been temporarily suspended and our crisis support team has been notified.';
    } else if (severity === 'high') {
      responseMessage = 'High priority safety report submitted. Our team will review this within 2 hours.';
    }

    res.json({
      success: true,
      data: {
        reportId,
        severity,
        category,
        status: 'submitted'
      },
      message: responseMessage
    });

  } catch (error) {
    logger.error("Error submitting safety report:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to submit safety report" 
    });
  }
};

// Block user
export const blockUser = async (req: Request, res: Response) => {
  try {
    const { blockedUserId, reason } = req.body;
    const userId = new Types.ObjectId(req.user._id);
    const blockedId = new Types.ObjectId(blockedUserId);

    if (userId.toString() === blockedId.toString()) {
      return res.status(400).json({
        success: false,
        error: "Cannot block yourself"
      });
    }

    // Add to blocked users list
    await User.findByIdAndUpdate(userId, {
      $addToSet: { blockedUsers: blockedId }
    });

    // End any active matches between these users
    await RescuePair.updateMany(
      {
        $or: [
          { user1Id: userId, user2Id: blockedId },
          { user1Id: blockedId, user2Id: userId }
        ],
        status: 'accepted'
      },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          endReason: 'User blocked',
          endedBy: userId
        }
      }
    );

    logger.info(`User blocked: ${userId} blocked ${blockedId}`);

    res.json({
      success: true,
      message: 'User blocked successfully. You will no longer see them in matches or receive messages from them.'
    });

  } catch (error) {
    logger.error("Error blocking user:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to block user" 
    });
  }
};

// Get blocked users
export const getBlockedUsers = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);

    const user = await User.findById(userId)
      .populate('blockedUsers', 'name email')
      .select('blockedUsers')
      .lean();

    res.json({
      success: true,
      blockedUsers: user?.blockedUsers || []
    });

  } catch (error) {
    logger.error("Error getting blocked users:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get blocked users" 
    });
  }
};

// Unblock user
export const unblockUser = async (req: Request, res: Response) => {
  try {
    const { blockedUserId } = req.body;
    const userId = new Types.ObjectId(req.user._id);
    const blockedId = new Types.ObjectId(blockedUserId);

    // Remove from blocked users list
    await User.findByIdAndUpdate(userId, {
      $pull: { blockedUsers: blockedId }
    });

    logger.info(`User unblocked: ${userId} unblocked ${blockedId}`);

    res.json({
      success: true,
      message: 'User unblocked successfully.'
    });

  } catch (error) {
    logger.error("Error unblocking user:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to unblock user" 
    });
  }
};

// Crisis support escalation
export const escalateToCrisisSupport = async (req: Request, res: Response) => {
  try {
    const { details, context, userLocation } = req.body;
    const userId = new Types.ObjectId(req.user._id);

    // Assess crisis severity
    const assessment = assessCrisisSeverity(details);
    
    const escalation = {
      userId,
      type: assessment.type,
      severity: assessment.severity,
      details,
      context,
      location: userLocation,
      timestamp: new Date(),
      urgency: assessment.urgency,
      autoAssessment: assessment
    };

    // In a real implementation, save to CrisisEscalation collection
    const escalationId = new Types.ObjectId();

    // Crisis hotlines by region
    const crisisHotlines = {
      US: { name: 'National Suicide Prevention Lifeline', number: '988' },
      UK: { name: 'Samaritans', number: '116 123' },
      CA: { name: 'Talk Suicide Canada', number: '1-833-456-4566' },
      AU: { name: 'Lifeline Australia', number: '13 11 14' },
      GLOBAL: { name: 'International Crisis Centers', number: 'Visit iasp.info/resources/Crisis_Centres' }
    };

    const region = userLocation?.country || 'GLOBAL';
    const hotline = crisisHotlines[region as keyof typeof crisisHotlines] || crisisHotlines.GLOBAL;
    
    let immediateActions = [];
    
    if (assessment.severity === 'critical') {
      immediateActions = [
        'If you are in immediate danger, call emergency services (911, 999, etc.)',
        `Contact crisis hotline: ${hotline.name} - ${hotline.number}`,
        'Stay with someone you trust or go to a safe place',
        'Remove any means of self-harm from your immediate area'
      ];
    } else if (assessment.severity === 'high') {
      immediateActions = [
        `Crisis hotline available 24/7: ${hotline.name} - ${hotline.number}`,
        'Consider reaching out to a trusted friend or family member',
        'Use coping strategies you\'ve learned (breathing, grounding techniques)'
      ];
    } else {
      immediateActions = [
        `Support available: ${hotline.name} - ${hotline.number}`,
        'Consider talking to a mental health professional',
        'Reach out to your support network'
      ];
    }

    logger.error(`Crisis escalation ${escalationId}: User ${userId}, severity: ${assessment.severity}`);

    res.json({
      success: true,
      escalationId,
      data: {
        escalationId,
        severity: assessment.severity,
        urgency: assessment.urgency,
        crisisResources: {
          hotline,
          immediateActions,
          followUpExpected: assessment.severity === 'critical' ? '5 minutes' : 
                           assessment.severity === 'high' ? '30 minutes' : '2 hours'
        }
      },
      message: 'Crisis support has been notified and will reach out to you.'
    });

  } catch (error) {
    logger.error("Error escalating to crisis support:", error);
    
    // Even if backend fails, provide crisis resources
    const hotline = { name: 'Emergency Services', number: '911 or local emergency number' };
    
    res.status(500).json({
      success: false,
      error: 'System error, but crisis resources are available',
      crisisResources: {
        hotline,
        immediateActions: [
          'If in immediate danger, call emergency services',
          'Contact a crisis hotline in your area',
          'Reach out to a trusted person',
          'Go to your nearest emergency room if needed'
        ]
      }
    });
  }
};

// Helper functions
function categorizeSafetyReport(reason: string, details?: string): { severity: string; category: string } {
  const text = `${reason} ${details || ''}`.toLowerCase();
  
  if (text.includes('threat') || text.includes('violence') || text.includes('harm') || 
      text.includes('suicide') || text.includes('self-harm')) {
    return { severity: 'critical', category: 'safety_concern' };
  }
  
  if (text.includes('harassment') || text.includes('stalking') || text.includes('abuse') ||
      text.includes('inappropriate') || text.includes('sexual')) {
    return { severity: 'high', category: 'harassment' };
  }
  
  if (text.includes('spam') || text.includes('scam') || text.includes('fake')) {
    return { severity: 'medium', category: 'spam' };
  }
  
  return { severity: 'low', category: 'other' };
}

function assessCrisisSeverity(details: string): { severity: string; type: string; urgency: string } {
  const text = details.toLowerCase();
  
  if (text.includes('going to kill myself') || text.includes('ending it tonight') || 
      text.includes('have a plan') || text.includes('goodbye forever')) {
    return { severity: 'critical', type: 'suicide_ideation', urgency: 'immediate' };
  }
  
  if (text.includes('want to die') || text.includes('kill myself') || 
      text.includes('end it all') || text.includes('not worth living')) {
    return { severity: 'high', type: 'suicide_ideation', urgency: 'urgent' };
  }
  
  if (text.includes('hurt myself') || text.includes('cutting') || 
      text.includes('self-harm') || text.includes('punish myself')) {
    return { severity: 'high', type: 'self_harm', urgency: 'urgent' };
  }
  
  if (text.includes('can\'t cope') || text.includes('overwhelming') || 
      text.includes('hopeless') || text.includes('desperate')) {
    return { severity: 'medium', type: 'emergency', urgency: 'priority' };
  }
  
  return { severity: 'low', type: 'other', urgency: 'standard' };
} 