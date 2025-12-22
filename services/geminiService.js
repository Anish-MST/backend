import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// Initialize Gemini
// NOTE: "gemini-2.5-pro" is not a public model yet. Using "gemini-1.5-flash" for speed/efficiency.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.5-pro"; 
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

/**
 * 🧠 interpretCommand(command, context)
 * -------------------------------------
 * Interprets a chatbot or HR command into structured JSON.
 */
export const interpretCommand = async (command, context = {}) => {
  const prompt = `
You are an intelligent HR assistant bot for an internal onboarding system.
Your task is to interpret the user's command and convert it into a structured JSON.

### CONTEXT
Command: "${command}"
Conversation Context: ${JSON.stringify(context)}

### RULES
1. Valid intents: "get_status", "resend_mail", "list_pending_verifications", "check_documents", "unknown".
2. "entity" = candidate's full name, or null if not mentioned.
3. "mailNumber" = integer (1, 2, 3) if mentioned, otherwise null.
4. Output MUST be a valid JSON object, no explanations.

### EXAMPLES
Command: "Check candidate status for Priya Sharma"
{"intent": "get_status", "entity": "Priya Sharma", "mailNumber": null}

Command: "resend mail 2 for Rahul"
{"intent": "resend_mail", "entity": "Rahul", "mailNumber": 2}

Command: "what about Anish?"
Context: {"lastMentionedEntity": "Priya Sharma"}
{"intent": "get_status", "entity": "Anish", "mailNumber": null}

Command: "Show me pending verifications"
{"intent": "list_pending_verifications", "entity": null, "mailNumber": null}

Command: "Trigger document check for Riya"
{"intent": "check_documents", "entity": "Riya", "mailNumber": null}

Command: "What is the weather?"
{"intent": "unknown", "entity": null, "mailNumber": null}

Now return only JSON output for the given command.
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result?.response?.text()?.trim() || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const finalEntity =
        parsed.entity || (context.lastMentionedEntity ? context.lastMentionedEntity : null);

      return {
        intent: parsed.intent || "unknown",
        entity: finalEntity,
        mailNumber: parsed.mailNumber ?? null,
      };
    }

    throw new Error("Invalid Gemini response");
  } catch (error) {
    console.error("⚠️ Gemini interpretation error:", error.message);
  }

  // Fallback logic using regex
  const statusMatch = command.match(/check\s+(candidate\s+)?status\s+for\s+(.+)/i);
  if (statusMatch) return { intent: "get_status", entity: statusMatch[2].trim(), mailNumber: null };

  const resendMatch = command.match(/resend\s+mail\s+(\d)\s+(to|for)\s+(.+)/i);
  if (resendMatch)
    return { intent: "resend_mail", entity: resendMatch[3].trim(), mailNumber: parseInt(resendMatch[1]) };

  if (/pending\s+verifications?/i.test(command))
    return { intent: "list_pending_verifications", entity: null, mailNumber: null };

  const docMatch = command.match(/(?:trigger\s+(?:the\s+)?document\s+check|check\s+(?:the\s+)?documents?)\s+(?:for|of)\s+(.+)/i);
  if (docMatch) return { intent: "check_documents", entity: docMatch[1].trim(), mailNumber: null };

  return { intent: "unknown", entity: null, mailNumber: null };
};

/**
 * 🤖 geminiGenerateReply(fromEmail, subject, body)
 * ------------------------------------------------
 * Handles TWO cases:
 * 1. Standard Auto-Reply: Generates polite email responses.
 * 2. Data Extraction: Called by gmailService with 'system' as sender to extract JSON.
 */
export async function geminiGenerateReply(fromEmail, subject, body, retries = 3) {
  
  // -------------------------------------------------------
  // CASE 1: INTERNAL SYSTEM CALL (Data Extraction)
  // -------------------------------------------------------
  if (fromEmail === 'system' && subject === 'extract_json') {
      try {
          // In this case, 'body' contains the strict system prompt from gmailService
          const result = await model.generateContent(body);
          return result.response.text();
      } catch (error) {
          console.error("⚠️ Gemini extraction error:", error.message);
          return "";
      }
  }

  // -------------------------------------------------------
  // CASE 2: STANDARD EMAIL AUTO-REPLY
  // -------------------------------------------------------
  const prompt = `
You are an HR assistant replying to candidate emails during the onboarding process.

### Candidate Email Info:
- From: ${fromEmail}
- Subject: ${subject}
- Body: ${body}

### Response Guidelines:
1. Reply politely and professionally as an HR bot.
2. Keep it short (2–4 lines max).
3. If the candidate confirms acceptance → thank them and mention HR will follow up.
4. If the candidate mentions uploading or submitting documents → acknowledge and mention verification will start soon.
5. If the message is unclear or unrelated → thank them and mention HR will respond soon.
6. If the mail is about a technical clarification or general query → provide a brief answer or refer them to check online resources politely.
7. Do NOT repeat the candidate’s email body.
8. **SIGNATURE:** End specifically with:
   "Thanks and regards,
   Anish Narayan S"

Now, write only the email body text (no subject line).
`;

  try {
    const result = await model.generateContent(prompt);
    const replyText = result?.response?.text()?.trim();

    return (  
      replyText ||
      "Thank you for your message. Our HR team will review it and get back to you shortly.\n\nThanks and regards,\nAnish Narayan S"
    );
  } catch (error) {
    console.error("⚠️ Gemini auto-reply error:", error.message);

    // Retry logic for temporary service errors
    if (retries > 0 && error.status && [429, 500, 502, 503, 504].includes(error.status)) {
      const delay = (4 - retries) * 2000; // 2s, 4s, 6s backoff
      console.warn(
        `🔁 Retrying Gemini request in ${delay}ms... (${retries - 1} retries left)`
      );
      await new Promise((res) => setTimeout(res, delay));
      return geminiGenerateReply(fromEmail, subject, body, retries - 1);
    }

    // Fallback safe response
    return "Thank you for your message. Our HR team will review it and get back to you shortly.\n\nThanks and regards,\nAnish Narayan S";
  }
}

/**
 * 🧩 geminiSummarizeThread(threadMessages)
 * ----------------------------------------
 * Summarizes full Gmail conversation threads.
 */
export async function geminiSummarizeThread(threadMessages) {
  try {
    const conversation = threadMessages
      .map((msg, i) => `(${i + 1}) ${msg.from}: ${msg.body}`)
      .join("\n\n");

    const prompt = `
You are an HR assistant summarizing an email thread between HR and a candidate.
Summarize briefly in 3-4 lines what has happened so far.

Thread:
${conversation}
`;

    const result = await model.generateContent(prompt);
    return result?.response?.text()?.trim() || "No summary available.";
  } catch (error) {
    console.error("⚠️ Gemini summary error:", error.message);
    return "No summary available.";
  }
}