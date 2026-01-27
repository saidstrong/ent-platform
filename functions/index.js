/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require("firebase-admin");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");

admin.initializeApp();

exports.onPaymentApproved = onDocumentUpdated("payments/{paymentId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  const isApprovedLike = (status) => status === "approved" || status === "confirmed";
  if (isApprovedLike(before.status) || !isApprovedLike(after.status)) return;
  const uid = after.uid;
  const courseId = after.courseId;
  if (!uid || !courseId) return;
  const enrollmentId = `${uid}_${courseId}`;
  await admin.firestore().doc(`enrollments/${enrollmentId}`).set(
    {
      uid,
      courseId,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
});
