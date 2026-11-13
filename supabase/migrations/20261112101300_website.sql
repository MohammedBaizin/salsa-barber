-- Website content (spec §8.7): changing only the shop photo is logged as "website.shop_photo" (Added / Replaced /
-- Removed) under Website, not as a settings change. app.audit() is replaced as a whole; the only change is in the
-- settings case (last defined in the services migration).

create or replace function app.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := app.my_staff_id();
  entity text := tg_argv[0];
  o jsonb;
  n jsonb;
  r jsonb;
  changed text[];
  act text;
  summ text;
  eid text;
begin
  if actor is null then
    return null;
  end if;

  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  eid := r ->> 'id';

  if tg_op = 'UPDATE' then
    select array_agg(e.key order by e.key) into changed
    from jsonb_each(n) e
    where e.value is distinct from o -> e.key and e.key <> 'updated_at';
    if changed is null then
      return null;
    end if;
  end if;

  case entity
  when 'booking' then
    if tg_op = 'UPDATE' and changed <@ array['message_sent_at'] then
      return null; -- marking a message as sent isn't audited
    end if;
    if tg_op = 'INSERT' then
      act := case r ->> 'source' when 'walk_in' then 'booking.walk_in' when 'staff' then 'booking.phone' else 'booking.create' end;
    elsif tg_op = 'DELETE' then
      act := 'booking.delete';
    elsif 'status' = any (changed) then
      act := case
        when o ->> 'status' = 'pending' and n ->> 'status' = 'confirmed' then 'booking.accept'
        when n ->> 'status' = 'declined' then 'booking.decline'
        when n ->> 'status' = 'cancelled' then 'booking.cancel'
        when n ->> 'status' = 'completed' then 'booking.done'
        when n ->> 'status' = 'no_show' then 'booking.no_show'
        when n ->> 'status' = 'confirmed' then 'booking.undo'
        else 'booking.update'
      end;
    elsif 'staff_id' = any (changed) then
      act := 'booking.reassign';
    elsif 'starts_at' = any (changed) then
      act := 'booking.reschedule';
    elsif changed && array['service_id', 'price_pence', 'service_name'] then
      act := 'booking.service_change';
    else
      act := 'booking.update';
    end if;

    summ := app.booking_who(r) || ' · ' || (r ->> 'service_name') || ' · '
      || app.staff_name((r ->> 'staff_id')::uuid) || ' · ' || app.london_label((r ->> 'starts_at')::timestamptz);
    if act = 'booking.reschedule' then
      summ := summ || ' (was ' || app.london_label((o ->> 'starts_at')::timestamptz) || ')';
    elsif act = 'booking.reassign' then
      summ := summ || ' (was ' || app.staff_name((o ->> 'staff_id')::uuid) || ')';
    elsif act = 'booking.service_change' then
      summ := summ || ' (was ' || (o ->> 'service_name') || ' ' || app.pounds((o ->> 'price_pence')::int)
        || ', now ' || app.pounds((n ->> 'price_pence')::int) || ')';
    end if;

  when 'service' then
    act := case
      when tg_op = 'INSERT' then 'service.create'
      when tg_op = 'DELETE' then 'service.delete'
      when changed <@ array['sort'] then 'service.reorder'
      when 'active' = any (changed) and not (n ->> 'active')::boolean then 'service.disable'
      when 'active' = any (changed) then 'service.enable'
      else 'service.update'
    end;
    summ := (r ->> 'name') || ' · ' || app.pounds((r ->> 'price_pence')::int) || ' · ' || (r ->> 'duration_min') || ' min';

  when 'staff' then
    act := case
      when tg_op = 'INSERT' then 'staff.create'
      when tg_op = 'DELETE' then 'staff.delete'
      when 'deleted_at' = any (changed) then 'staff.delete'
      when 'role' = any (changed) then 'staff.role'
      when 'active' = any (changed) and not (n ->> 'active')::boolean then 'staff.switch_off'
      when 'active' = any (changed) then 'staff.switch_on'
      when changed <@ array['weekly_hours'] then 'staff.hours'
      else 'staff.update'
    end;
    summ := (r ->> 'display_name');
    if act = 'staff.role' then
      summ := summ || ' · ' || (o ->> 'role') || ' → ' || (n ->> 'role');
    end if;

  when 'staff_service' then
    act := case when tg_op = 'DELETE' then 'staff.service_remove' else 'staff.service_add' end;
    eid := r ->> 'staff_id';
    summ := app.staff_name((r ->> 'staff_id')::uuid) || ' · '
      || coalesce((select s.name from public.services s where s.id = (r ->> 'service_id')::uuid), 'service');

  when 'time_off' then
    act := 'time_off.' || lower(tg_op);
    summ := app.staff_name((r ->> 'staff_id')::uuid) || ' · '
      || to_char((r ->> 'starts_on')::date, 'Dy FMDD Mon') || ' – ' || to_char((r ->> 'ends_on')::date, 'Dy FMDD Mon YYYY');

  when 'closure' then
    act := 'closure.' || lower(tg_op);
    summ := to_char((r ->> 'closed_on')::date, 'Dy FMDD Mon YYYY') || coalesce(' · ' || nullif(r ->> 'reason', ''), '');

  when 'settings' then
    if changed <@ array['shop_photo_path'] then
      act := 'website.shop_photo';
      summ := case
        when n ->> 'shop_photo_path' is null then 'Removed'
        when o ->> 'shop_photo_path' is null then 'Added'
        else 'Replaced'
      end;
    else
      act := 'settings.update';
      summ := array_to_string(changed, ', ');
    end if;

  when 'client' then
    act := 'client.' || lower(tg_op);
    summ := r ->> 'name';
    if tg_op = 'UPDATE' and 'name' = any (changed) then
      summ := (o ->> 'name') || ' → ' || (n ->> 'name');
    end if;

  when 'photo' then
    act := case
      when tg_op = 'UPDATE' and changed <@ array['sort'] then 'photo.reorder'
      else 'photo.' || lower(tg_op)
    end;
    summ := (r ->> 'alt') || ' · ' || case when (r ->> 'in_hero')::boolean then 'Slideshow' else 'Recent cuts' end;

  when 'review' then
    act := case
      when tg_op = 'UPDATE' and changed <@ array['sort'] then 'review.reorder'
      else 'review.' || lower(tg_op)
    end;
    summ := (r ->> 'author_name') || ' · ' || (r ->> 'stars') || '★';

  else
    act := entity || '.' || lower(tg_op);
    summ := null;
  end case;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, changed)
  values (actor, app.staff_name(actor), act, entity, eid, left(summ, 200), changed);
  return null;
end
$$;
