import { google } from "googleapis";
import { googleAuth } from "../config/googleAuth.js";

const drive = google.drive({
  version: "v3",
  auth: googleAuth
});

/**
 * 2. Automatically delete files that are NOT PDFs
 */
async function cleanNonPdfFiles(folderId) {
  try {
    const res = await drive.files.list({
      // We look for files in the folder that are NOT PDFs and NOT already trashed
      q: `'${folderId}' in parents and mimeType != 'application/pdf' and trashed = false`,
      fields: "files(id, name, owners)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    if (!res.data.files || res.data.files.length === 0) return;

    for (const file of res.data.files) {
      try {
        console.log(`Attempting to remove non-PDF file: ${file.name}`);
        
        /**
         * FIX: Instead of drive.files.delete (Permanent), 
         * we use drive.files.update to move it to TRASH.
         * Note: If the candidate owns the file, even trashing might fail.
         */
        await drive.files.update({
          fileId: file.id,
          requestBody: { trashed: true },
          supportsAllDrives: true
        });
        
        console.log(`✅ Successfully moved to trash: ${file.name}`);
      } catch (err) {
        // If we still get a permission error, it's because the candidate's 
        // Google settings prevent editors from trashing their files.
        console.warn(
          `⚠️ Could not remove "${file.name}": Insufficient permissions. ` +
          `The candidate (Owner) must delete this non-PDF file manually.`
        );
      }
    }
  } catch (err) {
    console.error("Cleanup Loop Error:", err.message);
  }
}

/**
 * 📄 List only PDF files in a folder
 */
export async function listPdfFiles(folderId) {
  try {
    // 1. Attempt to clean up non-PDFs (jpg, png, etc.)
    // 2. Fetch the list of remaining PDF files
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "files(id, name, webViewLink)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    return res.data.files || [];
  } catch (error) {
    console.error(`❌ Error listing files for folder ${folderId}:`, error.message);
    return [];
  }
}

/**
 * Fetch file content as buffer to send via Gmail
 */
export async function downloadFileAsBuffer(fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

/**
 * 📂 Create or Fetch Candidate Folder & Grant Access
 * @param {string} candidateId - Internal ID
 * @param {string} candidateName - Name of candidate
 * @param {string} writerName - The HR/Admin creating this
 * @param {string} candidateEmail - The email to grant access to
 */
/**
 * driveService.js
 */
export async function createCandidateFolder(candidateId, candidateName, adminUser, candidateEmail) {
  const drive = google.drive({ version: "v3", auth: googleAuth });

  // 1. Create the Folder
  const folderMetadata = {
    name: `Onboarding - ${candidateName}`,
    mimeType: "application/vnd.google-apps.folder",
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: "id, webViewLink",
  });

  const folderId = folder.data.id;

  // 2. GRANT EDIT ACCESS TO JAMUNA (HR)
  await drive.permissions.create({
    fileId: folderId,
    requestBody: {
      role: "writer", // Editor access
      type: "user",
      emailAddress: "jamuna@mainstreamtek.com",
    },
  });

  // 3. (Optional) Grant View access to the Candidate
  await drive.permissions.create({
    fileId: folderId,
    requestBody: {
      role: "writer", // Candidate also needs to upload
      type: "user",
      emailAddress: candidateEmail,
    },
  });

  return { id: folderId, webViewLink: folder.data.webViewLink };
}

/**
 * 🔐 Grant 'writer' permission to a specific email
 */
async function grantFolderAccess(fileId, email) {
  try {
    await drive.permissions.create({
      fileId: fileId,
      sendNotificationEmail: true, // Candidate gets an email notification
      supportsAllDrives: true,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: email.trim().toLowerCase()
      }
    });
    console.log(`✅ Drive access synchronized for: ${email}`);
  } catch (err) {
    const error = err?.response?.data?.error?.errors?.[0];
    
    // Ignore error if the person already has access
    if (error?.reason === "duplicate" || error?.reason === "alreadyExists") {
      return;
    }
    
    console.error(`❌ Failed to grant Drive access to ${email}:`, error?.message || err.message);
  }
}
