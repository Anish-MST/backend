import * as geminiService from '../services/geminiService.js';
import * as firestoreService from '../services/firestoreService.js';
import * as workflowService from '../services/workflowService.js';

/**
 * Manages conversation context.
 * In a production app, this would be stored in a session, Redis, or a database.
 */
let conversationContext = {};

/**
 * Processes a natural language command from the HR user, maintaining conversation context.
 */
export const processChatCommand = async (req, res) => {
  const { command, context } = req.body;
  conversationContext = context || {}; // Use context from the client

  if (!command) {
    return res.status(400).json({ reply: { text: "Command is missing." } });
  }

  try {
    // 1. Get structured intent from Gemini, passing in the current context
    const { intent, entity, mailNumber } = await geminiService.interpretCommand(command, conversationContext);
    console.log("🔍 Gemini returned:", { intent, entity, mailNumber });

    // If a new entity is mentioned, update it in the context
    if (entity) {
      conversationContext.lastMentionedEntity = entity;
    }

    let reply = { text: "Sorry, I couldn't understand that request. Please try rephrasing." };

    // 2. Execute action based on the interpreted intent
    switch (intent) {
      case 'get_status': {
        const targetEntity = entity || conversationContext.lastMentionedEntity;
        if (!targetEntity) {
          reply.text = "Please specify a candidate's name to check their status.";
          break;
        }
        const candidate = await firestoreService.findCandidateByName(targetEntity);
        if (candidate) {
          reply.text = `The current status for **${targetEntity}** is: **${candidate.status}**.`;
          reply.actions = [
            { label: `Resend Mail 1 to ${targetEntity}`, command: `Resend mail 1 to ${targetEntity}` },
            { label: `Check Documents for ${targetEntity}`, command: `Check documents for ${targetEntity}` },
          ];
        } else {
          reply.text = `I could not find a candidate named "${targetEntity}". Please check the spelling.`;
          delete conversationContext.lastMentionedEntity; // Clear bad entity
        }
        break;
      }

      case 'resend_mail': {
        const targetEntity = entity || conversationContext.lastMentionedEntity;
        if (!targetEntity || !mailNumber) {
          reply.text = "Please specify which mail (1, 2, or 3) to resend and for which candidate. \n*Example: 'Resend mail 2 for Priya'*";
          break;
        }
        const result = await workflowService.resendMail(targetEntity, mailNumber);
        reply.text = result.success
          ? `✅ Successfully resent Mail ${mailNumber} to ${targetEntity}.`
          : `❌ ${result.message}`;
        break;
      }

      case 'list_pending_verifications': {
        const pendingCandidates = await firestoreService.getPendingVerifications();
        if (pendingCandidates.length > 0) {
          const names = pendingCandidates.map(c => `- ${c.name} (${c.status})`).join('\n');
          reply.text = `Here are the candidates with pending document verifications:\n${names}`;
        } else {
          reply.text = "🎉 Great news! There are no pending document verifications at the moment.";
        }
        break;
      }

      case 'check_documents': {
        const targetEntity = entity || conversationContext.lastMentionedEntity;
        if (!targetEntity) {
            reply.text = "Please specify which candidate's documents you want to check.";
            break;
        }
        const candidate = await firestoreService.findCandidateByName(targetEntity);
        if (!candidate) {
            reply.text = `I could not find a candidate named "${targetEntity}".`;
            delete conversationContext.lastMentionedEntity; // Clear bad entity
            break;
        }
        const result = await workflowService.checkDocumentsAndSendFinalOffer(candidate.id);
        reply.text = result.message || `The document check process has been triggered for ${targetEntity}.`;
        break;
      }

      default:
        reply.text = "I'm not sure how to help with that. You can ask me to:\n- Check a candidate's status\n- Resend an email\n- List pending verifications";
        break;
    }

    // Return the response along with the updated context
    res.status(200).json({ reply, context: conversationContext });

  } catch (error) {
    console.error("Chatbot Controller Error:", error);
    res.status(500).json({
      reply: { text: "There was a server error while processing your command." },
      context: conversationContext
    });
  }
};