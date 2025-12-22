import * as workflowService from '../services/workflowService.js';

export const handleDocumentCheck = async (req, res) => {
  try {
    const { id: candidateId } = req.params;
    const result = await workflowService.checkDocumentsAndSendFinalOffer(candidateId);
    if (result.triggered) {
      res.status(200).json({ message: 'Documents verified and final offer sent.' });
    } else {
      res.status(200).json({ message: result.message });
    }
  } catch (error) {
    console.error("Document check error:", error);
    res.status(500).json({ error: 'Failed to process document check.' });
  }
}