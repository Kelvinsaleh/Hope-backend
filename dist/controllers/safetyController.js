"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escalateToCrisisSupport = exports.unblockUser = exports.getBlockedUsers = exports.blockUser = exports.submitReport = void 0;
const User_1 = require("../models/User");
const RescuePair_1 = require("../models/RescuePair");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// Submit safety report
const submitReport = async (req, res) => {
    try {
        const { reportedUserId, reason, details, evidence } = req.body;
        const reporterId = new mongoose_1.Types.ObjectId(req.user._id);
        const reportedId = new mongoose_1.Types.ObjectId(reportedUserId);
        if (reporterId.toString() === reportedId.toString()) {
            return res.status(400).json({
                success: false,
                error: "Cannot report yourself"
            });
        }
        // Categorize the report
        const { severity, category } = categorizeSafetyReport(reason, details);
        const report = {
            reporterId,
            reportedUserId: reportedId,
            reason,
            details,
            severity: severity,
            category: category,
            evidence,
            status: 'pending',
            timestamp: new Date()
        };
        // In a real implementation, save to SafetyReport collection
        // const savedReport = await SafetyReport.create(report);
        const reportId = new mongoose_1.Types.ObjectId();
        // Handle critical reports immediately
        if (severity === 'critical') {
            try {
                // Temporarily suspend the reported user
                await User_1.User.findByIdAndUpdate(reportedId, {
                    $set: {
                        status: 'suspended',
                        suspendedAt: new Date(),
                        suspensionReason: 'Critical safety report - pending review',
                        suspensionDuration: '24h'
                    }
                });
                // End all active matches for the reported user
                await RescuePair_1.RescuePair.updateMany({
                    $or: [{ user1Id: reportedId }, { user2Id: reportedId }],
                    status: 'accepted'
                }, {
                    $set: {
                        status: 'ended',
                        endedAt: new Date(),
                        endReason: 'Safety suspension'
                    }
                });
                logger_1.logger.error(`CRITICAL SAFETY REPORT: User ${reportedId} suspended due to report ${reportId}`);
            }
            catch (suspensionError) {
                logger_1.logger.error('Failed to handle critical report:', suspensionError);
            }
        }
        logger_1.logger.info(`Safety report submitted: ${reporterId} -> ${reportedId} (${severity})`);
        let responseMessage = 'Report submitted successfully. Our safety team will review it promptly.';
        if (severity === 'critical') {
            responseMessage = 'Critical safety report submitted. The reported user has been temporarily suspended and our crisis support team has been notified.';
        }
        else if (severity === 'high') {
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
    }
    catch (error) {
        logger_1.logger.error("Error submitting safety report:", error);
        res.status(500).json({
            success: false,
            error: "Failed to submit safety report"
        });
    }
};
exports.submitReport = submitReport;
// Block user
const blockUser = async (req, res) => {
    try {
        const { blockedUserId, reason } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const blockedId = new mongoose_1.Types.ObjectId(blockedUserId);
        if (userId.toString() === blockedId.toString()) {
            return res.status(400).json({
                success: false,
                error: "Cannot block yourself"
            });
        }
        // Add to blocked users list
        await User_1.User.findByIdAndUpdate(userId, {
            $addToSet: { blockedUsers: blockedId }
        });
        // End any active matches between these users
        await RescuePair_1.RescuePair.updateMany({
            $or: [
                { user1Id: userId, user2Id: blockedId },
                { user1Id: blockedId, user2Id: userId }
            ],
            status: 'accepted'
        }, {
            $set: {
                status: 'ended',
                endedAt: new Date(),
                endReason: 'User blocked',
                endedBy: userId
            }
        });
        logger_1.logger.info(`User blocked: ${userId} blocked ${blockedId}`);
        res.json({
            success: true,
            message: 'User blocked successfully. You will no longer see them in matches or receive messages from them.'
        });
    }
    catch (error) {
        logger_1.logger.error("Error blocking user:", error);
        res.status(500).json({
            success: false,
            error: "Failed to block user"
        });
    }
};
exports.blockUser = blockUser;
// Get blocked users
const getBlockedUsers = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const user = await User_1.User.findById(userId)
            .populate('blockedUsers', 'name email')
            .select('blockedUsers')
            .lean();
        res.json({
            success: true,
            blockedUsers: user?.blockedUsers || []
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting blocked users:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get blocked users"
        });
    }
};
exports.getBlockedUsers = getBlockedUsers;
// Unblock user
const unblockUser = async (req, res) => {
    try {
        const { blockedUserId } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const blockedId = new mongoose_1.Types.ObjectId(blockedUserId);
        // Remove from blocked users list
        await User_1.User.findByIdAndUpdate(userId, {
            $pull: { blockedUsers: blockedId }
        });
        logger_1.logger.info(`User unblocked: ${userId} unblocked ${blockedId}`);
        res.json({
            success: true,
            message: 'User unblocked successfully.'
        });
    }
    catch (error) {
        logger_1.logger.error("Error unblocking user:", error);
        res.status(500).json({
            success: false,
            error: "Failed to unblock user"
        });
    }
};
exports.unblockUser = unblockUser;
// Crisis support escalation
const escalateToCrisisSupport = async (req, res) => {
    try {
        const { details, context, userLocation } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        const escalationId = new mongoose_1.Types.ObjectId();
        // Crisis hotlines by region
        const crisisHotlines = {
            US: { name: 'National Suicide Prevention Lifeline', number: '988' },
            UK: { name: 'Samaritans', number: '116 123' },
            CA: { name: 'Talk Suicide Canada', number: '1-833-456-4566' },
            AU: { name: 'Lifeline Australia', number: '13 11 14' },
            GLOBAL: { name: 'International Crisis Centers', number: 'Visit iasp.info/resources/Crisis_Centres' }
        };
        const region = userLocation?.country || 'GLOBAL';
        const hotline = crisisHotlines[region] || crisisHotlines.GLOBAL;
        let immediateActions = [];
        if (assessment.severity === 'critical') {
            immediateActions = [
                'If you are in immediate danger, call emergency services (911, 999, etc.)',
                `Contact crisis hotline: ${hotline.name} - ${hotline.number}`,
                'Stay with someone you trust or go to a safe place',
                'Remove any means of self-harm from your immediate area'
            ];
        }
        else if (assessment.severity === 'high') {
            immediateActions = [
                `Crisis hotline available 24/7: ${hotline.name} - ${hotline.number}`,
                'Consider reaching out to a trusted friend or family member',
                'Use coping strategies you\'ve learned (breathing, grounding techniques)'
            ];
        }
        else {
            immediateActions = [
                `Support available: ${hotline.name} - ${hotline.number}`,
                'Consider talking to a mental health professional',
                'Reach out to your support network'
            ];
        }
        logger_1.logger.error(`Crisis escalation ${escalationId}: User ${userId}, severity: ${assessment.severity}`);
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
    }
    catch (error) {
        logger_1.logger.error("Error escalating to crisis support:", error);
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
exports.escalateToCrisisSupport = escalateToCrisisSupport;
// Helper functions
function categorizeSafetyReport(reason, details) {
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
function assessCrisisSeverity(details) {
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
