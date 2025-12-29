import * as firestoreService from './firestoreService.js';
import * as gmailService from './gmailService.js';
import * as driveService from './driveService.js';
import { buildProvisionalOfferEmail } from './provisionalOfferBuilder.js';
import { buildDocumentReminderHtml } from './cronService.js'; // Ensure this is exported from reminderCron.js
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

// 3. Document Request Wrapper
export const requestCandidateDocuments = async (candidateId, candidate) => {
  await sendFormalOfferAndDocRequest(candidateId, candidate);
};

// 4. Send Doc Request (Initial)
/**
 * FIX: 
 * 1. Uses the professional HTML template instead of plain text.
 * 2. Updates Firestore timestamp BEFORE sending to lock out the Cron job.
 */
export const sendFormalOfferAndDocRequest = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    let webViewLink = candidate.driveFolderWebViewLink;
    let folderId = candidate.driveFolderId;

    // Resolve Drive Folder
    if (!webViewLink) {
      const folder = await driveService.createCandidateFolder(candidateId, candidate.name, "System_Admin", candidate.email);
      folderId = folder.id;
      webViewLink = folder.webViewLink;
    }

    // Prepare Initial Document Status (All false)
    const initialDocStatus = {
      aadhaar: { name: "Aadhaar Card", uploaded: false, verified: false, specialApproval: false },
      pan: { name: "PAN Card", uploaded: false, verified: false, specialApproval: false },
      education: { name: "Education Certificate", uploaded: false, verified: false, specialApproval: false },
      photo: { name: "Passport Photo", uploaded: false, verified: false, specialApproval: false }
    };

    // --- CRITICAL FIX: UPDATE DB BEFORE SENDING MAIL ---
    // We set docStatus and lastDocReminderAt NOW so the Cron job immediately skips this candidate.
    await firestoreService.updateCandidate(candidateId, {
      driveFolderId: folderId,
      driveFolderWebViewLink: webViewLink,
      status: "Details Received / Docs Pending",
      docStatus: initialDocStatus,
      lastDocReminderAt: new Date().toISOString() 
    });

    // Generate professional HTML (Shared with Cron Job)
    const htmlBody = buildDocumentReminderHtml(
      { ...candidate, driveFolderId: folderId }, 
      initialDocStatus
    );

    // Send the HTML Mail
    await gmailService.sendMail({
      to: candidate.email,
      subject: "Action Required: Document Submission - Mainstreamtek",
      html: htmlBody
    });

    await firestoreService.addLog(candidateId, "Initial HTML document request sent.");

  } catch (error) {
    console.error("❌ Error in document request workflow:", error);
    await firestoreService.addLog(candidateId, `Workflow Error: ${error.message}`);
  }
};

// 5. Resend Mail
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
        // Update timestamp first to prevent Cron interference
        await firestoreService.updateCandidate(candidateId, { 
          lastDocReminderAt: new Date().toISOString() 
        });

        // Use HTML builder for resends to maintain professional look
        const htmlReminder = buildDocumentReminderHtml(candidate, candidate.docStatus);

        await gmailService.sendMail({ 
          to: candidate.email, 
          subject: "Reminder: Document Submission - Mainstreamtek", 
          html: htmlReminder 
        });
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