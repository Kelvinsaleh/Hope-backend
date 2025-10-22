import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  isEmailVerified?: boolean;
  verificationCode?: string;
  verificationCodeExpiry?: Date;
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
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    suspensionDuration: { type: String }
  },
  { timestamps: true }
);

// Index for performance
UserSchema.index({ email: 1 });
UserSchema.index({ 'subscription.isActive': 1 });
UserSchema.index({ status: 1 });

export const User = mongoose.model<IUser>("User", UserSchema);
