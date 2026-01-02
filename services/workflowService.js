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

export const startOnboardingWorkflow = async (candidateData) => {
  const candidateId = await firestoreService.createCandidate(candidateData);
  await firestoreService.addLog(candidateId, "Candidate record created.");
  await sendProvisionalOffer(candidateId, candidateData);
  return { candidateId };
};

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

export const requestCandidateDocuments = async (candidateId, candidate) => {
  await sendFormalOfferAndDocRequest(candidateId, candidate);
};

export const sendFormalOfferAndDocRequest = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    let webViewLink = candidate.driveFolderWebViewLink;
    let folderId = candidate.driveFolderId;

    if (!webViewLink) {
      const folder = await driveService.createCandidateFolder(
        candidateId, 
        candidate.name, 
        "System_Admin", 
        candidate.email
      );
      folderId = folder.id;
      webViewLink = folder.webViewLink;
    }

    await firestoreService.updateCandidate(candidateId, {
      driveFolderId: folderId,
      driveFolderWebViewLink: webViewLink,
      status: "Waiting for HR NDA"
    });

    const hrHtml = buildHRNotificationHtml({
      ...candidate,
      driveFolderWebViewLink: webViewLink
    });

    // Updated Subject to mention Sample NDA
    await gmailService.sendMail({
      to: "jamuna@mainstreamtek.com",
      subject: `Action Required: Upload Unsigned & Sample NDA for ${candidate.name}`,
      html: hrHtml,
      skipCc: true 
    });

    await firestoreService.addLog(candidateId, "Jamuna notified to upload Unsigned and Sample NDA.");

  } catch (error) {
    console.error("❌ Error in HR notification workflow:", error);
    await firestoreService.addLog(candidateId, `Workflow Error: ${error.message}`);
  }
};

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
        if (candidate.status === "Waiting for HR NDA") {
           const hrHtml = buildHRNotificationHtml(candidate);
           await gmailService.sendMail({
             to: "jamuna@mainstreamtek.com",
             subject: `REMINDER: Drop Unsigned & Sample NDA for ${candidate.name}`,
             html: hrHtml,
             skipCc: true
           });
           await firestoreService.addLog(candidateId, "Resent NDA/Sample upload reminder to HR.");
        } else if (candidate.status === "NDA & Docs Pending") {
          await firestoreService.updateCandidate(candidateId, { lastDocReminderAt: new Date().toISOString() });
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