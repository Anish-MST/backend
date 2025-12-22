import express from 'express';
import * as candidateController from '../controllers/candidateController.js';
const router = express.Router();
router.post('/', candidateController.addCandidate);
router.get('/', candidateController.getAllCandidates);
router.get('/:id', candidateController.getCandidateById);
export default router;