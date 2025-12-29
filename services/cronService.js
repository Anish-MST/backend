import cron from "node-cron";
import * as firestoreService from "./firestoreService.js";
import * as driveService from "./driveService.js";
import * as gmailService from "./gmailService.js";
import { buildCandidateDashboardHtml } from "./provisionalOfferBuilder.js";

const CRON_SCHEDULE = "* * * * *"; // Every minute
const RETRY_INTERVAL_MINUTES = 1;

// Config for tracking candidate's uploads
const REQUIRED_DOCS_CONFIG = {
  nda: { name: "Signed NDA", keys: ["signed nda", "signed_nda", "nda_signed"] }, // Specific naming
  aadhaar: { name: "Aadhaar Card", keys: ["aadhaar", "adhar", "uid"] },
  pan: { name: "PAN Card", keys: ["pan", "pancard"] },
  education: { name: "Education Certificate", keys: ["education", "degree", "mark", "btech"] },
  photo: { name: "Passport Photo", keys: ["photo", "passport", "selfie"] }
};

export const initDocumentReminderCron = () => {
  console.log(`⏰ Cron Job Active: Monitoring HR uploads & Candidate progress.`);

  cron.schedule(CRON_SCHEDULE, async () => {
    const cycleTime = new Date();
    try {
      const candidates = await firestoreService.getAllCandidates();
      
      for (const candidate of candidates) {
        if (!candidate.driveFolderId || candidate.status === "Onboarded") continue;

        // PHASE 1: Detect if Jamuna dropped the NDA
        if (candidate.status === "Waiting for HR NDA") {
          await checkHRUpload(candidate);
        } 
        // PHASE 2: Track Candidate progress
        else if (candidate.status === "NDA & Docs Pending") {
          await processCandidateVerification(candidate, cycleTime);
        }
      }
    } catch (error) {
      console.error("❌ Cron Cycle Error:", error.message);
    }
  });
};

/**
 * Checks if HR has dropped the unsigned NDA. 
 * If found, triggers the first email to the candidate.
 */
async function checkHRUpload(candidate) {
  const files = await driveService.listPdfFiles(candidate.driveFolderId);
  
  // Look for any file containing "NDA" but NOT "Signed"
  const ndaFromHR = files.find(f => f.name.toLowerCase().includes("nda") && !f.name.toLowerCase().includes("signed"));

  if (ndaFromHR) {
    console.log(`✨ HR NDA detected for ${candidate.name}. Initializing candidate workflow.`);
    
    const initialStatus = {};
    Object.keys(REQUIRED_DOCS_CONFIG).forEach(key => {
      initialStatus[key] = { name: REQUIRED_DOCS_CONFIG[key].name, uploaded: false, verified: false };
    });

    const html = buildCandidateDashboardHtml(candidate, initialStatus);

    // Update DB before sending email (Lock)
    await firestoreService.updateCandidate(candidate.id, {
      status: "NDA & Docs Pending",
      docStatus: initialStatus,
      lastDocReminderAt: new Date().toISOString()
    });

    await gmailService.sendMail({
      to: candidate.email,
      subject: "Action Required: NDA & Document Submission - Mainstreamtek",
      html
    });

    await firestoreService.addLog(candidate.id, "HR uploaded NDA. Initialized candidate dashboard.");
  }
}

/**
 * Standard progress tracking for candidate uploads
 */
async function processCandidateVerification(candidate, cycleTime) {
  const files = await driveService.listPdfFiles(candidate.driveFolderId);
  let docStatus = JSON.parse(JSON.stringify(candidate.docStatus));
  let pendingCount = 0;

  for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
    const found = files.some(f => config.keys.some(k => f.name.toLowerCase().includes(k)));
    docStatus[key].uploaded = found;
    if (!docStatus[key].uploaded && !docStatus[key].verified) pendingCount++;
  }

  const newLabel = pendingCount === 0 ? "All Documents Uploaded" : "NDA & Docs Pending";
  
  // Update status if changes detected
  if (JSON.stringify(docStatus) !== JSON.stringify(candidate.docStatus)) {
    await firestoreService.updateCandidate(candidate.id, { docStatus, status: newLabel });
  }

  // Reminder Logic
  if (pendingCount > 0) {
    const lastSent = candidate.lastDocReminderAt ? new Date(candidate.lastDocReminderAt) : new Date(0);
    if ((cycleTime - lastSent) / (1000 * 60) >= RETRY_INTERVAL_MINUTES) {
      
      // Update Lock
      await firestoreService.updateCandidate(candidate.id, { lastDocReminderAt: new Date().toISOString() });

      const html = buildCandidateDashboardHtml(candidate, docStatus);
      await gmailService.sendMail({
        to: candidate.email,
        subject: "Reminder: Pending Onboarding Documents - Mainstreamtek",
        html,
        skipCc: true
      });
    }
  }
}