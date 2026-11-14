-- Online booking switch, controlled from Dashboard → Settings (was the NEXT_PUBLIC_BOOKING_ENABLED build flag).
-- When off, /book shows "call us / WhatsApp", and the availability API and booking action refuse.

alter table public.settings
  add column online_booking boolean not null default true;

comment on column public.settings.online_booking is 'Customers can book on the website. Off: /book asks them to call or WhatsApp.';

grant update (online_booking) on public.settings to authenticated;
