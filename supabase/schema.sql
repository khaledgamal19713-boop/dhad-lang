-- ضاد: مخطط قاعدة البيانات الكامل (يُطبّق بالترتيب). مرجع لإعادة بناء المشروع من الصفر.
-- المشروع: dhad-lang · المنطقة: eu-central-1

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  editor_prefs jsonb not null default '{"fontSize":14,"theme":"dark"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects(owner_id);
create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 200),
  content text not null default '' check (octet_length(content) <= 524288),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);
create index files_project_idx on public.files(project_id);
create index files_owner_idx on public.files(owner_id);
create table public.file_versions (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  version int not null,
  created_at timestamptz not null default now()
);
create index file_versions_file_idx on public.file_versions(file_id, version desc);
create index file_versions_owner_idx on public.file_versions(owner_id);
create table public.shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index shares_project_idx on public.shares(project_id);
create index shares_owner_idx on public.shares(owner_id);
create table public.snippets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'عام' check (char_length(category) <= 60),
  code text not null check (octet_length(code) <= 65536),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index snippets_owner_idx on public.snippets(owner_id);
create index snippets_public_idx on public.snippets(is_public) where is_public;
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'ملاحظة' check (kind in ('ملاحظة','خطأ','اقتراح')),
  message text not null check (char_length(message) between 1 and 4000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index feedback_user_idx on public.feedback(user_id);

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger trg_snippets_updated before update on public.snippets for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.file_versions enable row level security;
alter table public.shares enable row level security;
alter table public.snippets enable row level security;
alter table public.feedback enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy projects_all_own on public.projects for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy files_all_own on public.files for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy file_versions_select_own on public.file_versions for select to authenticated using (owner_id = (select auth.uid()));
create policy shares_all_own on public.shares for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy snippets_select on public.snippets for select to authenticated using (is_public or owner_id = (select auth.uid()));
create policy snippets_select_public_anon on public.snippets for select to anon using (is_public);
create policy snippets_insert_own on public.snippets for insert to authenticated with check (owner_id = (select auth.uid()));
create policy snippets_update_own on public.snippets for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy snippets_delete_own on public.snippets for delete to authenticated using (owner_id = (select auth.uid()));
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy feedback_select_own on public.feedback for select to authenticated using (user_id = (select auth.uid()));

-- ===== المحفّزات والدوال =====
create or replace function public.files_before_update() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.content is distinct from old.content then new.version = old.version + 1; end if;
  return new;
end; $$;
create trigger trg_files_before_update before update on public.files for each row execute function public.files_before_update();

create or replace function public.files_after_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.content is distinct from old.content then
    insert into public.file_versions(file_id, owner_id, content, version) values (old.id, old.owner_id, old.content, old.version);
  end if;
  return new;
end; $$;
create trigger trg_files_after_update after update on public.files for each row execute function public.files_after_update();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.enforce_limits() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    if (select count(*) from public.projects where owner_id = new.owner_id) >= 50 then raise exception 'تجاوزت الحد الأقصى: ٥٠ مشروعًا'; end if;
  elsif tg_table_name = 'files' then
    if (select count(*) from public.files where project_id = new.project_id) >= 200 then raise exception 'تجاوزت الحد الأقصى: ٢٠٠ ملف في المشروع'; end if;
  elsif tg_table_name = 'snippets' then
    if (select count(*) from public.snippets where owner_id = new.owner_id) >= 200 then raise exception 'تجاوزت الحد الأقصى: ٢٠٠ قالب'; end if;
  elsif tg_table_name = 'feedback' then
    if new.user_id is not null and (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then raise exception 'عدد كبير من الملاحظات، حاول لاحقًا'; end if;
  end if;
  return new;
end; $$;
create trigger trg_limit_projects before insert on public.projects for each row execute function public.enforce_limits();
create trigger trg_limit_files before insert on public.files for each row execute function public.enforce_limits();
create trigger trg_limit_snippets before insert on public.snippets for each row execute function public.enforce_limits();
create trigger trg_limit_feedback before insert on public.feedback for each row execute function public.enforce_limits();

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.files_before_update() from public, anon, authenticated;
revoke execute on function public.files_after_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_limits() from public, anon, authenticated;

create or replace function public.restore_file_version(p_file_id uuid, p_version int) returns void language plpgsql set search_path = '' as $$
declare v_content text;
begin
  select content into v_content from public.file_versions where file_id = p_file_id and version = p_version and owner_id = (select auth.uid());
  if v_content is null then raise exception 'النسخة غير موجودة'; end if;
  update public.files set content = v_content where id = p_file_id and owner_id = (select auth.uid());
end; $$;
revoke execute on function public.restore_file_version(uuid, int) from public, anon;
grant execute on function public.restore_file_version(uuid, int) to authenticated;

create or replace function public.get_shared_project(p_slug text) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', p.name, 'description', p.description,
    'files', coalesce((select jsonb_agg(jsonb_build_object('path', f.path, 'content', f.content) order by f.path) from public.files f where f.project_id = p.id), '[]'::jsonb))
  from public.shares s join public.projects p on p.id = s.project_id
  where s.slug = p_slug and s.is_active and (s.expires_at is null or s.expires_at > now());
$$;
revoke execute on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;

create policy file_versions_delete_own on public.file_versions for delete to authenticated using (owner_id = (select auth.uid()));
create or replace function public.prune_file_versions(p_file_id uuid, p_keep int default 50) returns void language sql set search_path = '' as $$
  delete from public.file_versions
  where file_id = p_file_id and owner_id = (select auth.uid())
    and id not in (select id from public.file_versions where file_id = p_file_id and owner_id = (select auth.uid()) order by version desc limit greatest(p_keep, 5));
$$;
revoke execute on function public.prune_file_versions(uuid, int) from public, anon;
grant execute on function public.prune_file_versions(uuid, int) to authenticated;
