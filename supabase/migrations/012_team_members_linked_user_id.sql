alter table if exists public.team_members
add column if not exists linked_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_team_members_linked_user_id
on public.team_members(linked_user_id);
