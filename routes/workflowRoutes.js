import express from "express";
import * as driveService from "../services/driveService.js";
import * as firestoreService from "../services/firestoreService.js";
import * as gmailService from "../services/gmailService.js";
import { sendFormalOfferAndDocRequest } from "../services/workflowService.js";

const router = express.Router();

// 3. Removed Passbook from schema
const INITIAL_DOC_STATUS = {
  aadhaar: { name: "Aadhaar Card", uploaded: false, verified: false, specialApproval: false },
  pan: { name: "PAN Card", uploaded: false, verified: false, specialApproval: false },
  education: { name: "Education Certificate", uploaded: false, verified: false, specialApproval: false },
  photo: { name: "Passport Photo", uploaded: false, verified: false, specialApproval: false }
};

/**
 * 📂 GET /files/:folderId
 * Lists PDF files in a specific Google Drive folder
 */
router.get("/files/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    if (!folderId) return res.status(400).json({ error: "Folder ID is required" });

    const files = await driveService.listPdfFiles(folderId);
    res.json({ success: true, files });
  } catch (err) {
    console.error("❌ List files error:", err.message);
    res.status(500).json({ error: "Failed to list files from Drive" });
  }
});

/**
 * ✅ POST /update-doc-status
 * Updates Firestore when HR toggles 'Verified' or 'Special Approval'
 */
