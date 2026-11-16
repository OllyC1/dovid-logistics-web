<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mobile-first product rule

- Assume at least 85% of Dovid Logistics users are on mobile, including customers, administrators, and riders.
- Design and implement the 375px and 390px experiences first; desktop enhancement comes afterward.
- Do not accept a feature as complete because it works on desktop. Validate navigation, forms, tables, dialogs, feedback, loading states, overflow, and touch targets at both mobile widths.
- Prefer mobile cards, stacked controls, and concise progressive disclosure over wide tables or desktop-only layouts.
- Every customer, admin, rider, authentication, booking, payment, tracking, and onboarding change must include mobile acceptance coverage where practical.
