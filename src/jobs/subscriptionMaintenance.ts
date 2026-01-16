import { Types } from "mongoose";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { logger } from "../utils/logger";

const TRIAL_DAYS = Number(process.env.PREMIUM_TRIAL_DAYS || 7);
const PLAN_DURATION: Record<string, number> = {
  monthly: 30,
  annually: 365,
  trial: TRIAL_DAYS
};

function computeExpiryDate(planId: string, from: Date = new Date()): Date {
  const days = PLAN_DURATION[planId] || PLAN_DURATION.monthly;
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

async function processTrialTransitions(now: Date) {
  // Notify trials ending within 48 hours
  const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const trialsEndingSoon = await Subscription.find({
    status: "trialing",
    trialEndsAt: { $gt: now, $lte: soon }
  }).limit(200);

  for (const trial of trialsEndingSoon) {
    try {
      const { createNotification } = await import("../controllers/notificationController");
      await createNotification({
        userId: new Types.ObjectId(trial.userId),
        actorId: new Types.ObjectId(trial.userId),
        type: "billing",
        metadata: { message: "Your trial ends soon. Upgrade to keep premium active." }
      });
    } catch (err) {
      logger.warn("Failed to send trial-ending notification", err);
    }
  }

  const trials = await Subscription.find({
    status: "trialing",
    trialEndsAt: { $lte: now }
  }).limit(200);

  for (const trial of trials) {
    const userId = new Types.ObjectId(trial.userId);

    // If user cancelled during trial, expire it
    if (trial.autoRenew === false || trial.status === "cancelled" || trial.cancelledAt) {
      trial.status = "expired";
      trial.autoRenew = false;
      trial.expiresAt = trial.trialEndsAt || now;
      await trial.save();

      await User.findByIdAndUpdate(userId, {
        $set: {
          "subscription.isActive": false,
          "subscription.tier": "free",
          "subscription.expiresAt": trial.expiresAt || now
        },
        $unset: { trialEndsAt: "", trialStartedAt: "" }
      });

      continue;
    }

    // Auto-activate paid subscription after trial if not cancelled
    const paidExpiry = computeExpiryDate(trial.planId || "monthly", now);
    trial.status = "active";
    trial.activatedAt = now;
    trial.startDate = trial.startDate || trial.trialStartsAt || now;
    trial.expiresAt = paidExpiry;
    await trial.save();

    await User.findByIdAndUpdate(userId, {
      $set: {
        "subscription.isActive": true,
        "subscription.tier": "premium",
        "subscription.subscriptionId": trial._id,
        "subscription.planId": trial.planId,
        "subscription.activatedAt": now,
        "subscription.expiresAt": paidExpiry,
        trialUsed: true
      },
      $unset: { trialEndsAt: "", trialStartedAt: "" }
    });
  }
}

async function expireLapsedSubscriptions(now: Date) {
  const expiredSubs = await Subscription.find({
    status: "active",
    expiresAt: { $lte: now }
  }).limit(200);

  for (const sub of expiredSubs) {
    const userId = new Types.ObjectId(sub.userId);
    sub.status = "expired";
    sub.autoRenew = false;
    await sub.save();

    await User.findByIdAndUpdate(userId, {
      $set: {
        "subscription.isActive": false,
        "subscription.tier": "free",
        "subscription.expiresAt": sub.expiresAt || now
      },
      $unset: { trialEndsAt: "", trialStartedAt: "" }
    });
  }
}

export async function runSubscriptionMaintenance() {
  const now = new Date();
  try {
    await processTrialTransitions(now);
    await expireLapsedSubscriptions(now);
  } catch (error) {
    logger.warn("Subscription maintenance job failed", error);
  }
}

export function startSubscriptionMaintenanceJob() {
  const intervalMinutes = Number(process.env.SUBSCRIPTION_CRON_MINUTES || 30);
  // Run once on boot, then on interval
  runSubscriptionMaintenance().catch((err) => logger.warn("Initial subscription maintenance run failed", err));
  return setInterval(() => {
    runSubscriptionMaintenance().catch((err) => logger.warn("Recurring subscription maintenance failed", err));
  }, intervalMinutes * 60 * 1000);
}

