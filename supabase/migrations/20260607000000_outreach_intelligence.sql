-- Outreach intelligence: lead scoring, extended CRM timestamps, sequence tracking.

ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS lead_score smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS interested_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sequence_step smallint DEFAULT 0;

-- Backfill sequence_step for in-flight follow-up sequences.
UPDATE outreach_prospects
SET sequence_step = LEAST(followup_count, 3)
WHERE status = 'sent' AND sequence_step = 0 AND followup_count > 0;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_lead_score
  ON outreach_prospects (campaign, lead_score DESC)
  WHERE status IN ('scraped', 'draft_ready', 'approved');
