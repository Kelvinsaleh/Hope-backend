"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endVideoCall = exports.joinVideoCall = exports.getVideoCallStatus = exports.createVideoCall = void 0;
const RescuePair_1 = require("../models/RescuePair");
const User_1 = require("../models/User");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// Create video call session
const createVideoCall = async (req, res) => {
    try {
        const { matchId, participantId, type = 'peer_support', maxDuration = 60 } = req.body;
        const initiatorId = new mongoose_1.Types.ObjectId(req.user._id);
        const participantObjectId = new mongoose_1.Types.ObjectId(participantId);
        // Check if initiator has premium access
        const initiator = await User_1.User.findById(initiatorId).select('subscription').lean();
        if (!initiator?.subscription?.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Video calls are available for Premium users only. Please upgrade your plan.',
                requiresPremium: true
            });
        }
        // Verify match exists and users are participants
        const match = await RescuePair_1.RescuePair.findById(matchId);
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
        const videoCall = {
            callId,
            matchId: new mongoose_1.Types.ObjectId(matchId),
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
        logger_1.logger.info(`Video call created: ${callId} between ${initiatorId} and ${participantObjectId}`);
        res.json({
            success: true,
            callId,
            data: videoCall
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating video call:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create video call"
        });
    }
};
exports.createVideoCall = createVideoCall;
// Get video call status
const getVideoCallStatus = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
    }
    catch (error) {
        logger_1.logger.error("Error getting video call status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get call status"
        });
    }
};
exports.getVideoCallStatus = getVideoCallStatus;
// Join video call
const joinVideoCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // In real implementation, update VideoCall status to 'active'
        logger_1.logger.info(`User ${userId} joined video call ${callId}`);
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
    }
    catch (error) {
        logger_1.logger.error("Error joining video call:", error);
        res.status(500).json({
            success: false,
            error: "Failed to join video call"
        });
    }
};
exports.joinVideoCall = joinVideoCall;
// End video call
const endVideoCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // In real implementation, update VideoCall status to 'ended'
        logger_1.logger.info(`Video call ${callId} ended by user ${userId}`);
        res.json({
            success: true,
            message: 'Video call ended successfully'
        });
    }
    catch (error) {
        logger_1.logger.error("Error ending video call:", error);
        res.status(500).json({
            success: false,
            error: "Failed to end video call"
        });
    }
};
exports.endVideoCall = endVideoCall;
