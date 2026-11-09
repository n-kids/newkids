# Stored-snapshot review and approval

The review card replaces/hides the scheduling card's minimal review request and approval buttons, while leaving booking controls intact. It uses the existing workflow RPC. No production schema or permissions are changed by these UI sources.

Request saves through the existing editor save handler, captures the returned version and submits that version to the backend. Decisions use a selected immutable request ID and display the whole snapshot plus changes against the current new-editor publication. No unrequested save, approval or publication occurs. Acknowledgement and confirmation are required for decisions. Approving does not publish.

The UI disables approval for the requester, stale snapshots and decided requests. The existing SQL remains the authority for administrator access, peer approval, exact-version approval and exact-document publication. The final publication gate deliberately permits a subsequent save of identical JSON content even if its version increases; a changed document needs a new approval. An approval is consumed on publish or schedule. Local unsaved input is not the same thing as the queried server draft.

After a decision the scheduling list is refreshed when available. Acknowledgement resets on reload; the selected ID is retained if still present in the returned list. Page changes invalidate stale responses. Timeout outcomes are unknown: manually reload the list before retrying. Query results cover the backend's recent work-item window, not an unlimited review archive.

The Playwright tests use independent contexts and a shared test-process model with two synthetic administrators. They are UI/contract tests, not proof of live SQL, RLS, JWT verification or production permissions. Run two-real-test-user database integration tests before applying the migration or enabling mandatory approvals. Existing ordinary editing is retained if the workflow RPC is unavailable. Test the built _site, not raw HTML.
