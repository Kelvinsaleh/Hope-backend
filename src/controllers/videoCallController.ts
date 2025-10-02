import { Request, Response } from "express";
import { RescuePair } from "../models/RescuePair";
import { User } from "../models/User";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

interface VideoCallSession {
  _id?: Types.ObjectId;
  callId: string;
  matchId: Types.ObjectId;
  initiatorId: Types.ObjectId;
  participantId: Types.ObjectId;
  status: 'initiated' | 'ringing' | 'active' | 'ended';
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // in minutes
  maxDuration: number;
  type: 'peer_support' | 'crisis' | 'group';
  signalingData?: any;
}

// Create video call session
export const createVideoCall = async (req: Request, res: Response) => {
  try {
    const { matchId, participantId, type = 'peer_support', maxDuration = 60 } = req.body;
    const initiatorId = new Types.ObjectId(req.user._id);
    const participantObjectId = new Types.ObjectId(participantId);

    // Check if initiator has premium access
    const initiator = await User.findById(initiatorId).select('subscription').lean();
    if (!initiator?.subscription?.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Video calls are available for Premium users only. Please upgrade your plan.',
        requiresPremium: true
      });
    }

    // Verify match exists and users are participants
    const match = await RescuePair.findById(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        error: "Match not found"
      });
    }

    const isValidMatch = (match.user1Id.toString() === initiatorId.toString() && 
                         match.user2Id.toString() === participantObjectId.toString()) ||
                        (match.user1Id.toString() === participantObjectId.toString() && 
                         match.user2Id.toString() === initiatorId.toString());

    if (!isValidMatch) {
      return res.status(403).json({
        success: false,
        error: "You can only call your matched support partner"
      });
    }

    // Check for existing active call
    // In real implementation, check VideoCall collection
    const callId = `call_${matchId}_${Date.now()}`;

    const videoCall: VideoCallSession = {
      callId,
      matchId: new Types.ObjectId(matchId),
      initiatorId,
      participantId: participantObjectId,
      status: 'initiated',
      maxDuration,
      type,
      signalingData: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        roomId: `match_${matchId}_${callId}`,
        initiator: initiatorId.toString(),
        participant: participantObjectId.toString()
      }
    };

    // In real implementation, save to VideoCall collection
    // await VideoCall.create(videoCall);

    logger.info(`Video call created: ${callId} between ${initiatorId} and ${participantObjectId}`);

    res.json({
      success: true,
      callId,
      data: videoCall
    });

  } catch (error) {
    logger.error("Error creating video call:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to create video call" 
    });
  }
};

// Get video call status
export const getVideoCallStatus = async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    // In real implementation, get from VideoCall collection
    // const call = await VideoCall.findOne({ callId });
    
    // Mock response for now
    const call = {
      callId,
      status: 'initiated',
      participants: [userId],
      startedAt: new Date(),
      maxDuration: 60
    };

    res.json({
      success: true,
      call
    });

  } catch (error) {
    logger.error("Error getting video call status:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get call status" 
    });
  }
};

// Join video call
export const joinVideoCall = async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    // In real implementation, update VideoCall status to 'active'
    logger.info(`User ${userId} joined video call ${callId}`);

    res.json({
      success: true,
      message: 'Joined video call successfully',
      signalingData: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        roomId: callId,
        userId: userId.toString()
      }
    });

  } catch (error) {
    logger.error("Error joining video call:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to join video call" 
    });
  }
};

// End video call
export const endVideoCall = async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    // In real implementation, update VideoCall status to 'ended'
    logger.info(`Video call ${callId} ended by user ${userId}`);

    res.json({
      success: true,
      message: 'Video call ended successfully'
    });

  } catch (error) {
    logger.error("Error ending video call:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to end video call" 
    });
  }
}; 