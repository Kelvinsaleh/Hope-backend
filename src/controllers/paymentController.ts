import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";
import { Types } from "mongoose";

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'annually';
  paystackPlanCode: string;
}

const PLANS: PaymentPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly Plan',
    price: 7.99,
    currency: 'KES',
    interval: 'monthly',
    paystackPlanCode: 'PLN_monthly_premium'
  },
  {
    id: 'annually',
    name: 'Annual Plan',
    price: 79.99,
    currency: 'KES',
    interval: 'annually',
    paystackPlanCode: 'PLN_annual_premium'
  }
];

// Initialize payment with Paystack
export const initializePayment = async (req: Request, res: Response) => {
  try {
     const { email, planId, metadata } = req.body;
    // Use authenticated user's ID from JWT/session
    const userId = req.user?._id; // Ensure your auth middleware sets req.user._id

    logger.info("Payment initialization request:", { email, planId, userId, metadata });

    if (!email || !planId || !userId) {
      logger.error("Missing required fields:", { email: !!email, planId: !!planId, userId: !!userId });
      return res.status(400).json({
        success: false,
        error: "Missing required fields: email, planId, userId"
      });
    }

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return res.status(400).json({
        success: false,
        error: "Invalid plan selected"
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Create Paystack transaction
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: Math.round(plan.price * 100), // Convert to kobo/cent
        currency: plan.currency,
        reference: `HOPE_${Date.now()}_${userId}`,
        metadata: {
          userId,
          planId,
          planName: plan.name,
          ...metadata
        },
        callback_url: metadata?.callback_url || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`
      })
    });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      throw new Error(paystackData.message || 'Failed to initialize payment');
    }

    // Store pending subscription
    const pendingSubscription = new Subscription({
      userId: new Types.ObjectId(userId),
      planId,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency,
      status: 'pending',
      paystackReference: paystackData.data.reference,
      paystackAccessCode: paystackData.data.access_code
    });

    await pendingSubscription.save();

    res.json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference
    });

  } catch (error) {
    logger.error("Payment initialization error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to initialize payment"
    });
  }
};

// Verify payment with Paystack
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: "Payment reference is required"
      });
    }

    // Verify with Paystack
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status || paystackData.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: "Payment verification failed"
      });
    }

    const transaction = paystackData.data;
    const userId = transaction.metadata.userId;
    const planId = transaction.metadata.planId;

    // Find pending subscription
    const pendingSubscription = await Subscription.findOne({
      paystackReference: reference,
      status: 'pending'
    });

    if (!pendingSubscription) {
      return res.status(404).json({
        success: false,
        error: "Pending subscription not found"
      });
    }

    // Calculate subscription dates
    const now = new Date();
    const expiresAt = new Date();
    
    if (planId === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (planId === 'annually') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Update subscription to active
    pendingSubscription.status = 'active';
    pendingSubscription.startDate = now;
    pendingSubscription.expiresAt = expiresAt;
    pendingSubscription.activatedAt = now;
    pendingSubscription.paystackTransactionId = transaction.id;
    await pendingSubscription.save();

    // Deactivate any existing active subscriptions
    await Subscription.updateMany(
      {
        userId: pendingSubscription.userId,
        status: 'active',
        _id: { $ne: pendingSubscription._id }
      },
      { status: 'cancelled' }
    );

    // Update user's subscription status in User model
    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.isActive': true,
        'subscription.tier': 'premium',
        'subscription.subscriptionId': pendingSubscription._id,
        'subscription.planId': planId,
        'subscription.activatedAt': now,
        'subscription.expiresAt': expiresAt
      }
    });

    logger.info(`Payment verified and user ${userId} upgraded to premium`);

    res.json({
      success: true,
      message: "Payment verified successfully",
      subscription: {
        id: pendingSubscription._id,
        planId,
        status: 'active',
        expiresAt,
        userId: userId
      }
    });

  } catch (error) {
    logger.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify payment"
    });
  }
};

// Webhook handler for Paystack events
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    const body = JSON.stringify(req.body);

    // Verify webhook signature (implement proper verification)
    // For now, we'll process the webhook directly

    const event = req.body;

    if (event.event === 'charge.success') {
      const transaction = event.data;
      const reference = transaction.reference;

      // Find and update subscription
      const subscription = await Subscription.findOne({
        paystackReference: reference,
        status: 'pending'
      });

      if (subscription) {
        subscription.status = 'active';
        subscription.paystackTransactionId = transaction.id;
        await subscription.save();
      }
    }

    res.status(200).json({ received: true });

  } catch (error) {
    logger.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}; 
