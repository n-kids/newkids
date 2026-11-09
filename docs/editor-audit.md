# Read-only editor audit history

The UI checks the existing read-only administrator RPC before selecting only id, page_key, action, actor, happened_at and details from page_editor_audit through the authenticated Supabase client. It performs no inserts, updates, deletes, exports, restores or role changes. The existing administrator SELECT/RLS policy remains authoritative; a hidden card is not an access-control boundary.

Current/all pages, action family, actor UUID, null-actor records and inclusive local-calendar date filters are applied on the server. End dates become the next local midnight (exclusive). The table shows 25 rows at a time, ordered by descending audit ID with a strict less-than keyset cursor and one-row lookahead. It rejects unsafe numeric IDs rather than silently losing bigint precision. More pages do not indicate a total database count or a transactionally frozen snapshot; refresh to retrieve the newest records.

Details are limited to version, status, item_id and draft_version. Tokens, token hashes, documents and unknown metadata are not rendered. All text is inserted as text, not HTML. A null actor means no authenticated user ID was recorded, not proof that a particular Cron job or administrator performed the operation. Workflow status transitions are labelled generically because the existing event schema does not always distinguish semantic causes. One save or publication may generate multiple DB events.

Records start when the audit triggers are installed; historical activity is not reconstructed. Failed rolled-back operations are not included as successful audit changes. No migration is applied by adding this UI. If the table is unavailable or SELECT is denied, show an error rather than an empty successful history.

Changing filters or pages invalidates pending results. Read requests have a ten-second limit and cancellation where supported. Successful saves, publications and visible workflow actions refresh the current applied filters, but do not silently apply unfinished filter edits. This is not continuous polling.

Browser tests use a test-only audit query adapter, not production data. Run real administrator/non-administrator and audit-trigger integration tests in an isolated database before production enablement. Source/helper/DOM checks do not mean the full Playwright suite or real RLS has been executed. Test the built _site.

The authorization precheck and SELECT are separate requests. RLS remains the final enforcement; an empty response is not independent proof of a complete archive, especially if access changes during a request.
