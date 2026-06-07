-- Expand outreach_email_events.event_type for full CRM funnel logging.

ALTER TABLE public.outreach_email_events
  DROP CONSTRAINT IF EXISTS outreach_email_events_event_type_check;

ALTER TABLE public.outreach_email_events
  ADD CONSTRAINT outreach_email_events_event_type_check
  CHECK (event_type IN (
    'sent', 'delivered', 'open', 'click', 'reply', 'interested',
    'meeting_booked', 'booked', 'converted', 'bounce', 'unsubscribe'
  ));
