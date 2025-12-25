import cron from "node-cron";
import * as firestoreService from "./firestoreService.js";
import * as driveService from "./driveService.js";
import * as gmailService from "./gmailService.js";

/**
 * --------------------------------------------------
 * CONFIGURATION
 * --------------------------------------------------
 */

// 🧪 TESTING MODE: Every minute
const CRON_SCHEDULE = "* * * * *";
const EMAIL_RETRY_HOURS = 0; 

// 🚀 PRODUCTION MODE: Every 4 hours
// const CRON_SCHEDULE = "0 */4 * * *";
// const EMAIL_RETRY_HOURS = 24;

const SIGNATURE_HTML = `
  <br><br>
  <p style="margin:0; color: #333;">Thanks & regards,</p>
  <p style="margin:0; font-weight: bold; color: #1e40af;">Day1AI</p>
  <p style="margin:0; font-size: 12px; color: #666;">A Mainstreamtek Agentic AI initiative | Designed to think. Built to act.</p>
`;

// 3. Removed Passbook
const REQUIRED_DOCS_CONFIG = {
  aadhaar: { name: "Aadhaar Card", keys: ["aadhaar", "adhar", "uid"] },
  pan: { name: "PAN Card", keys: ["pan", "pancard"] },
  education: { name: "Education Certificate", keys: ["education", "degree", "certificate", "mark", "10th", "12th", "btech"] },
  photo: { name: "Passport Photo", keys: ["photo", "passport", "selfie"] }
};

/**
 * --------------------------------------------------
 * CRON INITIALIZER
 * --------------------------------------------------
 */
export const initDocumentReminderCron = () => {
  console.log(`⏰ Cron Job Initialized [Schedule: ${CRON_SCHEDULE}]`);

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`\n--- Verification Cycle: ${new Date().toLocaleString()} ---`);

    try {
      const candidates = await firestoreService.getAllCandidates();
      
      const activeCandidates = candidates.filter(
        c => c.driveFolderId && c.status !== "Onboarded"
      );

      for (const candidate of activeCandidates) {
        if (!candidate.email) {
          console.error(`❌ Data Error: Candidate "${candidate.name}" is missing an email. Skipping...`);
          continue; 
        }
        await processCandidateVerification(candidate);
      }
    } catch (error) {
      console.error("❌ Global Cron Error:", error.message);
    }
    
    console.log("--- Cycle Finished ---\n");
  });
};

/**
 * --------------------------------------------------
 * CORE VERIFICATION LOGIC
 * --------------------------------------------------
 */
async function processCandidateVerification(candidate) {
  try {
    let docStatus = candidate.docStatus && Object.keys(candidate.docStatus).length > 0
      ? JSON.parse(JSON.stringify(candidate.docStatus)) 
      : initializeDefaultStatus();

    // driveService.listPdfFiles already handles auto-deletion of non-PDFs
    const driveFiles = await driveService.listPdfFiles(candidate.driveFolderId);
    
    let hasChanges = false;
    let pendingCount = 0;

    for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
      const fileFound = driveFiles.some(file => 
        config.keys.some(keyword => file.name.toLowerCase().includes(keyword))
      );

      if (docStatus[key].uploaded !== fileFound) {
        docStatus[key].uploaded = fileFound;
        hasChanges = true;
      }

      const isDone = docStatus[key].uploaded || docStatus[key].verified || docStatus[key].specialApproval;
      if (!isDone) pendingCount++;
    }

    const newLabel = pendingCount === 0 ? "All Documents Uploaded" : "Documents Pending";
    if (candidate.status !== newLabel) hasChanges = true;

    if (hasChanges) {
      await firestoreService.updateCandidate(candidate.id, {
        docStatus,
        status: newLabel
      });
      console.log(`✅ Updated status for: ${candidate.name}`);
    }

    if (pendingCount > 0) {
      const lastSent = candidate.lastDocReminderAt ? new Date(candidate.lastDocReminderAt) : null;
      const hoursSince = lastSent ? (new Date() - lastSent) / (1000 * 60 * 60) : Infinity;

      if (hoursSince >= EMAIL_RETRY_HOURS) {
        await sendReminderEmail(candidate, docStatus);
        
        await firestoreService.updateCandidate(candidate.id, {
          lastDocReminderAt: new Date().toISOString()
        });
        console.log(`📧 Reminder sent to ${candidate.email} (No CC)`);
      }
    }

  } catch (err) {
    console.error(`❌ Error processing ${candidate.name}:`, err.message);
  }
}

/**
 * --------------------------------------------------
 * HELPERS
 * --------------------------------------------------
 */

function initializeDefaultStatus() {
  const status = {};
  for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
    status[key] = { name: config.name, uploaded: false, verified: false, specialApproval: false };
  }
  return status;
}

async function sendReminderEmail(candidate, docStatus) {
  const rows = Object.values(docStatus).map(doc => {
    // Only show documents relevant to the current REQUIRED_DOCS_CONFIG
    if (!REQUIRED_DOCS_CONFIG[Object.keys(docStatus).find(key => docStatus[key].name === doc.name)]) return "";
    
    let text = doc.verified || doc.specialApproval ? "Approved" : doc.uploaded ? "Uploaded" : "Missing";
    let color = text === "Approved" ? "#059669" : text === "Uploaded" ? "#2563eb" : "#dc2626";

    return `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #eee;">${doc.name}</td>
        <td style="padding:10px; border-bottom:1px solid #eee; text-align:right; color:${color}; font-weight:bold;">${text}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #1e40af;">Action Required: Missing Documents</h2>
      <p>Hi ${candidate.name},</p>
      <p>Our system has detected that some of your onboarding documents are still missing or require attention:</p>
      <table style="width: 100%; border-collapse: collapse;">
        ${rows}
      </table>
      <div style="margin-top: 25px; background: #f0f7ff; padding: 15px; border-radius: 5px;">
        <p style="margin:0; font-size: 14px;">Please upload the missing PDF files to your personal folder.</p>
        <div style="text-align: center; margin-top: 15px;">
          <a href="https://drive.google.com/drive/folders/${candidate.driveFolderId}" 
             style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Open Drive Folder
          </a>
        </div>
      </div>
      ${SIGNATURE_HTML}
    </div>
  `;

  // skipCc: true ensures this specific automated mail doesn't spam the HR CC list
  await gmailService.sendMail({
    to: candidate.email,
    subject: "Action Required: Onboarding Documents",
    html,
    skipCc: true 
  });
}