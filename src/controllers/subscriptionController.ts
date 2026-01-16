import { Request, Response } from "express";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

const TRIAL_DAYS = Number(process.env.PREMIUM_TRIAL_DAYS || 7);
const TRIAL_COOLDOWN_DAYS = Number(process.env.PREMIUM_TRIAL_COOLDOWN_DAYS || 90); // enforce one-time or long cooldown
const PLAN_DURATION: Record<string, number> = {
  monthly: 30,
  annually: 365,
  trial: TRIAL_DAYS
};

function isTrialActive(trialEndsAt?: Date | string | null): boolean {
  if (!trialEndsAt) return false;
  const ends = new Date(trialEndsAt);
  return !Number.isNaN(ends.getTime()) && ends > new Date();
}

function computeExpiryDate(planId: string, from: Date = new Date()): Date {
  const days = PLAN_DURATION[planId] || PLAN_DURATION.monthly;
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

async function setUserToPremium(userId: Types.ObjectId, sub: any, clearTrial = true) {
  const update: any = {
    'subscription.isActive': true,
    'subscription.tier': 'premium',
    'subscription.subscriptionId': sub?._id,
    'subscription.planId': sub?.planId,
    'subscription.activatedAt': sub?.activatedAt || new Date(),
    'subscription.expiresAt': sub?.expiresAt || computeExpiryDate(sub?.planId || 'monthly')
  };

  if (clearTrial) {
    update.trialEndsAt = null;
    update.trialStartedAt = null;
  }

  await User.findByIdAndUpdate(userId, { $set: update, ...(clearTrial ? { $unset: { trialEndsAt: "", trialStartedAt: "" } } : {}) });
}

async function setUserToFree(userId: Types.ObjectId, expiresAt: Date = new Date()) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      'subscription.isActive': false,
      'subscription.tier': 'free',
      'subscription.expiresAt': expiresAt
    },
    $unset: { trialEndsAt: "", trialStartedAt: "" }
  });
}

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const now = new Date();

    const user = await User.findById(userId).lean();
    const userTrialEndsAt = user?.trialEndsAt || null;
    const userTrialStartedAt = (user as any)?.trialStartedAt || null;
    const trialActiveFromUser = isTrialActive(userTrialEndsAt);

    // Find an active or trialing subscription
    let activeSubscription = await Subscription.findOne({
      userId,
      status: { $in: ['active', 'trialing'] },
      expiresAt: { $gt: now }
    }).sort({ createdAt: -1 });

    // If a trial subscription has lapsed, mark it expired so it does not grant access and clear premium flags
    if (activeSubscription && activeSubscription.status === 'trialing' && activeSubscription.expiresAt && activeSubscription.expiresAt <= now) {
      activeSubscription.status = 'expired';
      activeSubscription.autoRenew = false;
      activeSubscription.cancelledAt = activeSubscription.expiresAt;
      await activeSubscription.save();
      await setUserToFree(userId, activeSubscription.expiresAt);
      activeSubscription = null;
    }

    const hasActivePaidSub = !!(activeSubscription && activeSubscription.status === 'active');
    const hasActiveTrialSub = !!(activeSubscription && activeSubscription.status === 'trialing');

    const trialEndsFromSub = activeSubscription?.trialEndsAt || activeSubscription?.expiresAt || null;
    const trialStartsFromSub = activeSubscription?.trialStartsAt || activeSubscription?.startDate || null;

    const trialEndsAt = hasActiveTrialSub ? trialEndsFromSub : (userTrialEndsAt || trialEndsFromSub);
    const trialStartedAt = hasActiveTrialSub ? trialStartsFromSub : (userTrialStartedAt || trialStartsFromSub);
    const trialActive = hasActiveTrialSub || isTrialActive(trialEndsAt) || trialActiveFromUser;

    const isPremium = hasActivePaidSub || trialActive;
    const userTier = isPremium ? 'premium' : 'free';

    res.json({
      success: true,
      isPremium,
      userTier,
      subscription: activeSubscription ? {
        id: activeSubscription._id,
        planId: activeSubscription.planId,
        planName: activeSubscription.planName,
        isActive: activeSubscription.status === 'active',
        expiresAt: activeSubscription.expiresAt,
        status: activeSubscription.status,
        trialEndsAt: activeSubscription.trialEndsAt || null,
        trialStartsAt: activeSubscription.trialStartsAt || activeSubscription.startDate || null,
        autoRenew: activeSubscription.autoRenew ?? true
      } : null,
      trial: {
        isActive: trialActive,
        trialEndsAt: trialEndsAt || null,
        trialStart: trialStartedAt || null,
        trialStartedAt: trialStartedAt || null,
        plan: activeSubscription?.planId || 'trial',
        willAutoBill: activeSubscription?.autoRenew ?? true,
        nextBillingDate: activeSubscription?.expiresAt || trialEndsAt || null
      }
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
    const userId = new Types.ObjectId(req.user._id);
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
    const userId = new Types.ObjectId(req.user._id);
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

export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const requesterUserId = req.user && req.user._id ? new Types.ObjectId(req.user._id) : null;
    const { subscriptionId, userId: bodyUserId } = req.body;

    // Determine which user to act on
    const targetUserId = bodyUserId ? new Types.ObjectId(bodyUserId) : requesterUserId;
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'User id is required' });
    }

    let subscription;

    if (subscriptionId) {
      subscription = await Subscription.findOneAndUpdate(
        { _id: subscriptionId, userId: targetUserId, status: 'active' },
        { status: 'cancelled', cancelledAt: new Date() },
        { new: true }
      );
    } else {
      // Cancel the most recent active subscription for the user
      subscription = await Subscription.findOneAndUpdate(
        { userId: targetUserId, status: 'active', expiresAt: { $gt: new Date() } },
        { status: 'cancelled', cancelledAt: new Date() },
        { sort: { createdAt: -1 }, new: true }
      );
    }

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Active subscription not found' });
    }

    // If subscription has a Paystack subscription code, try to disable it
    if (subscription.paystackSubscriptionCode) {
      try {
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
        await fetch(`https://api.paystack.co/subscription/disable`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code: subscription.paystackSubscriptionCode })
        });
      } catch (err) {
        logger.warn('Failed to disable Paystack subscription:', err);
      }
    }

    // Update local subscription and user record to free tier
    const cancelledAt = new Date();
    subscription.status = 'cancelled';
    subscription.cancelledAt = cancelledAt;
    subscription.autoRenew = false;
    await subscription.save();

    await User.findByIdAndUpdate(targetUserId, {
      $set: {
        'subscription.isActive': false,
        'subscription.tier': 'free',
        'subscription.expiresAt': cancelledAt
      },
      $unset: { trialEndsAt: "", trialStartedAt: "" }
    });

    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
};

