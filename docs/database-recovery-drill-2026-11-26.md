# Database recovery drill — 26 November 2026

## Scope

This drill used a read-only logical export from Supabase project `qbsiddpzkcielqvruqgj` and restored it into a dedicated local Supabase stack. It did not reset, seed or modify the remote database or the normal Dovid development stack.

The export is held under Git-ignored `.tmp/recovery-drill-20261126/`. It contains authentication and controlled pre-launch application data and must not be committed, emailed unencrypted or uploaded to an unapproved location.

## Export evidence

Supabase CLI `3.4.0` produced separate role, schema and data artifacts with explicit remote targeting.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 297 | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |
| `schema.sql` | 421,697 | `09576C2B3EF68D895583B19E1041C73A387632B6447B694B9A1269404D1D95E0` |
| `data.sql` | 596,773 | `B1322D0DEA1224B055D858BD32A107DCF5DD2FEE361EA3031EA16B3646455FE7` |

## Recovery procedure proved by the drill

1. Start a clean, isolated full Supabase stack with a compatible Postgres major version.
2. Apply the repository migrations before restoring data. All 41 migrations applied successfully in this drill.
3. Clear only application and restorable Auth data in the isolated target. Preserve Supabase platform schemas and migration metadata.
4. Load `data.sql` with strict error handling. The dump sets `session_replication_role` while loading, so application signup triggers do not create duplicate profiles.
5. Compare aggregate source and target invariants, then run the database validation suites.

Do not treat the schema dump alone as the complete recovery procedure. Supabase intentionally excludes managed schemas such as `auth` from the schema export. Application objects attached to managed tables, including the Dovid `auth.users` profile trigger, are recreated by the repository migrations. A schema-only restore without migrations reproduced the rows but omitted that trigger; the corrected migration-first procedure preserved it.

## Results

- Role, schema and data dump commands: passed.
- Clean migration replay: 41/41 migrations applied.
- Clean database validation: 12/12 SQL suites passed.
- Final data load: passed with zero SQL errors.
- Recovered-data validation: 11/11 data-independent workflow and security suites passed.
- Restored Auth signup trigger: present.
- Source-to-target invariants: exact match.

| Invariant | Remote | Restored |
| --- | ---: | ---: |
| Public tables | 72 | 72 |
| RLS-enabled public tables | 72 | 72 |
| Public policies | 99 | 99 |
| Public functions | 68 | 68 |
| Auth users | 6 | 6 |
| Profiles | 6 | 6 |
| Delivery orders | 3 | 3 |
| Payment intents | 3 | 3 |
| Payment transactions | 3 | 3 |
| Audit logs | 37 | 37 |
| Staff audit events | 32 | 32 |
| Fleet vehicles | 2 | 2 |
| Service zones | 7 | 7 |

## Remaining owner actions

This local drill proves technical recoverability but does not by itself satisfy the owner-held recovery gate. Before launch:

- move a verified export to access-controlled, encrypted, off-device storage;
- record the backup owner, retention period, recovery-point objective and recovery-time objective;
- preserve the encryption recovery key separately from the backup;
- complete the runbook-required restore into an approved non-production Supabase project, or explicitly approve the isolated full-stack drill as the Free-plan recovery environment;
- schedule the next drill and test restoration from the off-device copy, not the working copy.
