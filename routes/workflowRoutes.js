import express from "express";
import * as driveService from "../services/driveService.js";
import * as firestoreService from "../services/firestoreService.js";

const router = express.Router();

/**
 * ---------------------------------------------------------
 * Default document status schema
 * ---------------------------------------------------------
 */
const INITIAL_DOC_STATUS = {
  aadhaar: {
    name: "Aadhaar Card",
    uploaded: false,
    verified: false,
    specialApproval: false
  },
  pan: {
    name: "PAN Card",
    uploaded: false,
    verified: false,
    specialApproval: false
  },
  education: {
    name: "Education Certificate",
    uploaded: false,
    verified: false,
    specialApproval: false
  },
  photo: {
    name: "Passport Photo",
    uploaded: false,
    verified: false,
    specialApproval: false
  },
  passbook: {
    name: "Passbook Photo",
    uploaded: false,
    verified: false,
    specialApproval: false
  }
};

/**
 * ---------------------------------------------------------
 * 📄 List ONLY PDF files inside a Drive folder
 * ---------------------------------------------------------
 */
router.get("/files/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;

    if (!folderId) {
      return res.status(400).json({ error: "Folder ID is required" });
    }

    const files = await driveService.listPdfFiles(folderId);

    res.json({
      success: true,
      files
    });
  } catch (err) {
    console.error("❌ List files error:", err.message);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * ---------------------------------------------------------
 * 📝 Update document verification status
 * ---------------------------------------------------------
 */
router.post("/update-doc-status", async (req, res) => {
  const { candidateId, docKey, field, value } = req.body;

  if (!candidateId || !docKey || !field) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const candidate = await firestoreService.getCandidate(candidateId);

    // Initialize docStatus if missing
    const docStatus =
      candidate?.docStatus ??
      JSON.parse(JSON.stringify(INITIAL_DOC_STATUS));

    if (!docStatus[docKey]) {
      return res.status(400).json({ error: "Invalid document key" });
    }

    if (!(field in docStatus[docKey])) {
      return res.status(400).json({ error: "Invalid field update" });
    }

    // Update value
    docStatus[docKey][field] = value;

    await firestoreService.updateCandidate(candidateId, { docStatus });

    await firestoreService.addLog(
      candidateId,
      `HR updated ${docKey} → ${field} = ${value}`
    );

    res.json({
      success: true,
      docStatus
    });
  } catch (err) {
    console.error("❌ Update doc status error:", err.message);
    res.status(500).json({ error: "Failed to update document status" });
  }
});

export default router;
