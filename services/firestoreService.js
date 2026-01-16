import { db, admin } from "../config/firebaseAdmin.js";
const candidatesCollection = db.collection("candidates");

export const createCandidate = async (candidateData) => {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const docRef = await candidatesCollection.add({
    ...candidateData,
    hasSpecialIncentive: candidateData.hasSpecialIncentive || false,
    specialIncentiveAmount: candidateData.specialIncentiveAmount || 0,
    specialIncentiveDetail: candidateData.specialIncentiveDetail || "",
    
    // NEW: Default reminder schedule (10 AM and 2 PM)
    reminderTimes: [10, 14], 

    createdAt: timestamp,
    updatedAt: timestamp,
    status: "Initiated",
    offerReplyStatus: "pending",
    parsedDetails: null,
    driveFolderId: null,
    driveFolderWebViewLink: null,
    docStatus: null,
    lastDocReminderAt: null,
    verification: {
      panStatus: "Pending",
      aadhaarStatus: "Pending",
      overallStatus: "Pending"
    },
    log: [{ event: "Workflow Initiated", timestamp: new Date().toISOString() }]
  });

  return docRef.id;
};

// ... keep other functions (updateCandidate, addLog, getCandidate, etc.) as they were
export const updateCandidate = async (candidateId, data) => {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  await candidatesCollection.doc(candidateId).set(
    { ...data, updatedAt: timestamp },
    { merge: true }
  );
};

export const addLog = async (candidateId, eventMessage) => {
  const logEntry = { event: eventMessage, timestamp: new Date().toISOString() };
  await candidatesCollection.doc(candidateId).update({
    log: admin.firestore.FieldValue.arrayUnion(logEntry),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

export const getAllCandidates = async () => {
  const snapshot = await candidatesCollection.orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getCandidate = async (candidateId) => {
  const doc = await candidatesCollection.doc(candidateId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};