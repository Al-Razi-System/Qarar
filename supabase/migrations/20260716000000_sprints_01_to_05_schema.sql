-- PB-006 to PB-050: Sprints 01 to 05 schema: Meetings, Decisions, Action Items, Minutes

alter table public.memberships add unique (id, organization_id);

-- 1. Meeting Entities
create table public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_no text not null,
  governance_unit_id uuid not null references public.governance_units(id) on delete restrict,
  meeting_type_id uuid references public.meeting_types(id) on delete restrict,
  title_ar text not null,
  title_en text,
  scheduled_date date not null,
  start_time time,
  end_time time,
  location_type text not null default 'onsite' check (location_type in ('onsite', 'online', 'hybrid')),
  location_details text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'ready_to_start', 'in_progress', 'waiting_for_minutes', 'waiting_for_approval', 'closed', 'archived', 'cancelled')),
  quorum_status text not null default 'not_calculated' check (quorum_status in ('not_calculated', 'met', 'not_met')),
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, meeting_no),
  foreign key (governance_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (meeting_type_id, organization_id) references public.meeting_types(id, organization_id),
  foreign key (created_by_user_id, organization_id) references public.users(id, organization_id)
);

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  agenda_order integer not null check (agenda_order > 0),
  agenda_status text not null default 'pending' check (agenda_status in ('pending', 'under_discussion', 'discussed', 'postponed')),
  discussion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (meeting_id, topic_id), -- prevent same topic in same meeting twice
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (topic_id, organization_id) references public.topics(id, organization_id)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'present', 'absent', 'excused', 'late')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (meeting_id, user_id),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  foreign key (membership_id, organization_id) references public.memberships(id, organization_id)
);

-- 2. Decisions
create table public.decision_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  produces_action_item boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  decision_no text not null,
  topic_id uuid not null references public.topics(id) on delete restrict,
  meeting_id uuid references public.meetings(id) on delete restrict,
  agenda_item_id uuid references public.agenda_items(id) on delete restrict,
  governance_unit_id uuid not null references public.governance_units(id) on delete restrict,
  decision_type_id uuid references public.decision_types(id) on delete restrict,
  decision_text text not null,
  decision_status text not null default 'draft' check (decision_status in ('draft', 'under_review', 'ready_for_approval', 'approved', 'sent_to_execution', 'under_follow_up', 'closed', 'cancelled', 'rejected')),
  issued_at timestamptz,
  issued_by_user_id uuid not null references public.users(id) on delete restrict,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, decision_no),
  foreign key (topic_id, organization_id) references public.topics(id, organization_id),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (agenda_item_id, organization_id) references public.agenda_items(id, organization_id),
  foreign key (governance_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (decision_type_id, organization_id) references public.decision_types(id, organization_id),
  foreign key (issued_by_user_id, organization_id) references public.users(id, organization_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  topic_id uuid references public.topics(id) on delete restrict,
  decision_id uuid references public.decisions(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  vote_value text not null check (vote_value in ('approve', 'reject', 'abstain')),
  vote_note text,
  voted_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (meeting_id, user_id, topic_id), -- One vote per user per topic in a meeting
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (topic_id, organization_id) references public.topics(id, organization_id),
  foreign key (decision_id, organization_id) references public.decisions(id, organization_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  foreign key (membership_id, organization_id) references public.memberships(id, organization_id)
);

create table public.decision_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  decision_id uuid not null references public.decisions(id) on delete restrict,
  note_type text not null default 'general' check (note_type in ('general', 'reservation', 'clarification')),
  note_text text not null,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (decision_id, organization_id) references public.decisions(id, organization_id),
  foreign key (created_by_user_id, organization_id) references public.users(id, organization_id)
);

create table public.decision_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  decision_id uuid not null references public.decisions(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text,
  unique (id, organization_id),
  foreign key (decision_id, organization_id) references public.decisions(id, organization_id),
  foreign key (changed_by_user_id, organization_id) references public.users(id, organization_id)
);

-- 3. Execution (Action Items)
create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_no text not null,
  decision_id uuid not null references public.decisions(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  assigned_unit_id uuid references public.governance_units(id) on delete restrict,
  assigned_user_id uuid references public.users(id) on delete restrict,
  follow_up_user_id uuid references public.users(id) on delete restrict,
  title_ar text not null,
  title_en text,
  description text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'completed', 'overdue', 'cancelled', 'closed')),
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, action_no),
  foreign key (decision_id, organization_id) references public.decisions(id, organization_id),
  foreign key (topic_id, organization_id) references public.topics(id, organization_id),
  foreign key (assigned_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (assigned_user_id, organization_id) references public.users(id, organization_id),
  foreign key (follow_up_user_id, organization_id) references public.users(id, organization_id),
  check (assigned_unit_id is not null or assigned_user_id is not null)
);

