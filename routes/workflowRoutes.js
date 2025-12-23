import express from "express";
import * as driveService from "../services/driveService.js";
import * as firestoreService from "../services/firestoreService.js";
import * as gmailService from "../services/gmailService.js";
import { requestCandidateDocuments, sendFormalOfferAndDocRequest } from "../services/workflowService.js";

const router = express.Router();

/**
 * Default document status schema
 */
const INITIAL_DOC_STATUS = {
  aadhaar: { name: "Aadhaar Card", uploaded: false, verified: false, specialApproval: false },
  pan: { name: "PAN Card", uploaded: false, verified: false, specialApproval: false },
  education: { name: "Education Certificate", uploaded: false, verified: false, specialApproval: false },
  photo: { name: "Passport Photo", uploaded: false, verified: false, specialApproval: false },
  passbook: { name: "Passbook Photo", uploaded: false, verified: false, specialApproval: false }
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
    
    const DOC_KEYWORDS = {
      aadhaar: ["aadhaar", "adhar", "uid"],
      pan: ["pan", "pancard"],
      education: ["education", "degree", "mark", "certificate"],
      photo: ["photo", "passport", "selfie"],
      passbook: ["passbook", "bank", "cheque"]
    };

    // Auto-detect files based on keywords
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
    console.error("❌ Sync error:", err);
    res.status(500).json({ error: "Failed to sync drive" });
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

export default router;