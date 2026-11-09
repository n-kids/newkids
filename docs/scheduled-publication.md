# Scheduled publication UI

This module connects to the existing page_editor_workflow RPC; it does not apply SQL or enable Cron. Test the built _site, not root HTML. Only a selected approved snapshot is booked. The current form is not implicitly published. Minimal request/approve controls are included because scheduling requires another administrator's approval.

Inputs use the displayed browser time zone and are sent as UTC ISO timestamps. Invalid local dates, past starts and reversed windows are rejected. A server timeout is an unknown outcome: refresh the list before retrying to avoid duplicate requests. The backend checks overlapping windows.

Before production enablement: test the existing migration in a disposable database with two administrators; verify start, finish, active cancellation, overlaps, missed windows, manual-publication conflicts and failed job recovery. Enable and inspect the separate one-minute Cron job only after approval. Frontend/mock tests do not prove that SQL or Cron works.

End behavior restores the publication captured when booking, or removes the new editor publication when none existed. A later manual change must yield conflict instead of overwrite. Cancelling an active booking asks for restoration on the next server run; it is not instant. Without the migration, the card fails closed and ordinary draft editing remains available.
