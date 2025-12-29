import { google } from "googleapis";
import { googleAuth } from "../config/googleAuth.js";
import { geminiGenerateReply } from "./geminiService.js";
import * as firestoreService from "./firestoreService.js";
import { requestCandidateDocuments, sendFormalOfferAndDocRequest } from "./workflowService.js";
import { TEXT_SIGNATURE } from "./provisionalOfferBuilder.js";

const gmail = google.gmail({ version: "v1", auth: googleAuth });
const CC_EMAILS = "jamuna@mainstreamtek.com, akshata@mainstreamtek.com, suresh@mainstreamtek.com, vidya.rajesh@mainstreamtek.com, careers@mainstreamtek.com";
const ACCEPTANCE_KEYWORDS = ["i accept", "i agree", "i confirm", "joining", "yes, i accept", "proceed"];

function extractEmailAddress(raw) {
  const match = raw?.match(/<(.+)>/);
  return match ? match[1] : raw;
}

function getEmailBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf-8");
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64").toString("utf-8");
      const nested = getEmailBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

/**
 * FIXED: sendMail now only appends signature to plain text.
 * If 'html' is provided, it assumes the HTML template already handles the signature.
 */
export async function sendMail({ to, subject, text, html, skipCc = false }) {
  const finalContent = html ? html : `${text}${TEXT_SIGNATURE}`;
  const contentType = html ? 'text/html' : 'text/plain';

  const messageParts = [
    `To: ${to}`,
    ...(!skipCc ? [`Cc: ${CC_EMAILS}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "",
    finalContent
  ];

  const raw = Buffer.from(messageParts.join("\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

export async function sendMailWithAttachments({ to, subject, body, attachments }) {
  const boundary = "foo_bar_baz";
  const bodyWithSig = body + TEXT_SIGNATURE;

  let messageParts = [
    `To: ${to}`, `Cc: ${CC_EMAILS}`, `Subject: ${subject}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "", `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "", bodyWithSig, ""
  ];

  attachments.forEach(att => {
    messageParts.push(`--${boundary}`, `Content-Type: application/pdf; name="${att.name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${att.name}"`, "", att.buffer.toString("base64"), "");
  });

  messageParts.push(`--${boundary}--`);
  const raw = Buffer.from(messageParts.join("\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

async function replyToMail(mail, body) {
  const to = extractEmailAddress(mail.from);
  const subject = mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`;
  const messageParts = [`To: ${to}`, `Cc: ${CC_EMAILS}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", body + TEXT_SIGNATURE];
  const raw = Buffer.from(messageParts.join("\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw, threadId: mail.threadId } });
}

async function extractCandidateDetailsAI(emailBody) {
  const prompt = `Extract JSON: name, location, address, dateOfJoining, noticePeriod\nEmail: "${emailBody}"`;
  const aiResponse = await geminiGenerateReply("system", "extract_json", prompt);
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch { return null; }
}

export async function autoReplyToNewMails() {
  const res = await gmail.users.messages.list({ userId: "me", labelIds: ["INBOX"], q: "is:unread" });
  if (!res.data.messages) return;

  for (const msg of res.data.messages) {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id });
      const fromEmail = extractEmailAddress(full.data.payload.headers.find(h => h.name === "From")?.value);
      const emailBody = getEmailBody(full.data.payload) || full.data.snippet;
      const candidates = await firestoreService.findCandidatesByEmail(fromEmail);
      let handled = false;

      for (const candidate of candidates) {
        if (candidate.offerReplyStatus === "pending") {
          const extracted = await extractCandidateDetailsAI(emailBody);
          if (extracted?.dateOfJoining) {
            await firestoreService.updateCandidate(candidate.id, { parsedDetails: extracted, offerReplyStatus: "accepted", status: "Details Received", dateOfJoining: extracted.dateOfJoining });
            await sendFormalOfferAndDocRequest(candidate.id, candidate);
            handled = true; break;
          }
        }
      }

      if (!handled && candidates.length > 0) {
        if (ACCEPTANCE_KEYWORDS.some(k => emailBody.toLowerCase().includes(k))) {
          await requestCandidateDocuments(candidates[0].id, candidates[0]);
          handled = true;
        }
      }

      if (!handled) {
        const aiReply = await geminiGenerateReply(fromEmail, full.data.payload.headers.find(h => h.name === "Subject")?.value, full.data.snippet);
        if (aiReply) await replyToMail({ ...full.data, from: fromEmail, subject: full.data.payload.headers.find(h => h.name === "Subject")?.value }, aiReply);
      }

      await gmail.users.messages.modify({ userId: "me", id: msg.id, requestBody: { removeLabelIds: ["UNREAD"] } });
    } catch (err) { console.error("❌ Mail processing error:", err.message); }
  }
}

export function startAutoReplyLoop() {
  autoReplyToNewMails();
  setInterval(autoReplyToNewMails, 60_000);
}