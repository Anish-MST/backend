import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

if (!SERVICE_ACCOUNT_PATH) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_PATH is not set");
}

export const googleAuth = new google.auth.JWT({
  keyFile: path.isAbsolute(SERVICE_ACCOUNT_PATH)
    ? SERVICE_ACCOUNT_PATH
    : path.resolve(__dirname, "..", SERVICE_ACCOUNT_PATH),
  scopes: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
  subject: "day1ai@mainstreamtek.com", // Workspace user
});
