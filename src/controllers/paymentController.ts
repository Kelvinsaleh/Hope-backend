import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";
import { Types } from "mongoose";

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const TRIAL_DAYS = Number(process.env.PREMIUM_TRIAL_DAYS || 7);

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'annually';
  paystackPlanCode: string;
}

// Exchange rate: 1 USD = 130 KES (approximate)
const USD_TO_KES_RATE = 130;

const PLANS: PaymentPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly Plan',
    price: 3.99, // $3.99 USD
    currency: 'USD',
    interval: 'monthly',
    paystackPlanCode: process.env.PAYSTACK_MONTHLY_PLAN_CODE || 'PLN_monthly_premium'
  },
  {
    id: 'annually',
    name: 'Annual Plan',
    price: 39.90, // $39.90 USD (10 months = 2 months free: $3.99 * 10)
    currency: 'USD',
    interval: 'annually',
    paystackPlanCode: process.env.PAYSTACK_ANNUAL_PLAN_CODE || 'PLN_annual_premium'
  }
];

const PLAN_DURATION: Record<string, number> = {
  monthly: 30,
  annually: 365,
  trial: TRIAL_DAYS
};

function computeExpiry(planId: string, from: Date = new Date()): Date {
  const days = PLAN_DURATION[planId] || PLAN_DURATION.monthly;
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

// Convert USD to KES for Paystack
function convertUsdToKes(usdAmount: number): number {
  return Math.round(usdAmount * USD_TO_KES_RATE);
}

async function applyPremiumToUser(userId: Types.ObjectId, subscription: any, clearTrial = true) {
  const update: any = {
    'subscription.isActive': true,
    'subscription.tier': 'premium',
    'subscription.subscriptionId': subscription?._id,
    'subscription.planId': subscription?.planId,
    'subscription.activatedAt': subscription?.activatedAt || new Date(),
    'subscription.expiresAt': subscription?.expiresAt || computeExpiry(subscription?.planId || 'monthly')
  };

  if (clearTrial) {
    update.trialEndsAt = null;
    update.trialStartedAt = null;
  }

  await User.findByIdAndUpdate(userId, {
    $set: update,
    ...(clearTrial ? { $unset: { trialEndsAt: "", trialStartedAt: "" } } : {})
  });
}

async function applyFreeToUser(userId: Types.ObjectId, expiresAt: Date = new Date()) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      'subscription.isActive': false,
      'subscription.tier': 'free',
      'subscription.expiresAt': expiresAt
    },
    $unset: { trialEndsAt: "", trialStartedAt: "" }
  });
}

