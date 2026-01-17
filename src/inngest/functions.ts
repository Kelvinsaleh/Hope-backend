import { inngest } from "./client";
import { functions as aiFunctions } from "./aiFunctions";

// Function to handle therapy session events
export const therapySessionHandler = inngest.createFunction(
  { id: "therapy-session-handler" },
  { event: "therapy/session.created" },
  async ({ event, step }) => {
    // Log the session creation
    await step.run("log-session-creation", async () => {
      console.log("New therapy session created:", event.data);
    });

    // Process the session data
    const processedData = await step.run("process-session-data", async () => {
      // Add any processing logic here
      return {
        ...event.data,
        processedAt: new Date().toISOString(),
      };
    });

    // Send follow-up notification if needed
    if (event.data.requiresFollowUp) {
      await step.run("send-follow-up", async () => {
        // Add notification logic here
        console.log("Sending follow-up for session:", event.data.sessionId);
      });
    }

    return {
      message: "Therapy session processed successfully",
      sessionId: event.data.sessionId,
      processedData,
    };
  }
);

// Function to handle mood tracking events
export const moodTrackingHandler = inngest.createFunction(
  { id: "mood-tracking-handler" },
  { event: "mood/updated" },
  async ({ event, step }) => {
    // Log the mood update
    await step.run("log-mood-update", async () => {
      console.log("Mood update received:", event.data);
    });

    // Analyze mood patterns
    const analysis = await step.run("analyze-mood-patterns", async () => {
      // Add mood analysis logic here
      return {
        trend: "improving", // This would be calculated based on historical data
        recommendations: ["Consider scheduling a therapy session"],
      };
    });

    // If mood is concerning, trigger an alert
    if (event.data.mood < 3) {
      // Assuming mood is on a scale of 1-5
      await step.run("trigger-alert", async () => {
        console.log("Triggering alert for concerning mood:", event.data);
        // Add alert logic here
      });
    }

    return {
      message: "Mood update processed",
      analysis,
    };
  }
);

// Function to handle activity completion events
export const activityCompletionHandler = inngest.createFunction(
  { id: "activity-completion-handler" },
  { event: "activity/completed" },
  async ({ event, step }) => {
    // Log the activity completion
    await step.run("log-activity-completion", async () => {
      console.log("Activity completed:", event.data);
    });

    // Update user progress
    const progress = await step.run("update-progress", async () => {
      // Add progress tracking logic here
      return {
        completedActivities: 1,
        totalPoints: 10,
      };
    });

    // Check if user has earned any achievements
    const achievements = await step.run("check-achievements", async () => {
      // Add achievement checking logic here
      return {
        newAchievements: ["First Activity Completed"],
      };
    });

    return {
      message: "Activity completion processed",
      progress,
      achievements,
    };
  }
);

// Journal reminder function - runs daily to remind users who haven't journaled in 3+ days
export const journalReminderHandler = inngest.createFunction(
  { id: "journal-reminder-handler" },
  { cron: "0 10 * * *" }, // Run daily at 10 AM UTC
  async ({ step }) => {
    // Import and run the journal reminder check
    const { checkAndSendJournalReminders } = await import('../jobs/journalReminderJob');
    
    await step.run("check-journal-reminders", async () => {
      return await checkAndSendJournalReminders();
    });

    return {
      message: "Journal reminder check completed",
    };
  }
);

// Intervention reminder function - runs daily to remind users to continue active interventions
export const interventionReminderHandler = inngest.createFunction(
  { id: "intervention-reminder-handler" },
  { cron: "0 14 * * *" }, // Run daily at 2 PM UTC
  async ({ step }) => {
    // Import and run the intervention reminder check
    const { checkAndSendInterventionReminders } = await import('../jobs/interventionReminderJob');
    
    await step.run("check-intervention-reminders", async () => {
      return await checkAndSendInterventionReminders();
    });

    return {
      message: "Intervention reminder check completed",
    };
  }
);

// Weekly report generator - runs every Saturday at 8 AM UTC
export const weeklyReportHandler = inngest.createFunction(
  { id: "weekly-report-handler" },
  { cron: "0 8 * * 6" }, // Run every Saturday at 8 AM UTC
  async ({ step }) => {
    // Import and run the weekly report scheduler
    const { runWeeklyReportSchedulerOnce } = await import('../jobs/weeklyReportScheduler');
    
    await step.run("generate-weekly-reports", async () => {
      return await runWeeklyReportSchedulerOnce();
    });

    return {
      message: "Weekly report generation completed",
    };
  }
);

// Add all functions to the exported array
export const functions = [
  therapySessionHandler,
  moodTrackingHandler,
  activityCompletionHandler,
  journalReminderHandler,
  interventionReminderHandler,
  weeklyReportHandler,
  ...aiFunctions,
];