create table public.action_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_item_id uuid not null references public.action_items(id) on delete restrict,
  evidence_type text not null default 'document' check (evidence_type in ('document', 'link', 'note')),
  description text not null,
  file_name text,
  storage_path text,
  uploaded_by_user_id uuid not null references public.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (action_item_id, organization_id) references public.action_items(id, organization_id),
  foreign key (uploaded_by_user_id, organization_id) references public.users(id, organization_id)
);

create table public.follow_up_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_item_id uuid not null references public.action_items(id) on delete restrict,
  follow_up_type text not null default 'status_update' check (follow_up_type in ('status_update', 'reminder', 'warning')),
  follow_up_note text not null,
  status_snapshot text,
  progress_snapshot integer,
  recorded_by_user_id uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (action_item_id, organization_id) references public.action_items(id, organization_id),
  foreign key (recorded_by_user_id, organization_id) references public.users(id, organization_id)
);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_item_id uuid not null references public.action_items(id) on delete restrict,
  escalation_level integer not null default 1 check (escalation_level > 0),
  escalation_reason text not null,
  escalated_to_user_id uuid references public.users(id) on delete restrict,
  escalated_to_unit_id uuid references public.governance_units(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'resolved', 'closed')),
  escalated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, organization_id),
  foreign key (action_item_id, organization_id) references public.action_items(id, organization_id),
  foreign key (escalated_to_user_id, organization_id) references public.users(id, organization_id),
  foreign key (escalated_to_unit_id, organization_id) references public.governance_units(id, organization_id)
);

-- 4. Minutes
create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  draft_text text,
  final_text text,
  minutes_status text not null default 'draft_generated' check (minutes_status in ('draft_generated', 'under_review', 'ready_for_approval', 'approved', 'closed')),
  generated_by_ai boolean not null default false,
  generated_at timestamptz,
  reviewed_by_user_id uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (meeting_id, organization_id),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (reviewed_by_user_id, organization_id) references public.users(id, organization_id)
);

-- Indexes
create index idx_meetings_org_unit on public.meetings(organization_id, governance_unit_id);
create index idx_agenda_items_meeting on public.agenda_items(meeting_id);
create index idx_decisions_org_topic on public.decisions(organization_id, topic_id);
create index idx_action_items_org_decision on public.action_items(organization_id, decision_id);
create index idx_meeting_minutes_meeting on public.meeting_minutes(meeting_id);

-- Triggers for updated_at
create trigger set_meeting_types_updated_at before update on public.meeting_types for each row execute function public.set_updated_at();
create trigger set_meetings_updated_at before update on public.meetings for each row execute function public.set_updated_at();
create trigger set_agenda_items_updated_at before update on public.agenda_items for each row execute function public.set_updated_at();
create trigger set_decision_types_updated_at before update on public.decision_types for each row execute function public.set_updated_at();
create trigger set_decisions_updated_at before update on public.decisions for each row execute function public.set_updated_at();
create trigger set_action_items_updated_at before update on public.action_items for each row execute function public.set_updated_at();
create trigger set_meeting_minutes_updated_at before update on public.meeting_minutes for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.meeting_types enable row level security;
alter table public.meetings enable row level security;
alter table public.agenda_items enable row level security;
alter table public.attendance_records enable row level security;
alter table public.votes enable row level security;
alter table public.decision_types enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_notes enable row level security;
alter table public.decision_status_history enable row level security;
alter table public.action_items enable row level security;
alter table public.action_evidence enable row level security;
alter table public.follow_up_records enable row level security;
alter table public.escalations enable row level security;
alter table public.meeting_minutes enable row level security;

