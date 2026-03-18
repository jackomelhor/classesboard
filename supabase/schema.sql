create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  school_name text,
  type text not null check (type in ('individual', 'grupo', 'turma')) default 'grupo',
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  subject text,
  task_type text not null check (task_type in ('prova', 'trabalho', 'atividade', 'apresentacao', 'estudo')) default 'atividade',
  due_date date not null,
  priority text not null check (priority in ('baixa', 'media', 'alta')) default 'media',
  status text not null check (status in ('pendente', 'andamento', 'concluido')) default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  text text not null,
  is_done boolean not null default false,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_tasks_workspace on public.tasks(workspace_id);
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_task_checklist_task on public.task_checklist_items(task_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ensure_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id)
  do update set role = 'owner';
  return new;
end;
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = auth.uid()
  );
$$;

create or replace function public.join_workspace_by_code(invite text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select id
  into target_workspace_id
  from public.workspaces
  where upper(invite_code) = upper(invite)
  limit 1;

  if target_workspace_id is null then
    raise exception 'Código de convite inválido.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, auth.uid(), 'member')
  on conflict (workspace_id, user_id) do nothing;

  return target_workspace_id;
end;
$$;

create or replace function public.regenerate_workspace_code(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Sem permissão para regenerar o código.';
  end if;

  new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  update public.workspaces
  set invite_code = new_code
  where id = p_workspace_id;

  return new_code;
end;
$$;

create or replace function public.transfer_workspace_owner(p_workspace_id uuid, p_new_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Apenas o owner atual pode transferir ownership.';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner_user_id
  ) then
    raise exception 'O novo owner precisa ser membro do workspace.';
  end if;

  update public.workspaces
  set owner_id = p_new_owner_user_id
  where id = p_workspace_id;

  update public.workspace_members
  set role = 'admin'
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
    and role = 'owner';

  update public.workspace_members
  set role = 'owner'
  where workspace_id = p_workspace_id
    and user_id = p_new_owner_user_id;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_ensure_owner_membership on public.workspaces;
create trigger trg_ensure_owner_membership
after insert on public.workspaces
for each row execute function public.ensure_owner_membership();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;

-- Profiles
create policy "profiles_select_self"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Workspaces
create policy "workspaces_select_for_members"
on public.workspaces
for select
using (public.is_workspace_member(id));

create policy "workspaces_insert_owner"
on public.workspaces
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "workspaces_update_admin"
on public.workspaces
for update
to authenticated
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

create policy "workspaces_delete_owner"
on public.workspaces
for delete
to authenticated
using (public.is_workspace_owner(id));

-- Workspace members
create policy "workspace_members_select_for_members"
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_insert_by_admin"
on public.workspace_members
for insert
to authenticated
with check (public.is_workspace_admin(workspace_id));

create policy "workspace_members_update_non_owner_by_admin"
on public.workspace_members
for update
to authenticated
using (public.is_workspace_admin(workspace_id) and role <> 'owner')
with check (public.is_workspace_admin(workspace_id) and role in ('admin', 'member'));

create policy "workspace_members_delete_non_owner_by_admin"
on public.workspace_members
for delete
to authenticated
using (public.is_workspace_admin(workspace_id) and role <> 'owner');

-- Tasks
create policy "tasks_select_for_members"
on public.tasks
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "tasks_insert_for_members"
on public.tasks
for insert
to authenticated
with check (public.is_workspace_member(workspace_id) and author_id = auth.uid());

create policy "tasks_update_by_author_or_admin"
on public.tasks
for update
to authenticated
using (author_id = auth.uid() or public.is_workspace_admin(workspace_id))
with check (author_id = auth.uid() or public.is_workspace_admin(workspace_id));

create policy "tasks_delete_by_author_or_admin"
on public.tasks
for delete
to authenticated
using (author_id = auth.uid() or public.is_workspace_admin(workspace_id));

-- Checklist items
create policy "checklist_select_for_members"
on public.task_checklist_items
for select
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.is_workspace_member(t.workspace_id)
  )
);

create policy "checklist_insert_by_author_or_admin"
on public.task_checklist_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and (t.author_id = auth.uid() or public.is_workspace_admin(t.workspace_id))
  )
);

create policy "checklist_update_by_author_or_admin"
on public.task_checklist_items
for update
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and (t.author_id = auth.uid() or public.is_workspace_admin(t.workspace_id))
  )
)
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and (t.author_id = auth.uid() or public.is_workspace_admin(t.workspace_id))
  )
);

create policy "checklist_delete_by_author_or_admin"
on public.task_checklist_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and (t.author_id = auth.uid() or public.is_workspace_admin(t.workspace_id))
  )
);
