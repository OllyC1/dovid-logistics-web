# Staff onboarding and founder recovery

## Initial Super Admin

1. Deploy the staff-management migration and application before sending an invitation.
2. Confirm the intended company email and record the founder's explicit approval reference outside source control.
3. Run `npm run staff:bootstrap -- --email <company-email> --approval-reference <approval-reference> --app-url <deployed-url>` from a trusted workstation with the existing server environment loaded.
4. The script sends a Supabase Auth invitation or recovery email. It never prints the invitation token and never creates a password.
5. The recipient opens the single-use email link, chooses a password on `/staff/setup`, enrolls a TOTP authenticator, and verifies a current code.
6. Only then does the server finalize the one-time bootstrap, set the compatible `profiles.role` value to `admin`, activate the `super_admin` staff membership, and write immutable audit records.

The bootstrap expires after one hour. Re-running the approved command for the same identity replaces the email challenge and extends only the pending request. A completed bootstrap cannot be repeated for a different identity.

## Administrator and rider invitations

- Super Admins can invite administrators and riders from `/admin/team`.
- An administrator needs `riders.invite` to invite riders and can never invite an administrator.
- Administrator invitations require email verification, password setup, TOTP MFA, identity review and explicit activation.
- Rider invitations require email verification, password setup, identity/document review and explicit activation. Rider creation never marks a motorcycle available.
- Suspensions and permission changes are checked against current database state for every sensitive request, so a stale JWT does not retain staff access.

## Founder-controlled recovery

Before launch, enroll a second founder-controlled Super Admin with a separately secured company identity and TOTP device. The database blocks suspending or revoking the final active Super Admin.

If the only founder loses password access but still controls the verified mailbox, use the normal Supabase recovery email. If all MFA factors are lost, do not bypass MFA in application code. A founder must verify company identity through a documented incident process, use Supabase administrative recovery to remove the lost factor, and record the incident and recovery evidence in the immutable staff audit history before access resumes.
