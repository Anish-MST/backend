import cron from "node-cron";
import * as firestoreService from "./firestoreService.js";
import * as driveService from "./driveService.js";
import * as gmailService from "./gmailService.js";
import { HTML_SIGNATURE } from "./provisionalOfferBuilder.js";

const CRON_SCHEDULE = "* * * * *"; 
const RETRY_INTERVAL_MINUTES = 2; // Increased to 2 for safer testing

const REQUIRED_DOCS_CONFIG = {
  aadhaar: { name: "Aadhaar Card", keys: ["aadhaar", "adhar", "uid"] },
  pan: { name: "PAN Card", keys: ["pan", "pancard"] },
  education: { name: "Education Certificate", keys: ["education", "degree", "certificate", "mark", "10th", "12th", "btech"] },
  photo: { name: "Passport Photo", keys: ["photo", "passport", "selfie"] }
};

export const initDocumentReminderCron = () => {
  console.log(`⏰ Cron Job Initialized [Testing Every Minute]`);

  cron.schedule(CRON_SCHEDULE, async () => {
    const cycleTime = new Date();
    console.log(`\n--- Verification Cycle: ${cycleTime.toLocaleTimeString()} ---`);

    try {
      const candidates = await firestoreService.getAllCandidates();
      const activeCandidates = candidates.filter(c => c.driveFolderId && c.status !== "Onboarded");

      for (const candidate of activeCandidates) {
        await processCandidateVerification(candidate, cycleTime);
      }
    } catch (error) {
      console.error("❌ Global Cron Error:", error.message);
    }
  });
};

async function processCandidateVerification(candidate, cycleTime) {
  try {
    let docStatus = candidate.docStatus && Object.keys(candidate.docStatus).length > 0
      ? JSON.parse(JSON.stringify(candidate.docStatus)) 
      : initializeDefaultStatus();

    const driveFiles = await driveService.listPdfFiles(candidate.driveFolderId);
    let pendingCount = 0;

    for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
      const fileFound = driveFiles.some(file => config.keys.some(k => file.name.toLowerCase().includes(k)));
      docStatus[key].uploaded = fileFound;
      if (!(docStatus[key].uploaded || docStatus[key].verified || docStatus[key].specialApproval)) pendingCount++;
    }

    const newLabel = pendingCount === 0 ? "All Documents Uploaded" : "Documents Pending";

    // Update only status/docs first
    await firestoreService.updateCandidate(candidate.id, { docStatus, status: newLabel });

    if (pendingCount > 0) {
      const lastSent = candidate.lastDocReminderAt ? new Date(candidate.lastDocReminderAt) : null;
      
      // Calculate gap between NOW (cycle start) and LAST SENT
      const diffMs = cycleTime - lastSent;
      const minutesSince = lastSent ? diffMs / (1000 * 60) : 999;

      // STRICT CHECK: If it was sent less than 1 minute ago, SKIP.
      if (minutesSince < RETRY_INTERVAL_MINUTES) {
        console.log(`[SKIP] ${candidate.name}: Sent ${minutesSince.toFixed(2)}m ago (Threshold: ${RETRY_INTERVAL_MINUTES}m)`);
        return; 
      }

      // --- CRITICAL FIX: UPDATE DB TIMESTAMP BEFORE SENDING MAIL ---
      await firestoreService.updateCandidate(candidate.id, {
        lastDocReminderAt: new Date().toISOString()
      });

      await sendReminderEmail(candidate, docStatus);
      console.log(`📧 [SENT] Reminder to ${candidate.name} (Last was ${minutesSince.toFixed(1)}m ago)`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${candidate.name}:`, err.message);
  }
}

function initializeDefaultStatus() {
  const status = {};
  for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
    status[key] = { name: config.name, uploaded: false, verified: false, specialApproval: false };
  }
  return status;
}
export function buildDocumentReminderHtml(candidate, docStatus) {
  const rows = Object.values(docStatus).map(doc => {
    let text = doc.verified || doc.specialApproval ? "Approved" : doc.uploaded ? "Uploaded" : "Missing";
    let color = text === "Approved" ? "#059669" : text === "Uploaded" ? "#2563eb" : "#dc2626";
    return `<tr><td style="padding:10px; border-bottom:1px solid #eee; color: #555;">${doc.name}</td><td style="padding:10px; border-bottom:1px solid #eee; text-align:right; color:${color}; font-weight:bold;">${text}</td></tr>`;
  }).join("");

  return `
    <div style="font-family: Arial, sans-serif; background: #f7f9fb; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; border: 1px solid #eee;">
        <h2 style="color: #1A73E8; margin-top: 0;">Onboarding Document Request</h2>
        <p style="color: #333;">Dear ${candidate.name},</p>
        <p style="color: #555;">To proceed with your formal offer, please upload the following documents to your secure Drive folder:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f1f8ff;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #1A73E8;">Document</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #1A73E8;">Status</th>
          </tr>
          ${rows}
        </table>

        <div style="margin-top: 25px; background: #f0f7ff; padding: 20px; border-radius: 6px; border: 1px solid #d1e9ff; text-align: center;">
          <a href="https://drive.google.com/drive/folders/${candidate.driveFolderId}" 
             style="display: inline-block; background: #1A73E8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Open Secure Drive Folder
          </a>
        </div>
        ${HTML_SIGNATURE}
      </div>
    </div>`;
}
async function sendReminderEmail(candidate, docStatus) {
  const html = buildDocumentReminderHtml(candidate, docStatus);
  await gmailService.sendMail({
    to: candidate.email,
    subject: "Action Required: Onboarding Documents - Mainstreamtek",
    html,
    skipCc: true 
  });
}