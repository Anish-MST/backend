import * as firestoreService from '../services/firestoreService.js';
import * as workflowService from '../services/workflowService.js';

export const addCandidate = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      role, 
      salary, 
      experience, 
      dateOfJoining,
      hasSpecialIncentive,    // ADDED
      specialIncentiveAmount, // ADDED
      specialIncentiveDetail  // ADDED
    } = req.body;

    // Validate required base fields
    if (!name || !email || !role || !salary || !experience || !dateOfJoining) {
      return res.status(400).json({ error: 'All base fields are required' });
    }

    // Prepare candidate data with ALL fields including incentives
    const candidateData = {
      name,
      email,
      role,
      salary,
      experience,
      dateOfJoining,
      // Ensure boolean and number types are correct
      hasSpecialIncentive: !!hasSpecialIncentive, 
      specialIncentiveAmount: Number(specialIncentiveAmount) || 0,
      specialIncentiveDetail: specialIncentiveDetail || "",
      status: 'Initiated'
    };

    // Start workflow
    const { candidateId } = await workflowService.startOnboardingWorkflow(candidateData);

    res.status(201).json({
      message: 'Workflow started successfully!',
      candidateId
    });

  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getAllCandidates = async (req, res) => {
  try {
    const candidates = await firestoreService.getAllCandidates();
    res.status(200).json(candidates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCandidateById = async (req, res) => {
  try {
    const candidate = await firestoreService.getCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    res.status(200).json(candidate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};