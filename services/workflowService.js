import * as firestoreService from './firestoreService.js';
import * as gmailService from './gmailService.js';
import * as driveService from './driveService.js';
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
// 3. Document Request (Triggered automatically when details are received)
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
// 5. SEND DOC REQUEST (REVISED: NO AUTOMATIC PDF)
// -------------------------------------------------------------
/**
 * This function is triggered automatically when candidate details are received.
 * It NO LONGER attaches a PDF. It only requests the 4 required documents.
 */
export const sendFormalOfferAndDocRequest = async (candidateId, candidate) => {
  try {
    await ensureValidAccessToken();

    let folderId = candidate.driveFolderId;
    let webViewLink = "";

    // Reuse folder if valid
    if (folderId) {
      // Note: driveService.getFolderLink should be used here if you have it, 
      // otherwise fallback to folder creation logic.
      const folderInfo = await driveService.createCandidateFolder(
        candidateId,
        candidate.name,
        "System_Admin",
        candidate.email
      );
      webViewLink = folderInfo.webViewLink;
    } else {
      // Create folder if missing
      const folder = await driveService.createCandidateFolder(
        candidateId,
        candidate.name,
        "System_Admin",
        candidate.email
      );
      folderId = folder.id;
      webViewLink = folder.webViewLink;
    }

    // REVISED Email body: 
    // 1. Passbook removed. 
    // 2. Mentions that Offer will be released AFTER document upload.
    const body = `Dear ${candidate.name},

Thank you for providing your details. We are excited to move forward with your onboarding.

Action Required: Document Submission
Please upload the following PDF documents to the link provided below:
1. Aadhaar Card
2. PAN Card
3. Education Certificate
4. Passport Size Photo

Upload Link:
${webViewLink}

Note: Once you have uploaded the required documents, our team will verify them and release your Formal Offer Letter.
`;

    // Send plain text mail with instructions (No Attachment)
    await gmailService.sendMail({
      to: candidate.email,
      subject: "Action Required: Document Submission",
      text: body
    });

    // Update DB
    await firestoreService.updateCandidate(candidateId, {
      driveFolderId: folderId,
      status: "Details Received / Docs Pending"
    });

    await firestoreService.addLog(
      candidateId,
      "Details received. Drive link sent for document submission. (Automatic offer release skipped)"
    );

  } catch (error) {
    console.error("❌ Error in document request workflow:", error);
    await firestoreService.addLog(
      candidateId,
      `Failed to send document request: ${error.message}`
    );
  }
};

// -------------------------------------------------------------
// 6. Resend Mail (Updated Templates)
// -------------------------------------------------------------
export const resendMail = async (candidateId, mailNumber) => {
  const candidate = await firestoreService.getCandidate(candidateId);

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

        await firestoreService.addLog(candidate.id, "Mail 1 (Provisional) Resent.");
        break;
      }

      case 2: {
        // Doc submission reminder - No Passbook
        const body = `Dear ${candidate.name},

This is a reminder to upload your documents for verification:
1. Aadhaar Card
2. PAN Card
3. Education Certificate
4. Passport Size Photo

Upload Link:
https://drive.google.com/drive/folders/${candidate.driveFolderId}
`;

        await gmailService.sendMail({
          to: candidate.email,
          subject: "Reminder: Document Submission",
          text: body
        });

        await firestoreService.addLog(candidate.id, "Mail 2 (Doc Reminder) Resent.");
        break;
      }

      case 3: {
        // Manual Final Offer resend - Only works if PDF was generated/released
        const pdf = await pdfService.generateFinalOffer(candidate);

        await gmailService.sendMailWithAttachment({
          to: candidate.email,
          subject: "Final Offer Letter - Your Company",
          body: `Dear ${candidate.name},\n\nRe-sending your final offer letter as requested.`,
          attachmentBuffer: pdf,
          attachmentName: `final_offer_${candidate.name}.pdf`
        });

        await firestoreService.addLog(candidate.id, "Mail 3 (Final Offer) Resent.");
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