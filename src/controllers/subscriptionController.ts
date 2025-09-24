import { Request, Response } from "express";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);

    const activeSubscription = await Subscription.findOne({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    const isPremium = !!activeSubscription;
    const userTier = isPremium ? 'premium' : 'free';

    res.json({
      success: true,
      isPremium,
      userTier,
      subscription: activeSubscription ? {
        id: activeSubscription._id,
        planId: activeSubscription.planId,
        planName: activeSubscription.planName,
        expiresAt: activeSubscription.expiresAt,
        status: activeSubscription.status
      } : null
    });

  } catch (error) {
    logger.error("Error getting subscription status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get subscription status"
    });
  }
};

export const createSubscription = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { planId, planName, amount, currency } = req.body;

    const subscription = new Subscription({
      userId,
      planId,
      planName,
      amount,
      currency,
      status: 'pending'
    });

    await subscription.save();

    res.json({
      success: true,
      message: "Subscription created",
      subscription: {
        id: subscription._id,
        planId,
        status: 'pending'
      }
    });

  } catch (error) {
    logger.error("Error creating subscription:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create subscription"
    });
  }
};

export const updateSubscription = async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);
    const updates = req.body;

    const subscription = await Subscription.findOneAndUpdate(
      { _id: subscriptionId, userId },
      updates,
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "Subscription not found"
      });
    }

    res.json({
      success: true,
      message: "Subscription updated",
      subscription
    });

  } catch (error) {
    logger.error("Error updating subscription:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update subscription"
    });
  }
};

export const checkPremiumAccess = async (req: Request, res: Response) => {
  try {
    const { feature } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const activeSubscription = await Subscription.findOne({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    const hasAccess = !!activeSubscription;
    const userTier = hasAccess ? 'premium' : 'free';

    res.json({
      success: true,
      hasAccess,
      userTier,
      feature,
      message: hasAccess 
        ? `Access granted to ${feature}` 
        : `Premium subscription required for ${feature}`
    });

  } catch (error) {
    logger.error("Error checking premium access:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check premium access"
    });
  }
};