// Initialize payment with Paystack
export const initializePayment = async (req: Request, res: Response) => {
  try {
    const { email, planId, metadata, userId: bodyUserId } = req.body;
    
    const userId = req.user?._id?.toString() || bodyUserId;

    if (!email || !planId || !userId) {
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

    // Convert USD to KES for Paystack (Paystack only accepts KES)
    const amountInKes = convertUsdToKes(plan.price);
    const amountInKobo = amountInKes * 100; // Convert KES to kobo (smallest unit)
    
    // Create Paystack transaction with KES
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: amountInKobo, // Amount in kobo (KES * 100)
        currency: 'KES', // Paystack only accepts KES
        reference: `HOPE_${Date.now()}_${userId}`,
        metadata: {
          userId,
          planId,
          planName: plan.name,
          usdAmount: plan.price, // Store USD amount in metadata
          kesAmount: amountInKes, // Store KES amount in metadata
          exchangeRate: USD_TO_KES_RATE,
          ...metadata
        },
        callback_url: metadata?.callback_url || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`
      })
    });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      throw new Error(paystackData.message || 'Failed to initialize payment');
    }

    // Store pending subscription (store USD amount, but Paystack will charge in KES)
    const pendingSubscription = new Subscription({
      userId: new Types.ObjectId(userId),
      planId,
      planName: plan.name,
      amount: plan.price, // Store USD amount
      currency: 'USD', // Store as USD for display
      status: 'pending',
      paystackReference: paystackData.data.reference,
      paystackAccessCode: paystackData.data.access_code
    });
    
    // Also store KES amount in metadata for reference
    (pendingSubscription as any).kesAmount = amountInKes;
    (pendingSubscription as any).usdAmount = plan.price;

    await pendingSubscription.save();

    res.json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference,
      // Return both USD and KES amounts for display
      usdAmount: plan.price,
      kesAmount: amountInKes,
      exchangeRate: USD_TO_KES_RATE,
      currency: 'KES' // Actual currency charged by Paystack
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
      },
      $unset: { trialEndsAt: "", trialStartedAt: "" }
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
    const signature = (req.headers['x-paystack-signature'] || '') as string;

    // req.body may be a Buffer when express.raw is used, otherwise stringify
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

    // Verify signature using HMAC SHA512
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
    if (!signature || expected !== signature) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const event = typeof req.body === 'object' && !(Buffer.isBuffer(req.body)) ? req.body : JSON.parse(rawBody.toString());

    // Handle different Paystack webhook events relevant to subscriptions
    if (event.event === 'subscription.create' || event.event === 'subscription.update' || event.event === 'subscription.disable') {
      const sub = event.data;
      const subCode = sub.subscription_code || sub.subscription || sub.id;
      if (subCode) {
        const local = await Subscription.findOne({ paystackSubscriptionCode: subCode });
        if (local) {
          local.status = sub.status || local.status;
          local.paystackData = sub;
          // update expiresAt if next_payment_date present (epoch seconds)
          if (sub.next_payment_date) {
            local.expiresAt = new Date(sub.next_payment_date * 1000);
          }
          if ((sub.status === 'active' || sub.status === 'success') && !local.expiresAt) {
            local.expiresAt = computeExpiry(local.planId || 'monthly', new Date());
          }
          if (!local.activatedAt && (sub.status === 'active' || sub.status === 'success')) {
            local.activatedAt = new Date();
          }
          await local.save();

          // Update user tier according to subscription status
          if (sub.status === 'active' || sub.status === 'success') {
            await applyPremiumToUser(local.userId as Types.ObjectId, local);
          } else if (sub.status === 'cancelled' || sub.status === 'disabled' || sub.status === 'inactive') {
            await applyFreeToUser(local.userId as Types.ObjectId, local.expiresAt || new Date());
          }
        }
      }
    } else if (event.event === 'invoice.payment_succeeded' || event.event === 'charge.success') {
      // For one-off payments or invoices, activate pending subscription if reference matches
      const transaction = event.data;
      const reference = transaction.reference || transaction.transaction_reference || transaction.id;
      if (reference) {
        const subscription = await Subscription.findOne({ paystackReference: reference, status: 'pending' });
        if (subscription) {
          subscription.status = 'active';
          subscription.paystackTransactionId = transaction.id || transaction.transaction_id;
          subscription.activatedAt = new Date();
          subscription.expiresAt = subscription.expiresAt || computeExpiry(subscription.planId || 'monthly');
          await subscription.save();
          await applyPremiumToUser(subscription.userId as Types.ObjectId, subscription);
        }
      }
    }

    res.status(200).json({ received: true });

  } catch (error) {
    logger.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}; 

// Create true Paystack subscription using plan code
export const createPaystackSubscription = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ success: false, error: 'Missing user or planId' });
    }

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ success: false, error: 'Invalid plan' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const trialEligible = !(user as any)?.trialUsed;
    const now = new Date();
    const trialEndsAt = trialEligible ? computeExpiry('trial', now) : null;

    // Ensure Paystack customer exists (search by email)
    const customerSearch = await fetch(`https://api.paystack.co/customer?email=${encodeURIComponent(user.email)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    const customerSearchData = await customerSearch.json();

    let customerCode: string | undefined;
    if (customerSearchData && customerSearchData.status && Array.isArray(customerSearchData.data) && customerSearchData.data.length > 0) {
      customerCode = customerSearchData.data[0].customer_code || customerSearchData.data[0].customer_code;
    }

    if (!customerCode) {
      // Create customer
      const createCustomer = await fetch('https://api.paystack.co/customer', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: user.email, first_name: user.name || undefined })
      });
      const created = await createCustomer.json();
      if (!created.status) {
        return res.status(500).json({ success: false, error: 'Failed to create Paystack customer' });
      }
      customerCode = created.data.customer_code || created.data.customer_code;
    }

    // Create subscription
    const subscriptionResp = await fetch('https://api.paystack.co/subscription', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ customer: customerCode, plan: plan.paystackPlanCode })
    });

    const subscriptionData = await subscriptionResp.json();
    if (!subscriptionData.status) {
      // If Paystack returns an error, pass it back
      return res.status(400).json({ success: false, error: subscriptionData.message || 'Failed to create subscription' });
    }

    // Save subscription record
    const paystackSub = subscriptionData.data;
    const initialStatus = trialEligible ? 'trialing' : (paystackSub.status || 'active');
    const initialExpires = trialEligible
      ? trialEndsAt
      : (paystackSub.next_payment_date ? new Date(paystackSub.next_payment_date * 1000) : computeExpiry(planId, now));

    const newSub = new Subscription({
      userId: new Types.ObjectId(userId),
      planId,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency,
      status: initialStatus,
      paystackSubscriptionCode: paystackSub.subscription_code || paystackSub.id,
      paystackData: paystackSub,
      startDate: paystackSub.start_date ? new Date(paystackSub.start_date * 1000) : now,
      activatedAt: now,
      expiresAt: initialExpires,
      trialStartsAt: trialEligible ? now : undefined,
      trialEndsAt: trialEligible ? trialEndsAt : undefined,
      autoRenew: true
    });

    await newSub.save();

    // Update user to premium if subscription is active
    if (initialStatus === 'active') {
      await applyPremiumToUser(userId as Types.ObjectId, newSub);
    } else {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'subscription.isActive': true,
          'subscription.tier': 'premium',
          'subscription.subscriptionId': newSub._id,
          'subscription.planId': planId,
          'subscription.activatedAt': now,
          'subscription.expiresAt': initialExpires,
          trialEndsAt: trialEndsAt,
          trialStartedAt: trialEligible ? now : undefined,
          trialUsed: true
        }
      });
    }

    // If Paystack provided an authorization_url for further action, return it
    return res.json({ 
      success: true, 
      subscription: paystackSub, 
      authorization_url: subscriptionData.data.authorization_url || null,
      trial: {
        isActive: trialEligible,
        trialEndsAt,
        trialStart: trialEligible ? now : null,
        plan: planId
      }
    });
  } catch (error) {
    logger.error('Error creating Paystack subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to create subscription' });
  }
};
