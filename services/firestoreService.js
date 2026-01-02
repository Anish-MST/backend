import { db, admin } from "../config/firebaseAdmin.js";

const candidatesCollection = db.collection("candidates");

/**
 * --------------------------------------------------
 * 1. CREATE CANDIDATE
 * --------------------------------------------------
 */
export const createCandidate = async (candidateData) => {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const docRef = await candidatesCollection.add({
    // Standard data from form
    ...candidateData,

    // Explicit Incentive mapping
    hasSpecialIncentive: candidateData.hasSpecialIncentive || false,
    specialIncentiveAmount: candidateData.specialIncentiveAmount || 0,
    specialIncentiveDetail: candidateData.specialIncentiveDetail || "",

    // Timestamps
    createdAt: timestamp,
    updatedAt: timestamp,

    // Workflow Defaults
    status: "Initiated",
    offerReplyStatus: "pending",
    parsedDetails: null,
    driveFolderId: null,
    driveFolderWebViewLink: null,
    docStatus: null,
    lastDocReminderAt: null,

    // Verification Object
    verification: {
      panStatus: "Pending",
      aadhaarStatus: "Pending",
      overallStatus: "Pending"
    },

    // Audit Log
    log: [
      {
        event: "Workflow Initiated",
        timestamp: new Date().toISOString()
      }
    ]
  });

  return docRef.id;
};


/**
 * --------------------------------------------------
 * 2. UPDATE CANDIDATE (SAFE MERGE)
 * --------------------------------------------------
 */
export const updateCandidate = async (candidateId, data) => {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  await candidatesCollection.doc(candidateId).set(
    { ...data, updatedAt: timestamp },
    { merge: true }
  );
};
;

/**
 * --------------------------------------------------
 * 3. ADD LOG ENTRY
 * --------------------------------------------------
 */
export const addLog = async (candidateId, eventMessage) => {
  const logEntry = { event: eventMessage, timestamp: new Date().toISOString() };
  await candidatesCollection.doc(candidateId).update({
    log: admin.firestore.FieldValue.arrayUnion(logEntry),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};
/**
 * --------------------------------------------------
 * 4. GET CANDIDATE BY ID
 * --------------------------------------------------
 */
export const getCandidate = async (candidateId) => {
  const doc = await candidatesCollection.doc(candidateId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

/**
 * --------------------------------------------------
 * 5. GET ALL CANDIDATES
 * --------------------------------------------------
 */
export const getAllCandidates = async () => {
  const snapshot = await candidatesCollection.orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
/**
 * --------------------------------------------------
 * 6. FIND BY NAME
 * --------------------------------------------------
 */
export const findCandidateByName = async (name) => {
  const snapshot = await candidatesCollection
    .where("name", "==", name)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

/**
 * --------------------------------------------------
 * 7. FIND BY EMAIL (MULTI)
 * --------------------------------------------------
 */
export const findCandidatesByEmail = async (email) => {
  const snapshot = await candidatesCollection.where("email", "==", email).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Legacy helper (single)
 */
export const findCandidateByEmail = async (email) => {
  const candidates = await findCandidatesByEmail(email);
  return candidates.length > 0 ? candidates[0] : null;
};

/**
 * --------------------------------------------------
 * 8. PENDING VERIFICATIONS
 * --------------------------------------------------
 */
export const getPendingVerifications = async () => {
  const snapshot = await candidatesCollection
    .where("verification.overallStatus", "in", ["Pending", "Mismatch"])
    .get();

  if (snapshot.empty) return [];

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};