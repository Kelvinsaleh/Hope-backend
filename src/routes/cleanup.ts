import express from "express";
import { authenticateToken } from "../middleware/auth";
import { Types } from "mongoose";
import { UserProfile } from "../models/UserProfile";

const router = express.Router();

router.use(authenticateToken);

// Cleanup corrupted profile
router.post("/fix-profile", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    console.log("🔧 Fixing corrupted profile for user:", userId.toString());
    
    // Get the current profile
    const currentProfile = await UserProfile.findOne({ userId }).lean();
    
    if (!currentProfile) {
      return res.json({ 
        success: true, 
        message: "No profile found, nothing to fix" 
      });
    }
    
    console.log("📊 Current profile:", currentProfile);
    
    // Extract only the valid fields
    const cleanProfile = {
      bio: (currentProfile as any).bio || "",
      challenges: (currentProfile as any).challenges || [],
      goals: (currentProfile as any).goals || [],
      communicationStyle: (currentProfile as any).communicationStyle || "gentle",
      experienceLevel: (currentProfile as any).experienceLevel || "beginner",
      interests: (currentProfile as any).interests || [],
      availability: (currentProfile as any).availability || {
        timezone: undefined,
        preferredTimes: [],
        daysAvailable: []
      },
      matchingPreferences: (currentProfile as any).matchingPreferences || {
        ageRange: { min: 18, max: 100 },
        challenges: [],
        goals: [],
        communicationStyle: [],
        experienceLevel: []
      },
      safetySettings: (currentProfile as any).safetySettings || {
        allowEmergencySupport: false,
        requireVerification: true,
        maxDistance: 0
      },
      isVerified: (currentProfile as any).isVerified || false,
      lastActive: (currentProfile as any).lastActive || new Date(),
      status: (currentProfile as any).status || "offline"
    };
    
    console.log("✅ Clean profile:", cleanProfile);
    
    // Replace the entire document with clean data
    await UserProfile.updateOne(
      { userId },
      { $set: cleanProfile },
      { upsert: true }
    );
    
    // Verify the fix
    const fixed = await UserProfile.findOne({ userId }).lean();
    console.log("🎉 Fixed profile:", fixed);
    
    res.json({ 
      success: true, 
      message: "Profile cleaned successfully",
      before: currentProfile,
      after: fixed
    });
  } catch (error) {
    console.error("❌ Error fixing profile:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fix profile",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;

