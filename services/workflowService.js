import * as firestoreService from './firestoreService.js';
import * as gmailService from './gmailService.js';
import * as driveService from './driveService.js';
import { 
  buildProvisionalOfferEmail, 
  buildHRNotificationHtml, 
  buildCandidateDashboardHtml 
} from './provisionalOfferBuilder.js';
import * as pdfService from './pdfService.js';
import dotenv from 'dotenv';
dotenv.config();

export const ensureValidAccessToken = async () => {
  return true;
};

// 1. Start Workflow
export const startOnboardingWorkflow = async (candidateData) => {
  const candidateId = await firestoreService.createCandidate(candidateData);
  await firestoreService.addLog(candidateId, "Candidate record created.");
  await sendProvisionalOffer(candidateId, candidateData);
  return { candidateId };
};

// 2. Send Provisional Offer
export const sendProvisionalOffer = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();
    const htmlBody = buildProvisionalOfferEmail(candidate);
    
    await firestoreService.updateCandidate(candidateId, { status: "Provisional Offer Sent" });

    await gmailService.sendMail({
      to: candidate.email,
      subject: "Provisional Offer - Mainstreamtek",
      html: htmlBody
    });

    await firestoreService.addLog(candidateId, "Mail 1 (Provisional) Sent.");
  } catch (err) {
    console.error("❌ Provisional email failed:", err);
  }
};

// 3. Document Request Wrapper (Triggered on acceptance)
export const requestCandidateDocuments = async (candidateId, candidate) => {
  await sendFormalOfferAndDocRequest(candidateId, candidate);
};

/**
 * 4. PHASE 1: Notify HR (Jamuna) to drop the NDA
 * Instead of emailing the candidate, we notify HR and wait.
 */
/**
 * workflowService.js
 */
export const sendFormalOfferAndDocRequest = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    let webViewLink = candidate.driveFolderWebViewLink;
    let folderId = candidate.driveFolderId;

    // 1. Resolve Drive Folder & Permissions
    if (!webViewLink) {
      // This call now internally grants Jamuna 'Writer' access
      const folder = await driveService.createCandidateFolder(
        candidateId, 
        candidate.name, 
        "System_Admin", 
        candidate.email
      );
      folderId = folder.id;
      webViewLink = folder.webViewLink;
    }

    // 2. LOCK DB STATUS: Move to "Waiting for HR NDA"
    await firestoreService.updateCandidate(candidateId, {
      driveFolderId: folderId,
      driveFolderWebViewLink: webViewLink,
      status: "Waiting for HR NDA"
    });

    // 3. Notify Jamuna
    // Since she now has 'Edit' access, she can simply click the link and drop the file.
    const hrHtml = buildHRNotificationHtml({
      ...candidate,
      driveFolderWebViewLink: webViewLink
    });

    await gmailService.sendMail({
      to: "jamuna@mainstreamtek.com",
      subject: `Action Required: Upload NDA for ${candidate.name} - Mainstreamtek`,
      html: hrHtml,
      skipCc: true 
    });

    await firestoreService.addLog(candidateId, "Edit access granted to Jamuna. HR Notification sent.");

  } catch (error) {
    console.error("❌ Error in HR notification workflow:", error);
    await firestoreService.addLog(candidateId, `Workflow Error: ${error.message}`);
  }
};

/**
 * 5. Resend Mail
 */
export const resendMail = async (candidateId, mailNumber) => {
  const candidate = await firestoreService.getCandidate(candidateId);
  if (!candidate) return { success: false, message: "Candidate not found" };

  try {
    await ensureValidAccessToken();

    switch (mailNumber) {
      case 1:
        await gmailService.sendMail({ 
          to: candidate.email, 
          subject: "Provisional Offer - Mainstreamtek", 
          html: buildProvisionalOfferEmail(candidate) 
        });
        break;

      case 2:
        // Reminder logic for Case 2 (Document Submission)
        if (candidate.status === "Waiting for HR NDA") {
           // Resend notification to HR
           const hrHtml = buildHRNotificationHtml(candidate);
           await gmailService.sendMail({
             to: "jamuna@mainstreamtek.com",
             subject: `REMINDER: Drop NDA for ${candidate.name}`,
             html: hrHtml,
             skipCc: true
           });
           await firestoreService.addLog(candidateId, "Resent NDA upload reminder to HR.");
        } else if (candidate.status === "NDA & Docs Pending") {
          // Resend Dashboard to Candidate
          await firestoreService.updateCandidate(candidateId, { 
            lastDocReminderAt: new Date().toISOString() 
          });
          const htmlReminder = buildCandidateDashboardHtml(candidate, candidate.docStatus);
          await gmailService.sendMail({ 
            to: candidate.email, 
            subject: "Reminder: Onboarding Documents - Mainstreamtek", 
            html: htmlReminder,
            skipCc: true
          });
          await firestoreService.addLog(candidateId, "Resent document dashboard to candidate.");
        }
        break;

      case 3:
        const pdf = await pdfService.generateFinalOffer(candidate);
        await gmailService.sendMailWithAttachments({
          to: candidate.email,
          subject: "Final Offer Letter - Mainstreamtek",
          body: `Dear ${candidate.name},\n\nPlease find attached your final offer.`,
          attachments: [{ name: `offer_${candidate.name.replace(/\s+/g, '_')}.pdf`, buffer: pdf }]
        });
        break;
    }
    return { success: true };
  } catch (err) {
    console.error("❌ Resend failed:", err);
    return { success: false, message: err.message };
  }
};