router.post("/update-doc-status", async (req, res) => {
  const { candidateId, docKey, field, value } = req.body;

  if (!candidateId || !docKey || !field) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const candidate = await firestoreService.getCandidate(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const docStatus = candidate.docStatus || JSON.parse(JSON.stringify(INITIAL_DOC_STATUS));

    if (!docStatus[docKey]) return res.status(400).json({ error: "Invalid document key" });
    
    // Update the specific field (verified or specialApproval)
    docStatus[docKey][field] = value;

    await firestoreService.updateCandidate(candidateId, { docStatus });
    await firestoreService.addLog(candidateId, `HR updated ${docKey} → ${field}: ${value}`);

    res.json({ success: true, docStatus });
  } catch (err) {
    console.error("❌ Update doc status error:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/**
 * 📧 POST /resend-mail
 * Manually trigger the email workflow stages
 */
router.post("/resend-mail", async (req, res) => {
  const { candidateId, mailNumber } = req.body;

  try {
    const candidate = await firestoreService.getCandidate(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    if (mailNumber === 1) {
      // Re-send the initial request for details / Provisional Offer
      // You can use gmailService.sendMail directly here
      await gmailService.sendMail({
        to: candidate.email,
        subject: `Reminder: Provisional Offer for ${candidate.role}`,
        text: `Hi ${candidate.name}, we are waiting for your acceptance. Please reply to the original email.`
      });
      await firestoreService.addLog(candidateId, "Resent Mail #1: Provisional Offer Reminder");

    } else if (mailNumber === 2) {
      // Re-send the Formal Offer and Drive Folder Access
      // This uses the workflowService function imported above
      await sendFormalOfferAndDocRequest(candidateId, candidate);
      await firestoreService.addLog(candidateId, "Resent Mail #2: Formal Offer & Drive Access Link");
    }

    res.json({ success: true, message: "Email resent successfully" });
  } catch (err) {
    console.error("❌ Resend mail error:", err.message);
    res.status(500).json({ error: "Failed to resend email" });
  }
});

/**
 * 🔄 POST /sync-drive-state
 * Forces a refresh of the 'uploaded' status by scanning Drive folder
 */
router.post("/sync-drive-state", async (req, res) => {
  const { candidateId } = req.body;
  try {
    const candidate = await firestoreService.getCandidate(candidateId);
    if (!candidate.driveFolderId) return res.status(400).json({ error: "No drive folder assigned" });

    const driveFiles = await driveService.listPdfFiles(candidate.driveFolderId);
    const docStatus = candidate.docStatus || JSON.parse(JSON.stringify(INITIAL_DOC_STATUS));
    
    // 3. Removed Passbook from keywords
    const DOC_KEYWORDS = {
      aadhaar: ["aadhaar", "adhar", "uid"],
      pan: ["pan", "pancard"],
      education: ["education", "degree", "mark", "certificate"],
      photo: ["photo", "passport", "selfie"]
    };

    Object.keys(DOC_KEYWORDS).forEach(key => {
      const exists = driveFiles.some(file => 
        DOC_KEYWORDS[key].some(k => file.name.toLowerCase().includes(k))
      );
      docStatus[key].uploaded = exists;
    });

    await firestoreService.updateCandidate(candidateId, { docStatus });
    await firestoreService.addLog(candidateId, "Manual Drive Sync Triggered");

    res.json({ success: true, docStatus, files: driveFiles });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync drive" });
  }
});
/**
 * 5. POST /release-offer-letter
 * Scans drive for MST Offer Letter & Agreement and sends them to candidate.
 */
router.post("/release-offer-letter", async (req, res) => {
  const { candidateId } = req.body;
  try {
    const candidate = await firestoreService.getCandidate(candidateId);
    if (!candidate.driveFolderId) return res.status(400).json({ error: "No Drive folder assigned" });

    const files = await driveService.listPdfFiles(candidate.driveFolderId);
    
    // Naming logic: Search for suffixes
    const offerLetterFile = files.find(f => f.name.includes("_Offer_Letter_MST"));
    const agreementFile = files.find(f => f.name.includes("_EMPLOYMENT_AGREEMENT_MST"));

    if (!offerLetterFile) {
      return res.status(404).json({ error: "No offer letter found with MST naming convention." });
    }

    const attachments = [];
    const offerBuffer = await driveService.downloadFileAsBuffer(offerLetterFile.id);
    attachments.push({ name: offerLetterFile.name, buffer: offerBuffer });

    if (agreementFile) {
      const agreementBuffer = await driveService.downloadFileAsBuffer(agreementFile.id);
      attachments.push({ name: agreementFile.name, buffer: agreementBuffer });
    }

    await gmailService.sendMailWithAttachments({
      to: candidate.email,
      subject: `Official Offer Documents - ${candidate.name}`,
      body: `Dear ${candidate.name},\n\nPlease find your Official Offer Letter and Employment Agreement attached.`,
      attachments
    });

    await firestoreService.updateCandidate(candidateId, { status: "Offer Released" });
    await firestoreService.addLog(candidateId, "Official Offer & Agreement Released by HR");

    res.json({ success: true, message: "Offer letter and documents released successfully!" });
  } catch (err) {
    console.error("Release error:", err);
    res.status(500).json({ error: "Failed to release offer documents." });
  }
});
/**
 * 🚀 POST /finalize-onboarding
 * Moves candidate to the final status
 */
router.post("/finalize-onboarding", async (req, res) => {
  const { candidateId } = req.body;
  try {
    await firestoreService.updateCandidate(candidateId, { 
      status: "Onboarded",
      updatedAt: new Date() 
    });
    await firestoreService.addLog(candidateId, "Workflow marked as COMPLETED by HR");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Finalization failed" });
  }
});

router.post("/override-status", async (req, res) => {
  const { candidateId, newStatus } = req.body;
  try {
    await firestoreService.updateCandidate(candidateId, { status: newStatus });
    await firestoreService.addLog(candidateId, `MANUAL OVERRIDE: Status changed to ${newStatus}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/update-reminders", async (req, res) => {
  const { candidateId, reminderTimes } = req.body; // Array of hours e.g. [9, 13, 17]
  try {
    await firestoreService.updateCandidate(candidateId, { reminderTimes });
    await firestoreService.addLog(candidateId, `Reminder schedule updated to: ${reminderTimes.join(", ")}:00`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;