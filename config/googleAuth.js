import { google } from "googleapis";
import path from "path";

const SERVICE_ACCOUNT_PATH = path.resolve(
  "config/service-account.json"
);

// 🔐 Domain-Wide Delegation Auth
export const googleAuth = new google.auth.JWT({
  keyFile: SERVICE_ACCOUNT_PATH,
  scopes: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets"
  ],
  subject: "day1ai@mainstreamtek.com" // Workspace user
});
