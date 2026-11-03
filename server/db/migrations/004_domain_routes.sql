-- Per-domain mail routing, version 4.
-- route_transport: inherit | smtp | direct | http
-- route_config_enc contains encrypted JSON for SMTP URL / adapter URL / token.

ALTER TABLE domains ADD COLUMN route_transport TEXT NOT NULL DEFAULT 'inherit';
ALTER TABLE domains ADD COLUMN route_config_enc TEXT;
