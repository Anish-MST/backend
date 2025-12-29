import { google } from "googleapis";
import { googleAuth } from "../config/googleAuth.js";
import { geminiGenerateReply } from "./geminiService.js";
import * as firestoreService from "./firestoreService.js";
import * as sheetsService from "./sheetsService.js";
import { requestCandidateDocuments, sendFormalOfferAndDocRequest } from "./workflowService.js";

/**
 * Gmail API client
 */
const gmail = google.gmail({ version: "v1", auth: googleAuth });

/**
 * 1. CC Placeholder for HR/Admin
 */
const CC_EMAILS = "jamuna@mainstreamtek.com, akshata@mainstreamtek.com, suresh@mainstreamtek.com, vidya.rajesh@mainstreamtek.com, careers@mainstreamtek.com";

/**
 * 4. Custom Signature
 */
const SIGNATURE = `

Thanks & regards,
Day1AI 
A Mainstreamtek Agentic AI initiative | Designed to think. Built to act.`;

/**
 * Keywords to detect acceptance in candidate replies
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
 * Helper: Extract email address from "From" header (e.g. "John <john@gmail.com>" -> "john@gmail.com")
 */
function extractEmailAddress(raw) {
  const match = raw?.match(/<(.+)>/);
  return match ? match[1] : raw;
}

/**
 * Helper: Recursively extract full email body (text/plain preferred)
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
 * Send plain or HTML email (With CC and Signature)
 */
export async function sendMail({ to, subject, text, html, skipCc = false }) {
  const bodyWithSig = (html || text || "") + 
    (html ? `<br><br>${SIGNATURE.replace(/\n/g, '<br>')}` : `\n\n${SIGNATURE}`);
  
  const contentType = html ? 'text/html' : 'text/plain';

  const messageParts = [
    `To: ${to}`,
    ...(!skipCc ? [`Cc: ${CC_EMAILS}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "",
    bodyWithSig
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
 * Send email with multiple PDF attachments (Used for Release Offer Letter)
 */
export async function sendMailWithAttachments({ to, subject, body, attachments }) {
  const boundary = "foo_bar_baz";
  const bodyWithSig = body + `\n\n${SIGNATURE}`;

  let messageParts = [
    `To: ${to}`,
    `Cc: ${CC_EMAILS}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    bodyWithSig,
    ""
  ];

  attachments.forEach(att => {
    messageParts.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${att.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.name}"`,
      "",
      att.buffer.toString("base64"),
      ""
    );
  });

  messageParts.push(`--${boundary}--`);

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
 * Legacy wrapper for single attachment
 */
export async function sendMailWithAttachment({ to, subject, body, attachmentBuffer, attachmentName }) {
  return sendMailWithAttachments({
    to,
    subject,
    body,
    attachments: [{ name: attachmentName, buffer: attachmentBuffer }]
  });
}

/**
 * Fetch unread emails from Inbox
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
 * Reply to an email thread with CC and Signature
 */
async function replyToMail(mail, body) {
  const to = extractEmailAddress(mail.from);
  const subject = mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`;
  const bodyWithSig = body + `\n\n${SIGNATURE}`;

  const messageParts = [
    `To: ${to}`,
    `Cc: ${CC_EMAILS}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    bodyWithSig
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
 * MAIN LOOP – Auto process unread mails
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
        // Case A: Waiting for details after Provisional Offer
        if (candidate.offerReplyStatus === "pending") {
          const extracted = await extractCandidateDetailsAI(emailBody);

          if (extracted?.dateOfJoining) {
            await firestoreService.updateCandidate(candidate.id, {
              parsedDetails: extracted,
              offerReplyStatus: "accepted",
              status: "Details Received",
              dateOfJoining: extracted.dateOfJoining
            });

            // Note: sheetsService requires global auth context if used here
            // await sheetsService.appendCandidateToSheet(candidate);

            await sendFormalOfferAndDocRequest(candidate.id, candidate);
            handled = true;
            break;
          }
        }
      }

      // Case B: General acceptance check
      if (!handled && candidates.length > 0) {
        const isAccepting = ACCEPTANCE_KEYWORDS.some(k =>
          emailBody.toLowerCase().includes(k)
        );

        if (isAccepting) {
          await requestCandidateDocuments(candidates[0].id, candidates[0]);
          handled = true;
        }
      }

      // Case C: Standard AI Chat/Reply
      if (!handled) {
        const aiReply = await geminiGenerateReply(
          fromEmail,
          mail.subject,
          mail.snippet
        );
        if (aiReply) await replyToMail(mail, aiReply);
      }

      // Mark as Read
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