import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

/**
 * --------------------------------------------------
 * Helper: Get Sheets Client
 * --------------------------------------------------
 */
const getSheetsClient = (auth) => {
  return google.sheets({
    version: "v4",
    auth
  });
};

/**
 * --------------------------------------------------
 * Append Candidate to Google Sheet
 * --------------------------------------------------
 */
export const appendCandidateToSheet = async (authClient, candidateData) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error("Missing GOOGLE_SHEET_ID in environment");
    }

    if (!authClient) {
      throw new Error("Missing authenticated Google auth client");
    }

    const sheets = getSheetsClient(authClient);

    // Prefer parsed details (AI extracted)
    const details = candidateData.parsedDetails || {};

    const values = [
      [
        candidateData.id ?? "N/A",
        candidateData.name ?? "N/A",
        details.name ?? candidateData.name ?? "N/A",
        candidateData.email ?? "N/A",
        details.location ?? "N/A",
        details.address ?? "N/A",
        details.dateOfJoining ?? candidateData.dateOfJoining ?? "N/A",
        details.noticePeriod ?? "N/A",
        new Date().toISOString()
      ]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:I", // Fixed column width
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values
      }
    });

    console.log(
      `📊 Sheet Updated → ${candidateData.name} (${candidateData.email})`
    );

  } catch (error) {
    console.error(
      "❌ Google Sheets Append Failed:",
      error?.response?.data?.error?.message || error.message
    );
  }
};
