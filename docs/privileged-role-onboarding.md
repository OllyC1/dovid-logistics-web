# Privileged role onboarding

Public signup always creates a customer. Never accept `admin` or `rider` from signup metadata, and never use a service-role key in a browser.

## Initial administrator

1. The founder creates a normal account and completes Supabase email verification.
2. A project owner verifies the founder's identity out of band and records a non-secret reference such as an internal approval ticket. Do not store identity-document images in role-assignment evidence.
3. In the Supabase SQL editor, confirm there is no existing administrator and call `assign_verified_application_role` as the project owner, using the verified user's UUID for both `target_user_id` and `actor_id`, `target_role => 'admin'`, a meaningful reason, and a fresh UUID idempotency key.
4. Review the new `privileged_role_assignments` and `audit_logs` rows before the administrator signs in again.

The bootstrap path works only while no administrator exists. It requires the trusted service/database context and a verified, active Supabase Auth user.

## Additional administrators and riders

1. Each person registers personally, verifies their email, and completes the team's identity and employment checks.
2. An existing administrator submits the server-only `POST /api/admin/role-assignments` workflow with the user's UUID, intended role, verification method, non-secret verification reference, reason, and idempotency key.
3. For riders, separately verify licence/training, emergency contact, vehicle assignment, payload limits, and safety clearance. Role assignment does not activate a bike or a service zone.
4. Review the immutable assignment audit, then have the person sign out and back in.

Do not reuse accounts, assign roles from email address alone, place verification documents in JSON metadata, or manually edit `profiles.role` during routine onboarding.
