import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as firestoreService from './firestoreService.js';
import * as driveService from './driveService.js';

// This assumes you have authentication set up via your service account
// and the GOOGLE_APPLICATION_CREDENTIALS environment variable is set
// or you're running in a GCP environment.
const visionClient = new ImageAnnotatorClient();

/**
 * Verifies a single document from Google Drive using Vision AI.
 * @param {string} fileId - The ID of the file in Google Drive.
 * @param {string} candidateId - The Firestore ID of the candidate.
 */
export async function verifyDocument(fileId, candidateId) {
  try {
    console.log(`Starting verification for file ${fileId} for candidate ${candidateId}`);

    // 1. Get file metadata and content from Drive
    const metadata = await driveService.getFileMetadata(fileId);
    const fileName = metadata.name.toLowerCase();
    const fileBuffer = await driveService.downloadFile(fileId);

    // 2. Send file to Vision API for text detection
    const [result] = await visionClient.textDetection({
      image: { content: fileBuffer },
    });
    const text = result.fullTextAnnotation?.text;

    if (!text) {
      console.log(`No text found in document: ${fileName}`);
      await firestoreService.addLog(candidateId, `Verification Failed: No text found in ${fileName}.`);
      return;
    }

    // 3. Parse and Validate based on file name
    let docType = 'Unknown';
    let status = 'Mismatch';

    if (fileName.includes('pan')) {
      docType = 'panStatus';
      // Regex to find a valid PAN number format
      const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
      const match = text.match(panRegex);
      if (match) {
        status = 'Verified';
        console.log(`PAN card verified for candidate ${candidateId}. Found PAN: ${match[0]}`);
      }
    } else if (fileName.includes('aadhaar')) {
      docType = 'aadhaarStatus';
      // Regex to find a 12-digit number (basic Aadhaar check)
      const aadhaarRegex = /\b[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\b/;
      const match = text.match(aadhaarRegex);
      if (match) {
        status = 'Verified';
        console.log(`Aadhaar card verified for candidate ${candidateId}.`);
      }
    }
    // Add more else-if blocks for other documents like degrees, passports, etc.

    // 4. Update Firestore with the specific document status
    if (docType !== 'Unknown') {
      await firestoreService.updateVerificationStatus(candidateId, docType, status);
      await firestoreService.addLog(candidateId, `Document '${fileName}' processed. Status: ${status}.`);
    }

    // 5. Update the overall verification status
    await updateOverallVerification(candidateId);

  } catch (error) {
    console.error(`Error verifying document ${fileId}:`, error);
    await firestoreService.addLog(candidateId, `Error during verification of file ID ${fileId}.`);
  }
}

/**
 * Checks individual document statuses and updates the overall status.
 * @param {string} candidateId
 */
async function updateOverallVerification(candidateId) {
    const candidate = await firestoreService.getCandidate(candidateId);
    const { verification } = candidate;

    // Logic to determine overall status
    // For this example, if both PAN and Aadhaar are verified, the overall status is verified.
    if (verification.panStatus === 'Verified' && verification.aadhaarStatus === 'Verified') {
        await firestoreService.updateVerificationStatus(candidateId, 'overallStatus', 'Verified');
        await firestoreService.addLog(candidateId, 'Overall document verification successful.');
    } else if (verification.panStatus === 'Mismatch' || verification.aadhaarStatus === 'Mismatch') {
        await firestoreService.updateVerificationStatus(candidateId, 'overallStatus', 'Mismatch');
    }
}