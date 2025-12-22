import { google } from "googleapis";
import { googleAuth } from "../config/googleAuth.js";

import { geminiGenerateReply } from "./geminiService.js";
import * as firestoreService from "./firestoreService.js";
import * as sheetsService from "./sheetsService.js";
import { requestCandidateDocuments, sendFormalOfferAndDocRequest } from "./workflowService.js";

/**
 * Gmail API client (Service Account + Domain-Wide Delegation)
 * Acts as the impersonated Workspace user
 */
const gmail = google.gmail({
  version: "v1",
  auth: googleAuth
});

/**
 * Extract email address from "From" header
 */
function extractEmailAddress(raw) {
  const match = raw?.match(/<(.+)>/);
  return match ? match[1] : raw;
}

/**
 * Keywords fallback for offer acceptance
 */
const ACCEPTANCE_KEYWORDS = [
  "i accept",
  "i agree",
  "i confirm",
  "accept the offer",
  "joining",
  "i am joining",
  "yes, i accept",
  "proceed"
];

/**
 * Recursively extract full email body (text/plain preferred)
 */
function getEmailBody(payload) {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      const nested = getEmailBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

/**
 * Send plain or HTML email
 */
export async function sendMail({ to, subject, text, html }) {
  const contentType = html
    ? 'Content-Type: text/html; charset="UTF-8"'
    : 'Content-Type: text/plain; charset="UTF-8"';

  const body = html || text || "";

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    contentType,
    "",
    body
  ];

  const raw = Buffer.from(messageParts.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw }
  });
}

/**
 * Send email with PDF attachment
 */
export async function sendMailWithAttachment({
  to,
  subject,
  body,
  attachmentBuffer,
  attachmentName
}) {
  const fileBase64 = attachmentBuffer.toString("base64");

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="foo_bar_baz"',
    "",
    "--foo_bar_baz",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
    "",
    "--foo_bar_baz",
    `Content-Type: application/pdf; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    fileBase64,
    "",
    "--foo_bar_baz--"
  ];

  const raw = Buffer.from(messageParts.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw }
  });
}

/**
 * Fetch unread emails
 */
async function getUnreadMails() {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    q: "is:unread"
  });

  if (!res.data.messages) return [];

  const mails = [];
  for (const msg of res.data.messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id
    });

    const headers = full.data.payload.headers;

    mails.push({
      id: msg.id,
      threadId: full.data.threadId,
      subject: headers.find(h => h.name === "Subject")?.value || "",
      from: headers.find(h => h.name === "From")?.value || "",
      snippet: full.data.snippet || "",
      payload: full.data.payload
    });
  }
  return mails;
}

/**
 * Reply to an email thread
 */
async function replyToMail(mail, body) {
  const to = extractEmailAddress(mail.from);
  const subject = mail.subject.startsWith("Re:")
    ? mail.subject
    : `Re: ${mail.subject}`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ];

  const raw = Buffer.from(messageParts.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: mail.threadId }
  });
}

/**
 * AI extraction for candidate details
 */
async function extractCandidateDetailsAI(emailBody) {
  const prompt = `
STRICT DATA EXTRACTION MODE
Extract JSON with fields:
name, location, address, dateOfJoining, noticePeriod

Rules:
- dateOfJoining → YYYY-MM-DD if possible
- Missing fields → null
- Return ONLY JSON

Email:
"${emailBody}"
`;

  const aiResponse = await geminiGenerateReply("system", "extract_json", prompt);

  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return null;
  }
}

/**
 * MAIN LOOP – auto process unread mails
 */
export async function autoReplyToNewMails() {
  console.log("📨 Checking unread mails...");
  const mails = await getUnreadMails();

  for (const mail of mails) {
    try {
      const fromEmail = extractEmailAddress(mail.from);
      const emailBody = getEmailBody(mail.payload) || mail.snippet;

      const candidates = await firestoreService.findCandidatesByEmail(fromEmail);
      let handled = false;

      for (const candidate of candidates) {
        if (candidate.offerReplyStatus === "pending") {
          const extracted = await extractCandidateDetailsAI(emailBody);

          if (extracted?.dateOfJoining) {
            await firestoreService.updateCandidate(candidate.id, {
              parsedDetails: extracted,
              offerReplyStatus: "accepted",
              status: "Details Received",
              dateOfJoining: extracted.dateOfJoining
            });

            await sheetsService.appendCandidateToSheet(auth, {
              ...candidate,
              parsedDetails: extracted
            });

            await sendFormalOfferAndDocRequest(candidate.id, candidate);
            handled = true;
            break;
          }
        }
      }

      if (!handled) {
        const isAccepting = ACCEPTANCE_KEYWORDS.some(k =>
          emailBody.toLowerCase().includes(k)
        );

        if (isAccepting && candidates.length) {
          await requestCandidateDocuments(candidates[0].id, candidates[0]);
          handled = true;
        }
      }

      if (!handled) {
        const aiReply = await geminiGenerateReply(
          fromEmail,
          mail.subject,
          mail.snippet
        );
        if (aiReply) await replyToMail(mail, aiReply);
      }

      await gmail.users.messages.modify({
        userId: "me",
        id: mail.id,
        requestBody: { removeLabelIds: ["UNREAD"] }
      });

    } catch (err) {
      console.error("❌ Mail processing error:", err.message);
    }
  }
}

/**
 * Start polling loop
 */
export function startAutoReplyLoop() {
  console.log("🔁 Gmail auto-reply loop started");
  autoReplyToNewMails();
  setInterval(autoReplyToNewMails, 60_000);
}