-- Policies
create policy "meeting types are visible inside organization" on public.meeting_types for select to authenticated using (organization_id = public.current_organization_id());
create policy "admins can manage meeting types" on public.meeting_types for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "meetings are visible to organization members" on public.meetings for select to authenticated using (organization_id = public.current_organization_id());
create policy "unit members and admins can manage meetings" on public.meetings for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or public.has_unit_role_code(governance_unit_id, array['council_chair', 'council_rapporteur'])));

create policy "agenda items follow meeting visibility" on public.agenda_items for select to authenticated using (organization_id = public.current_organization_id());
create policy "unit members can manage agenda" on public.agenda_items for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or exists (select 1 from public.meetings m where m.id = meeting_id and public.has_unit_role_code(m.governance_unit_id, array['council_chair', 'council_rapporteur']))));

create policy "attendance records follow meeting visibility" on public.attendance_records for select to authenticated using (organization_id = public.current_organization_id());
create policy "unit members can manage attendance" on public.attendance_records for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or exists (select 1 from public.meetings m where m.id = meeting_id and public.has_unit_role_code(m.governance_unit_id, array['council_chair', 'council_rapporteur']))));

create policy "votes follow meeting visibility" on public.votes for select to authenticated using (organization_id = public.current_organization_id());
create policy "users can cast their own votes" on public.votes for insert to authenticated with check (organization_id = public.current_organization_id() and user_id = auth.uid());
create policy "rapporteurs can manage votes" on public.votes for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or exists (select 1 from public.meetings m where m.id = meeting_id and public.has_unit_role_code(m.governance_unit_id, array['council_chair', 'council_rapporteur']))));

create policy "decision types are visible inside organization" on public.decision_types for select to authenticated using (organization_id = public.current_organization_id());
create policy "admins can manage decision types" on public.decision_types for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "decisions are visible to organization members" on public.decisions for select to authenticated using (organization_id = public.current_organization_id());
create policy "unit members can manage decisions" on public.decisions for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or public.has_unit_role_code(governance_unit_id, array['council_chair', 'council_rapporteur'])));

create policy "decision notes follow decision visibility" on public.decision_notes for select to authenticated using (organization_id = public.current_organization_id());
create policy "decision history follows decision visibility" on public.decision_status_history for select to authenticated using (organization_id = public.current_organization_id());
create policy "users can add their own notes" on public.decision_notes for insert to authenticated with check (organization_id = public.current_organization_id() and created_by_user_id = auth.uid());
create policy "authorized users can append history" on public.decision_status_history for insert to authenticated with check (organization_id = public.current_organization_id() and changed_by_user_id = auth.uid());

create policy "action items are visible to assigned users and unit members" on public.action_items for select to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or assigned_user_id = auth.uid() or follow_up_user_id = auth.uid() or public.has_active_membership(assigned_unit_id) or public.has_role_code(array['governance_admin'])));
create policy "authorized users can manage action items" on public.action_items for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or follow_up_user_id = auth.uid() or exists (select 1 from public.decisions d where d.id = decision_id and public.has_unit_role_code(d.governance_unit_id, array['council_chair', 'council_rapporteur']))));
create policy "assigned users can update action item progress" on public.action_items for update to authenticated using (organization_id = public.current_organization_id() and (assigned_user_id = auth.uid() or public.has_active_membership(assigned_unit_id)));

create policy "evidence follows action item visibility" on public.action_evidence for select to authenticated using (organization_id = public.current_organization_id() and exists (select 1 from public.action_items a where a.id = action_item_id));
create policy "users can upload evidence" on public.action_evidence for insert to authenticated with check (organization_id = public.current_organization_id() and uploaded_by_user_id = auth.uid());
create policy "follow_ups follow action item visibility" on public.follow_up_records for select to authenticated using (organization_id = public.current_organization_id() and exists (select 1 from public.action_items a where a.id = action_item_id));
create policy "escalations follow action item visibility" on public.escalations for select to authenticated using (organization_id = public.current_organization_id() and exists (select 1 from public.action_items a where a.id = action_item_id));

create policy "minutes follow meeting visibility" on public.meeting_minutes for select to authenticated using (organization_id = public.current_organization_id());
create policy "unit members can manage minutes" on public.meeting_minutes for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or exists (select 1 from public.meetings m where m.id = meeting_id and public.has_unit_role_code(m.governance_unit_id, array['council_chair', 'council_rapporteur']))));