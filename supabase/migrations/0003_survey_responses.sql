-- Survey responses from Tally webhooks
create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  tally_response_id text unique not null,
  tally_form_id text not null,
  respondent_id text,
  submitted_at timestamptz not null,
  received_at timestamptz not null default now(),

  -- Parsed fields for easy querying
  email text,
  first_name text,
  experience_level text,
  current_situation text,
  idea_timeline text,
  biggest_challenge text,
  time_consuming_tasks text[], -- checkboxes
  resources_tried text[],     -- checkboxes
  resources_experience text,
  dream_tool text,
  price_too_cheap text,
  price_great_deal text,
  price_getting_expensive text,
  price_too_expensive text,
  interview_willing text,
  additional_comments text,

  -- Scale ratings (1-5)
  rating_viable_ideas int,
  rating_market_potential int,
  rating_patent_ip int,
  rating_sell_sheet int,
  rating_prototype int,
  rating_finding_companies int,
  rating_getting_responses int,
  rating_pitching int,
  rating_deal_terms int,
  rating_motivation int,

  -- Value ratings (1-5)
  value_market_evaluation int,
  value_patent_search int,
  value_sell_sheet_creator int,
  value_company_database int,
  value_contact_templates int,
  value_ai_email_assistant int,
  value_community int,
  value_progress_tracking int,
  value_video_courses int,
  value_coaching int,

  -- Raw payload for completeness
  raw_payload jsonb not null
);

-- Index for lookups
create index idx_survey_responses_email on survey_responses(email);
create index idx_survey_responses_form on survey_responses(tally_form_id);
create index idx_survey_responses_submitted on survey_responses(submitted_at);

-- RLS: only service role can insert (webhook), authenticated users can read
alter table survey_responses enable row level security;

create policy "Service role full access" on survey_responses
  for all using (true) with check (true);
