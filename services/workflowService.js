import * as firestoreService from './firestoreService.js';
import * as gmailService from './gmailService.js';
import * as driveService from './driveService.js';
import * as verificationService from './verificationService.js';
import { buildProvisionalOfferEmail } from './provisionalOfferBuilder.js';
import * as pdfService from './pdfService.js';
import dotenv from 'dotenv';
dotenv.config();

// -------------------------------------------------------------
// ✅ SERVICE ACCOUNT: NO TOKEN MANAGEMENT REQUIRED
// -------------------------------------------------------------
export const ensureValidAccessToken = async () => {
  return true;
};

// -------------------------------------------------------------
// 1. Start Workflow
// -------------------------------------------------------------
export const startOnboardingWorkflow = async (candidateData) => {
  const candidateId = await firestoreService.createCandidate(candidateData);
  await firestoreService.addLog(candidateId, "Candidate record created.");
  await sendProvisionalOffer(candidateId, candidateData);
  return { candidateId };
};

// -------------------------------------------------------------
// 2. Send Provisional Offer
// -------------------------------------------------------------
export const sendProvisionalOffer = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    const body = buildProvisionalOfferEmail(candidate);

    await gmailService.sendMail({
      to: candidate.email,
      subject: "Provisional Offer - Your Company",
      html: body
    });

    await firestoreService.updateCandidate(candidateId, {
      status: "Provisional Offer Sent"
    });

    await firestoreService.addLog(candidateId, "Mail 1 (Provisional Offer) Sent.");
  } catch (err) {
    console.error("Provisional email failed:", err);
  }
};

// -------------------------------------------------------------
// 3. Document Request (Legacy / Manual)
// -------------------------------------------------------------
export const requestCandidateDocuments = async (candidateId, candidate) => {
  await sendFormalOfferAndDocRequest(candidateId, candidate);
};

// -------------------------------------------------------------
// 4. Verification Check (Legacy)
// -------------------------------------------------------------
export const checkDocumentsAndSendFinalOffer = async () => {
  return { triggered: false, message: "Use automated workflow." };
};

// -------------------------------------------------------------
// 5. SEND FORMAL OFFER & DOC REQUEST (Idempotent)
// -------------------------------------------------------------
export const sendFormalOfferAndDocRequest = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    let folderId = candidate.driveFolderId;
    let webViewLink = "";

    // Reuse folder if valid
    if (folderId) {
      const folderInfo = await driveService.getFolderLink(folderId);
      if (folderInfo && folderInfo.webViewLink !== "#") {
        webViewLink = folderInfo.webViewLink;
      } else {
        folderId = null;
      }
    }

    // Create folder if missing
    if (!folderId) {
      const folder = await driveService.createCandidateFolder(
        candidateId,
        candidate.name,
          "System_Admin",
        candidate.email
      );
      folderId = folder.id;
      webViewLink = folder.webViewLink;
    }

    // Generate PDF
    const pdfBuffer = await pdfService.generateFinalOffer(candidate);

    // Email body
    const body = `Dear ${candidate.name},

Thank you for providing your details. We are excited to move forward!

Attached is your Formal Offer Letter.

Action Required: Document Submission
Please upload the following documents:
1. Aadhaar Card
2. PAN Card
3. Education Certificate
4. Passport Size Photo
5. Bank Passbook Photo

Upload Link:
${webViewLink}

Regards,
HR Team`;

    // Send mail
    await gmailService.sendMailWithAttachment({
      to: candidate.email,
      subject: "Formal Offer Letter & Document Submission",
      body,
      attachmentBuffer: pdfBuffer,
      attachmentName: "Formal_Offer_Letter.pdf"
    });

    // Update DB
    await firestoreService.updateCandidate(candidateId, {
      driveFolderId: folderId,
      status: "Formal Offer Sent / Docs Pending"
    });

    await firestoreService.addLog(
      candidateId,
      "Details received. Formal Offer sent. Doc request initiated."
    );

  } catch (error) {
    console.error("❌ Error sending formal offer:", error);
    await firestoreService.addLog(
      candidateId,
      `Failed to send Formal Offer: ${error.message}`
    );
  }
};

// -------------------------------------------------------------
// 6. Resend Mail
// -------------------------------------------------------------
export const resendMail = async (candidateName, mailNumber) => {
  const candidate = await firestoreService.findCandidateByName(candidateName);

  if (!candidate)
    return { success: false, message: "Candidate not found" };

  try {
    await ensureValidAccessToken();

    switch (mailNumber) {
      case 1: {
        const html = buildProvisionalOfferEmail(candidate);

        await gmailService.sendMail({
          to: candidate.email,
          subject: "Provisional Offer - Your Company",
          html
        });

        await firestoreService.addLog(candidate.id, "Mail 1 Resent.");
        break;
      }

      case 2: {
        const folder = await driveService.getFolderLink(candidate.driveFolderId);

        await gmailService.sendMail({
          to: candidate.email,
          subject: "Reminder: Document Submission",
          text: `Dear ${candidate.name},
Please upload your documents here:
${folder.webViewLink}

Regards,
HR Team`
        });

        await firestoreService.addLog(candidate.id, "Mail 2 Resent.");
        break;
      }

      case 3: {
        const pdf = await pdfService.generateFinalOffer(candidate);

        await gmailService.sendMailWithAttachment({
          to: candidate.email,
          subject: "Final Offer Letter - Your Company",
          body: `Dear ${candidate.name},
Re-sending your final offer letter.`,
          attachmentBuffer: pdf,
          attachmentName: `final_offer_${candidate.name}.pdf`
        });

        await firestoreService.addLog(candidate.id, "Mail 3 Resent.");
        break;
      }

      default:
        return { success: false, message: "Invalid mail number" };
    }

    return { success: true };

  } catch (err) {
    console.error("Resend failed:", err);
    return { success: false, message: err.message };
  }
};