export const checkPremiumAccess = async (req: Request, res: Response) => {
  try {
    const { feature } = req.params;
    const userId = new Types.ObjectId(req.user._id);

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

// Update user tier after successful payment
export const updateUserTier = async (req: Request, res: Response) => {
  try {
    const { userId, tier, subscriptionId, planId } = req.body;
    const userObjectId = new Types.ObjectId(userId);

    // Update user subscription status
    await User.findByIdAndUpdate(userObjectId, {
      $set: {
        'subscription.isActive': tier === 'premium',
        'subscription.tier': tier,
        'subscription.subscriptionId': subscriptionId,
        'subscription.planId': planId,
        'subscription.activatedAt': new Date()
      },
      ...(tier === 'premium'
        ? { $unset: { trialEndsAt: "", trialStartedAt: "" } }
        : {})
    });

    // If activating premium, also update/create subscription record
    if (tier === 'premium' && subscriptionId) {
      await Subscription.findByIdAndUpdate(subscriptionId, {
        $set: {
          status: 'active',
          activatedAt: new Date()
        }
      }, { upsert: true });
    }

    logger.info(`User tier updated: ${userId} -> ${tier}`);

    res.json({
      success: true,
      message: `User tier updated to ${tier}`,
      data: {
        userId,
        tier,
        subscriptionId,
        activatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error("Error updating user tier:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user tier"
    });
  }
};

// Start a 7-day free trial. Sets the user to premium immediately and schedules auto-billing unless cancelled.
export const startFreeTrial = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const now = new Date();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.trialEndsAt && user.trialEndsAt > now) {
      return res.status(400).json({ success: false, error: 'Trial already active', trialEndsAt: user.trialEndsAt });
    }

    // Hard guard: once used, block unless cooldown explicitly allows
    if ((user as any).trialUsed) {
      return res.status(400).json({ success: false, error: 'Trial already used' });
    }

    // Check prior trial subscriptions for safety (even if trialUsed was reset elsewhere)
    const lastTrialSub = await Subscription.findOne({
      userId,
      $or: [
        { planId: 'trial' },
        { status: 'trialing' },
        { trialEndsAt: { $exists: true } },
      ],
    }).sort({ createdAt: -1 }).lean() as any;

    if (lastTrialSub) {
      const lastTrialEnd = (lastTrialSub as any).trialEndsAt || (lastTrialSub as any).expiresAt || (lastTrialSub as any).createdAt;
      if (TRIAL_COOLDOWN_DAYS > 0 && lastTrialEnd) {
        const cooldownEndsAt = new Date(lastTrialEnd);
        cooldownEndsAt.setDate(cooldownEndsAt.getDate() + TRIAL_COOLDOWN_DAYS);
        if (now < cooldownEndsAt) {
          return res.status(400).json({
            success: false,
            error: 'Trial not eligible (cooldown)',
            cooldownEndsAt,
          });
        }
      }
      // If no cooldown window is set, treat any prior trial as ineligible
      if (TRIAL_COOLDOWN_DAYS <= 0) {
        return res.status(400).json({ success: false, error: 'Trial already used' });
      }
    }

    // Cancel any existing active subscriptions to avoid conflicts
    await Subscription.updateMany(
      { userId, status: { $in: ['active', 'trialing', 'pending'] } },
      { status: 'cancelled' }
    );

    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const trialSubscription = new Subscription({
      userId,
      planId: 'trial',
      planName: '7-day Free Trial',
      amount: 0,
      currency: 'USD',
      status: 'trialing',
      startDate: now,
      activatedAt: now,
      expiresAt: trialEndsAt,
      trialStartsAt: now,
      trialEndsAt,
      autoRenew: true
    });

    await trialSubscription.save();

    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.isActive': true,
        'subscription.tier': 'premium',
        'subscription.subscriptionId': trialSubscription._id,
        'subscription.planId': 'trial',
        'subscription.activatedAt': now,
        'subscription.expiresAt': trialEndsAt,
        trialEndsAt,
        trialStartedAt: now,
        trialUsed: true
      }
    });

    return res.json({
      success: true,
      message: 'Free trial started',
      trial: {
        trialEndsAt,
        trialStartedAt: now,
        trialStart: now,
        plan: 'trial',
        willAutoBill: true,
        status: 'trialing'
      }
    });
  } catch (error) {
    logger.error('Error starting free trial:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start free trial'
    });
  }
};
