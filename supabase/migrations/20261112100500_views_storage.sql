-- Views and storage buckets.

-- ---------------------------------------------------------------------------
-- public_team: anon-safe team list for the website and booking flow.
-- security_invoker: RLS on staff decides the rows (staff_public_read: active, not deleted,
-- not admin, on the site or taking bookings). Only anon-granted columns: no usernames, roles or hours.
-- ---------------------------------------------------------------------------
create view public.public_team
with (security_invoker = true) as
select s.id, s.display_name, s.title, s.bio, s.photo_path, s.bookable, s.show_on_site, s.sort
from public.staff s;

grant select on public.public_team to anon, service_role;

-- ---------------------------------------------------------------------------
-- client_stats: derived from bookings (labels like Regular / New / Due back are computed in TypeScript).
-- security_invoker: barbers only count their own bookings, so they see their own visits and spend.
-- ---------------------------------------------------------------------------
create view public.client_stats
with (security_invoker = true) as
select
  c.id as client_id,
  (count(b.id) filter (where b.status = 'completed'))::int as visits,
  coalesce(sum(b.price_pence) filter (where b.status = 'completed'), 0)::int as spent_pence,
  (count(b.id) filter (where b.status = 'no_show'))::int as no_shows,
  max(b.starts_at) filter (where b.status = 'completed') as last_visit,
  min(b.starts_at) filter (where b.status in ('pending', 'confirmed') and b.starts_at > now()) as next_visit,
  mode() within group (order by b.service_id) filter (where b.status = 'completed') as usual_service_id,
  mode() within group (order by b.service_name) filter (where b.status = 'completed') as usual_service_name,
  mode() within group (order by b.staff_id) filter (where b.status = 'completed') as usual_staff_id,
  -- usual start time (London wall clock, minutes after midnight) for "Book again"
  mode() within group (
    order by (extract(hour from app.london(b.starts_at)) * 60 + extract(minute from app.london(b.starts_at)))::int
  ) filter (where b.status = 'completed') as usual_start_minute
from public.clients c
left join public.bookings b on b.client_id = c.id
group by c.id;

grant select on public.client_stats to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: public `gallery` (photos/, shop/) and `team` buckets, WebP only, ≤ 2 MB, managers write.
-- Private `restore-snapshots` bucket: no policies, secret key only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery', 'gallery', true, 2097152, array['image/webp']),
  ('team', 'team', true, 2097152, array['image/webp']),
  ('restore-snapshots', 'restore-snapshots', false, null, null)
on conflict (id) do nothing;

create policy "site photos: managers read" on storage.objects for select to authenticated
  using (bucket_id in ('gallery', 'team') and app.is_manager());
create policy "site photos: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('gallery', 'team') and app.is_manager());
create policy "site photos: managers replace" on storage.objects for update to authenticated
  using (bucket_id in ('gallery', 'team') and app.is_manager())
  with check (bucket_id in ('gallery', 'team') and app.is_manager());
create policy "site photos: managers delete" on storage.objects for delete to authenticated
  using (bucket_id in ('gallery', 'team') and app.is_manager());
