-- MATH READY SD: skema database Fase 1 (PostgreSQL)
create table if not exists users(
  id serial primary key,
  role text not null check (role in ('student','teacher','parent','admin','super_admin')),
  username text unique not null,
  pass_hash text not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now());
create table if not exists classes(
  id serial primary key,
  name text not null,
  grade int not null check (grade between 4 and 6),
  year text not null,
  teacher_id int references users(id),
  unique(name, year));
create table if not exists students(
  user_id int primary key references users(id) on delete cascade,
  nisn text unique not null check (nisn ~ '^[0-9]{10}$'),
  full_name text not null,
  nickname text not null,
  class_id int not null references classes(id),
  unique(class_id, nickname));
create table if not exists sessions(
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null);
create table if not exists questions(
  id text primary key,
  framework_version text not null,
  grade int not null,
  domain text not null,
  topic text not null,
  subtopic text,
  label text not null check (label in ('CORE_TKA','PREREQUISITE','ENRICHMENT')),
  cognitive_level text,
  difficulty int,
  qtype text not null check (qtype in ('PG','PGK_MCMA','PGK_KATEGORI')),
  stem text not null,
  options jsonb not null,
  answer jsonb not null,
  explanation text,
  rationale text,
  image text,
  status text not null default 'draft' check (status in ('draft','review','pilot','published','unpublished')),
  reviewer_id int references users(id),
  version int not null default 1,
  updated_at timestamptz not null default now());
create table if not exists packages(
  id serial primary key,
  name text unique not null,
  duration_min int not null,
  question_ids jsonb not null);
create table if not exists assignments(
  id serial primary key,
  package_id int not null references packages(id),
  class_id int not null references classes(id),
  due date not null,
  created_by int references users(id),
  created_at timestamptz not null default now());
create table if not exists attempts(
  id serial primary key,
  student_id int not null references students(user_id) on delete cascade,
  assignment_id int not null references assignments(id),
  package_id int not null references packages(id),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  score int, total int,
  unique(student_id, assignment_id));
create table if not exists answers(
  id serial primary key,
  attempt_id int not null references attempts(id) on delete cascade,
  question_id text not null references questions(id),
  response jsonb,
  is_correct boolean,
  unique(attempt_id, question_id));
create table if not exists audit_log(
  id serial primary key,
  user_id int,
  action text not null,
  detail jsonb,
  ip text,
  at timestamptz not null default now());
create index if not exists idx_attempts_assignment on attempts(assignment_id);
create index if not exists idx_answers_attempt on answers(attempt_id);
create index if not exists idx_students_class on students(class_id);
create index if not exists idx_sessions_exp on sessions(expires_at);
create table if not exists meta(key text primary key, value text not null);
create table if not exists login_attempts(
  key text not null,
  at timestamptz not null default now());
create index if not exists idx_login_attempts on login_attempts(key, at);
