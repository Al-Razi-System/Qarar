create schema cron;
create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, nodename text default 'localhost', nodeport int default 5432, database text default current_database(), username text default current_user, active boolean default true, jobname text unique);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values ($1,$2,$3)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(job_name text) returns boolean language sql as $$ with d as (delete from cron.job where jobname = $1 returning 1) select exists(select 1 from d) $$;
create function cron.unschedule(job_id bigint) returns boolean language sql as $$ with d as (delete from cron.job where jobid = $1 returning 1) select exists(select 1 from d) $$;
