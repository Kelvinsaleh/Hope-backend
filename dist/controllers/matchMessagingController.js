"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchMessages = exports.sendMatchMessage = void 0;
const RescuePair_1 = require("../models/RescuePair");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// AI Content Moderation
async function moderateContent(message) {
    const prohibitedPatterns = [
        { pattern: /\b(suicide|kill myself|end it all|want to die)\b/i, severity: 'critical', flag: 'self_harm' },
        { pattern: /\b(hurt myself|cutting|self harm|punish myself)\b/i, severity: 'high', flag: 'self_harm' },
        { pattern: /\b(phone number|address|email|meet up|personal info)\b/i, severity: 'medium', flag: 'personal_info' },
        { pattern: /\b(harassment|abuse|threat|violence)\b/i, severity: 'high', flag: 'harassment' },
        { pattern: /(.)\1{10,}/i, severity: 'low', flag: 'spam' }, // Repeated characters
    ];
    const flags = [];
    let highestSeverity = 'low';
    let reason = '';
    for (const { pattern, severity, flag } of prohibitedPatterns) {
        if (pattern.test(message)) {
            flags.push(flag);
            if (severity === 'critical' || (severity === 'high' && highestSeverity !== 'critical')) {
                highestSeverity = severity;
                reason = severity === 'critical' ? 'Crisis language detected' : 'Inappropriate content detected';
            }
        }
    }
    // Message length check
    if (message.length > 1000) {
        flags.push('too_long');
        highestSeverity = 'low';
        reason = 'Message too long';
    }
    const isAllowed = flags.length === 0 || (flags.length === 1 && flags[0] === 'too_long');
    return {
        isAllowed,
        reason: isAllowed ? undefined : reason,
        severity: isAllowed ? undefined : highestSeverity,
        flags: flags.length > 0 ? flags : undefined
    };
}
// Send message in match chat
const sendMatchMessage = async (req, res) => {
    try {
        const { matchId } = req.params;
        const { message } = req.body;
        const senderId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: "Message content is required"
            });
        }
        // Verify match exists and user is participant
        const match = await RescuePair_1.RescuePair.findById(matchId);
        if (!match) {
            return res.status(404).json({
                success: false,
                error: "Match not found"
            });
        }
        const isParticipant = match.user1Id.toString() === senderId.toString() ||
            match.user2Id.toString() === senderId.toString();
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                error: "You are not a participant in this match"
            });
        }
        // Content moderation
        const moderation = await moderateContent(message);
        if (!moderation.isAllowed) {
            logger_1.logger.warn(`Content violation in match ${matchId}:`, {
                senderId,
                message: message.substring(0, 100),
                reason: moderation.reason,
                severity: moderation.severity,
                flags: moderation.flags
            });
            // Handle critical violations (crisis language)
            if (moderation.severity === 'critical') {
                // Trigger crisis support escalation
                try {
                    // You would implement crisis escalation here
                    logger_1.logger.error(`CRISIS ESCALATION: User ${senderId} in match ${matchId} used crisis language`);
                    // Could integrate with crisis support services here
                    // await escalateToCrisisSupport(senderId, message, matchId);
                }
                catch (crisisError) {
                    logger_1.logger.error('Failed to escalate to crisis support:', crisisError);
                }
                return res.status(400).json({
                    success: false,
                    error: 'Your message contains concerning language. Crisis support has been notified and will reach out to you.',
                    severity: 'high',
                    supportMessage: 'If you\'re in immediate danger, please contact emergency services or a crisis hotline.',
                    crisisResources: {
                        hotline: {
                            name: 'National Suicide Prevention Lifeline',
                            number: '988',
                            available: '24/7'
                        }
                    }
                });
            }
            return res.status(400).json({
                success: false,
                error: moderation.reason,
                severity: moderation.severity,
                flags: moderation.flags
            });
        }
        // Create and save message (simplified - you'd use a proper Message model)
        const messageData = {
            matchId: new mongoose_1.Types.ObjectId(matchId),
            senderId,
            receiverId: match.user1Id.toString() === senderId.toString() ? match.user2Id : match.user1Id,
            content: message,
            timestamp: new Date(),
            isModerated: true,
            moderationFlags: moderation.flags,
            isRead: false,
            messageType: 'text'
        };
        // In a real implementation, save to Message collection
        // const savedMessage = await Message.create(messageData);
        // Update match last activity
        await RescuePair_1.RescuePair.findByIdAndUpdate(matchId, {
            lastActivity: new Date(),
            messageCount: { $inc: 1 }
        });
        logger_1.logger.info(`Message sent in match ${matchId} by user ${senderId}`);
        res.json({
            success: true,
            message: messageData,
            moderated: true
        });
    }
    catch (error) {
        logger_1.logger.error("Error sending match message:", error);
        res.status(500).json({
            success: false,
            error: "Failed to send message"
        });
    }
};
exports.sendMatchMessage = sendMatchMessage;
// Get match chat history
const getMatchMessages = async (req, res) => {
    try {
        const { matchId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Verify match exists and user is participant
        const match = await RescuePair_1.RescuePair.findById(matchId)
            .populate('user1Id', 'name email')
            .populate('user2Id', 'name email');
        if (!match) {
            return res.status(404).json({
                success: false,
                error: "Match not found"
            });
        }
        const isParticipant = match.user1Id._id.toString() === userId.toString() ||
            match.user2Id._id.toString() === userId.toString();
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                error: "You are not a participant in this match"
            });
        }
        // In a real implementation, get messages from Message collection
        // const messages = await Message.find({ matchId }).sort({ timestamp: 1 });
        // For now, return mock messages
        const messages = [
            {
                id: '1',
                role: 'system',
                content: 'You are now connected! Remember to be respectful and supportive.',
                timestamp: match.acceptedAt
            }
        ];
        res.json({
            success: true,
            messages,
            matchInfo: {
                id: match._id,
                status: match.status,
                acceptedAt: match.acceptedAt,
                participants: [
                    { id: match.user1Id._id, name: match.user1Id.name },
                    { id: match.user2Id._id, name: match.user2Id.name }
                ]
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting match messages:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get messages"
        });
    }
};
exports.getMatchMessages = getMatchMessages;
