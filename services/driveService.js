import { google } from "googleapis";
import { googleAuth } from "../config/googleAuth.js";

const drive = google.drive({
  version: "v3",
  auth: googleAuth
});

/**
 * 📂 Create or Fetch Candidate Folder & Grant Access
 * @param {string} candidateId - Internal ID
 * @param {string} candidateName - Name of candidate
 * @param {string} writerName - The HR/Admin creating this
 * @param {string} candidateEmail - The email to grant access to
 */
export async function createCandidateFolder(candidateId, candidateName, writerName, candidateEmail) {
  // 1. Validate Input to prevent 'undefined' errors
  if (!candidateEmail || !candidateEmail.includes("@")) {
    console.error(`❌ Drive Service: Cannot process folder for "${candidateName}". Invalid email: ${candidateEmail}`);
    return null;
  }

  const safeCandidate = candidateName.trim().replace(/\s+/g, "_");
  const folderName = `${candidateId}_${safeCandidate}`;

  let folderId;

  try {
    // 2. Search for existing folder by name containing candidateId
    const searchRes = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name contains '${candidateId}' and trashed=false`,
      fields: "files(id, webViewLink)",
      spaces: "drive"
    });

    if (searchRes.data.files?.length > 0) {
      folderId = searchRes.data.files[0].id;
    } else {
      // 3. Create folder if it doesn't exist
      const folderRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder"
        },
        fields: "id"
      });
      folderId = folderRes.data.id;
    }

    // 4. FORCE SHARE ACCESS (Fixes "Request Access" issues)
    // We call this even if folder exists to ensure permissions are correct
    await grantFolderAccess(folderId, candidateEmail);

    // 5. Get the final link
    const finalData = await drive.files.get({
      fileId: folderId,
      fields: "id, webViewLink"
    });

    return finalData.data;

  } catch (error) {
    console.error(`❌ Drive Service Error for ${candidateName}:`, error.message);
    throw error;
  }
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

/**
 * 📄 List only PDF files in a folder
 */
export async function listPdfFiles(folderId) {
  try {
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