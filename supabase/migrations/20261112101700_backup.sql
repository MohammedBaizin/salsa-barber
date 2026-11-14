-- Backup and restore (spec §8.11). Admin only, through server code with the secret key.
--
-- restore_backup(tables, admin_user) puts a backup back in ONE transaction:
--   * refuses a backup whose tables or columns don't match this database ('backup_mismatch: …');
--   * empties and refills the tables in dependency order with the database's own triggers switched off for the
--     duration (so nothing is re-audited, audit flags and computed values stay exactly as backed up);
--   * never lowers the activity log's id sequence;
--   * skips photos whose files are gone, and unlinks staff from logins that no longer exist;
--   * keeps the restoring admin's account active (re-adding it if the backup predates it).
-- Returns the restored row counts. The caller logs the restore afterwards.

create or replace function public.restore_backup(p_tables jsonb, p_admin_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Dependency order (parents first). Kept in step with BACKUP_TABLES in src/lib/backup/tables.ts.
  restore_order constant text[] := array[
    'settings', 'services', 'staff', 'staff_services', 'time_off', 'closures', 'clients', 'bookings',
    'gallery_photos', 'reviews', 'audit_log'
  ];
  t text;
  live_cols text[];
  backup_cols text[];
  admin_row public.staff;
  counts jsonb := '{}'::jsonb;
  n int;
  seq text;
  max_id bigint;
begin
  if p_tables is null or jsonb_typeof(p_tables) <> 'object' then
    raise exception 'backup_mismatch: no tables' using errcode = 'P0001';
  end if;

  -- Same tables, same columns (order doesn't matter). A row's keys must all be real columns.
  foreach t in array restore_order loop
    if jsonb_typeof(p_tables -> t) is distinct from 'array' then
      raise exception 'backup_mismatch: table % is missing', t using errcode = 'P0001';
    end if;
    select array_agg(c.column_name::text order by c.column_name) into live_cols
    from information_schema.columns c where c.table_schema = 'public' and c.table_name = t;
    select array_agg(distinct k order by k) into backup_cols
    from jsonb_array_elements(p_tables -> t) r, jsonb_object_keys(r) k;
    if backup_cols is not null and backup_cols <> live_cols then
      raise exception 'backup_mismatch: columns of % differ', t using errcode = 'P0001';
    end if;
  end loop;

  select * into admin_row from public.staff s where s.user_id = p_admin_user;

  -- Everything below is one transaction: any error puts the database back as it was.
  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));
  foreach t in array restore_order loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  truncate public.settings, public.services, public.staff, public.staff_services, public.time_off, public.closures,
    public.clients, public.bookings, public.gallery_photos, public.reviews, public.audit_log;

  foreach t in array restore_order loop
    if t = 'staff' then
      -- Logins that no longer exist (the server re-creates deleted ones first; anything left is unlinked here,
      -- before the insert, because the link to the login is a foreign key).
      create temp table restore_staff on commit drop as
        select * from jsonb_populate_recordset(null::public.staff, p_tables -> 'staff');
      update restore_staff r set user_id = null
      where r.user_id is not null and not exists (select 1 from auth.users u where u.id = r.user_id);
      insert into public.staff select * from restore_staff;
    else
      execute format(
        'insert into public.%1$I overriding system value select * from jsonb_populate_recordset(null::public.%1$I, $1)',
        t
      ) using p_tables -> t;
    end if;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;

  -- Photos whose files are gone (deleted since the backup).
  delete from public.gallery_photos g
  where not exists (select 1 from storage.objects o where o.bucket_id = 'gallery' and o.name = g.path);
  update public.staff s set photo_path = null
  where s.photo_path is not null
    and not exists (select 1 from storage.objects o where o.bucket_id = 'team' and o.name = s.photo_path);
  update public.settings st set shop_photo_path = null
  where st.shop_photo_path is not null
    and not exists (select 1 from storage.objects o where o.bucket_id = 'gallery' and o.name = st.shop_photo_path);

  -- The admin doing the restore stays able to sign in.
  if admin_row.id is not null then
    if exists (select 1 from public.staff s where s.user_id = p_admin_user) then
      update public.staff s set active = true, deleted_at = null, role = 'admin', bookable = false, show_on_site = false
      where s.user_id = p_admin_user;
    elsif exists (select 1 from public.staff s where s.id = admin_row.id or s.username = admin_row.username) then
      update public.staff s set user_id = p_admin_user, active = true, deleted_at = null, role = 'admin', bookable = false, show_on_site = false
      where s.id = admin_row.id or s.username = admin_row.username;
    else
      insert into public.staff select (admin_row).*;
    end if;
  end if;

  -- Never lower the activity log's sequence.
  seq := pg_get_serial_sequence('public.audit_log', 'id');
  select max(a.id) into max_id from public.audit_log a;
  if max_id is not null then
    perform setval(seq, greatest(max_id, (select s.last_value from pg_sequences s where s.schemaname || '.' || s.sequencename = seq)));
  end if;

  foreach t in array restore_order loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  return counts;
end
$$;

revoke all on function public.restore_backup(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.restore_backup(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- log_backup_event(): downloads, restores and undos are logged under the admin, with their session.
-- ---------------------------------------------------------------------------
create or replace function public.log_backup_event(p_action text, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.my_staff_id();
begin
  if me is null or not app.is_admin() or p_action not in ('backup.download', 'backup.restore', 'backup.undo_restore') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, actor_name, action, entity, summary)
  values (me, app.staff_name(me), p_action, 'backup', left(p_summary, 200));
end
$$;

revoke all on function public.log_backup_event(text, text) from public, anon;
grant execute on function public.log_backup_event(text, text) to authenticated;
