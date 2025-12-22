import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

// 🔐 Domain-Wide Delegation Auth using environment variables
export const googleAuth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets"
  ],
  subject: process.env.GOOGLE_WORKSPACE_USER // Workspace user
});
