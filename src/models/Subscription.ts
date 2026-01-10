import mongoose, { Document, Schema } from "mongoose";

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  startDate?: Date;
  expiresAt?: Date;
  activatedAt?: Date;
  paystackReference?: string;
  paystackAccessCode?: string;
  paystackTransactionId?: string;
  paystackSubscriptionCode?: string;
  paystackData?: any;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true 
    },
    planId: { 
      type: String, 
      required: true,
      enum: ['monthly', 'annually']
    },
    planName: { type: String, required: true },
    amount: { type: Number, required: true }, // Amount in base currency (USD)
    currency: { type: String, default: 'USD', enum: ['USD', 'KES'] },
    status: { 
      type: String, 
      required: true,
      enum: ['pending', 'active', 'cancelled', 'expired'],
      default: 'pending',
      index: true
    },
    startDate: { type: Date },
    expiresAt: { type: Date, index: true },
    activatedAt: { type: Date },
    paystackReference: { type: String, index: true },
    paystackAccessCode: { type: String },
    paystackTransactionId: { type: String },
    paystackSubscriptionCode: { type: String, index: true },
    paystackData: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

// Index for efficient querying
SubscriptionSchema.index({ userId: 1, status: 1, expiresAt: 1 });

export const Subscription = mongoose.models.Subscription || mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
