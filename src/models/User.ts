import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  isEmailVerified?: boolean;
  verificationCode?: string;
  verificationCodeExpiry?: Date;
  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;
  lastActive?: Date;
  status?: 'online' | 'away' | 'offline' | 'suspended';
  subscription?: {
    isActive: boolean;
    tier: 'free' | 'premium';
    subscriptionId?: Types.ObjectId;
    planId?: string;
    activatedAt?: Date;
    expiresAt?: Date;
  };
  trialEndsAt?: Date; // When the 7-day premium trial ends (null if not on trial or trial expired)
  trialStartedAt?: Date;
  trialUsed?: boolean;
  blockedUsers?: Types.ObjectId[];
  suspendedAt?: Date;
  suspensionReason?: string;
  suspensionDuration?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isEmailVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationCodeExpiry: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },
    lastActive: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['online', 'away', 'offline', 'suspended'], 
      default: 'offline' 
    },
    subscription: {
      isActive: { type: Boolean, default: false },
      tier: { type: String, enum: ['free', 'premium'], default: 'free' },
      subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
      planId: { type: String },
      activatedAt: { type: Date },
      expiresAt: { type: Date }
    },
    trialEndsAt: { type: Date, index: true }, // When the 7-day premium trial ends
    trialStartedAt: { type: Date },
    trialUsed: { type: Boolean, default: false },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    suspensionDuration: { type: String }
  },
  { timestamps: true }
);

// Index for performance
UserSchema.index({ 'subscription.isActive': 1 });
UserSchema.index({ status: 1 });

export const User = mongoose.model<IUser>("User", UserSchema);
