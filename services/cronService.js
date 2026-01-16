import cron from "node-cron";
import * as firestoreService from "./firestoreService.js";
import * as driveService from "./driveService.js";
import * as gmailService from "./gmailService.js";
import { buildCandidateDashboardHtml } from "./provisionalOfferBuilder.js";

const REQUIRED_DOCS_CONFIG = {
  nda: { name: "Signed NDA", keys: ["signed nda", "signed_nda", "nda_signed", "nda"] },
  aadhaar: { name: "Aadhaar Card", keys: ["aadhaar", "adhar", "uid"] },
  pan: { name: "PAN Card", keys: ["pan", "pancard"] },
  education: { name: "Education Certificate", keys: ["education", "degree", "mark", "certificate"] },
  photo: { name: "Passport Photo", keys: ["photo", "passport", "selfie"] }
};

export const initDocumentReminderCron = () => {
  console.log(`⏰ Cron Job Active: Monitoring 10am/2pm reminders & 24h reports.`);

  // 1. HOURLY CHECK FOR CANDIDATE REMINDERS
  cron.schedule("0 * * * *", async () => {
    const currentHour = new Date().getHours(); 
    try {
      const candidates = await firestoreService.getAllCandidates();
      for (const candidate of candidates) {
        if (!candidate.driveFolderId || candidate.status === "Onboarded") continue;

        // Check if current hour is in candidate's specific schedule
        const schedule = candidate.reminderTimes || [10, 14];
        if (schedule.includes(currentHour)) {
          if (candidate.status === "Waiting for HR NDA") {
             await checkHRUpload(candidate);
          } else if (candidate.status === "NDA & Docs Pending") {
             await processCandidateVerification(candidate);
          }
        }
      }
    } catch (error) { console.error("❌ Cron Cycle Error:", error.message); }
  });

  // 2. DAILY 24h SUMMARY REPORT TO ANISH
  cron.schedule("59 23 * * *", async () => {
    try {
      const candidates = await firestoreService.getAllCandidates();
      let reportHtml = `<h2>24-Hour Onboarding Summary Report</h2><table border="1" style="border-collapse:collapse; width:100%;">
        <tr style="background:#f2f2f2;"><th>Candidate</th><th>Status</th><th>Last Activity</th><th>Full Log</th></tr>`;

      candidates.forEach(c => {
        const lastLog = c.log ? c.log[c.log.length - 1] : { event: "N/A", timestamp: "" };
        const logHistory = (c.log || []).slice(-5).map(l => `• ${l.event}`).join("<br/>");
        reportHtml += `<tr>
          <td>${c.name}</td>
          <td>${c.status}</td>
          <td>${lastLog.event} (${new Date(lastLog.timestamp).toLocaleTimeString()})</td>
          <td style="font-size:11px;">${logHistory}</td>
        </tr>`;
      });
      reportHtml += `</table>`;

      await gmailService.sendMail({
        to: "anish@mainstreamtek.com",
        subject: `Daily System Log - ${new Date().toLocaleDateString()}`,
        html: reportHtml,
        skipCc: true
      });
    } catch (err) { console.error("Report Error:", err); }
  });
};

async function checkHRUpload(candidate) {
    const files = await driveService.listPdfFiles(candidate.driveFolderId);
    const ndaFromHR = files.find(f => f.name.toLowerCase().includes("nda") && !f.name.toLowerCase().includes("signed"));
    if (ndaFromHR) {
      const initialStatus = {};
      Object.keys(REQUIRED_DOCS_CONFIG).forEach(key => {
        initialStatus[key] = { name: REQUIRED_DOCS_CONFIG[key].name, uploaded: false, verified: false };
      });
      await firestoreService.updateCandidate(candidate.id, {
        status: "NDA & Docs Pending",
        docStatus: initialStatus,
        lastDocReminderAt: new Date().toISOString()
      });
      await gmailService.sendMail({
        to: candidate.email,
        subject: "Action Required: NDA & Document Submission - Mainstreamtek",
        html: buildCandidateDashboardHtml(candidate, initialStatus)
      });
      await firestoreService.addLog(candidate.id, "HR uploaded NDA. Initialized candidate dashboard.");
    }
}

async function processCandidateVerification(candidate) {
  const files = await driveService.listPdfFiles(candidate.driveFolderId);
  let docStatus = JSON.parse(JSON.stringify(candidate.docStatus || {}));
  let pendingCount = 0;

  for (const [key, config] of Object.entries(REQUIRED_DOCS_CONFIG)) {
    if (!docStatus[key]) docStatus[key] = { name: config.name, uploaded: false, verified: false };
    const found = files.some(f => config.keys.some(k => f.name.toLowerCase().includes(k)));
    docStatus[key].uploaded = found;
    if (!docStatus[key].uploaded && !docStatus[key].verified) pendingCount++;
  }

  await firestoreService.updateCandidate(candidate.id, { docStatus });

  if (pendingCount > 0) {
    await gmailService.sendMail({
      to: candidate.email,
      subject: "Reminder: Pending Onboarding Documents - Mainstreamtek",
      html: buildCandidateDashboardHtml(candidate, docStatus),
      skipCc: true
    });
    await firestoreService.addLog(candidate.id, `Sent scheduled reminder (${pendingCount} docs pending)`);
  }
}