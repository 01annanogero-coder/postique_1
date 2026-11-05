-- Server-side one-time proof consumption, version 10.
ALTER TABLE verification_requests ADD COLUMN proof_consumed_at TEXT;
