# Security Notes

Role is not writable from the client; assign role via Firestore Console or Admin SDK.

## Promote an admin
Set `users/{uid}.role = "admin"` in Firestore Console.

## Checklist
- Unenrolled users cannot read lessons/assignments.
- Enrolled users can read lessons/assignments for their course.
- Students can read only their own submissions and progress.
