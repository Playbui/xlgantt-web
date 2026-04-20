alter table public.tasks
  add column if not exists task_body text;

update public.tasks
set task_body = remarks
where task_body is null
  and remarks is not null
  and btrim(remarks) <> '';
