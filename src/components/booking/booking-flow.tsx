"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, MessageCircle, Phone, Users } from "lucide-react";
import { requestBooking, type RequestState } from "@/app/(public)/book/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BookingBarber, BookingService } from "@/lib/booking/options";
import { safely } from "@/lib/connection";
import { groupByPartOfDay } from "@/lib/domain/availability";
import { formatPence } from "@/lib/domain/money";
import { initials } from "@/lib/domain/team";
import { formatDay, formatDays, formatDayLong, formatMinutes, formatRelativeDay, formatTime } from "@/lib/domain/time";
import { useLondonToday } from "@/lib/use-london-today";
import { cn } from "@/lib/utils";

type Step = "service" | "barber" | "time" | "details";
const STEPS: Step[] = ["service", "barber", "time", "details"];
const STEP_TITLES: Record<Step, string> = {
  service: "Choose a service",
  barber: "Choose a barber",
  time: "Pick a day and time",
  details: "Your details",
};
/** Codes that mean "pick another time": go back to the times with a fresh list. */
const RETIME_CODES = new Set(["slot_taken", "too_soon", "too_far", "shop_closed", "service_day", "outside_hours", "barber_unavailable", "invalid_time"]);

type Day = { date: string; times: string[] };
type Availability = { key: string; status: "ready" | "error"; days: Day[] };

export type BookingFlowProps = {
  services: BookingService[];
  barbers: BookingBarber[];
  shop: { phoneDisplay: string; phoneE164: string; whatsappE164: string | null };
  /** Manage token when the customer is changing an existing booking. */
  replaces?: string | null;
  initialName?: string;
  initialPhone?: string;
};

const requestSafely = safely(requestBooking);
const INITIAL: RequestState = { error: null, code: null, fields: {}, token: null, attempt: 0 };

/**
 * Booking flow: Service → Barber (or any) → Date & time → Name & mobile → request sent.
 * The step, service and barber live in the URL (?service=&barber=&step=), so Back works and links can preselect.
 * Choosing an option moves on; focus moves to each step's heading. All times are London time.
 */
export function BookingFlow({ services, barbers, shop, replaces = null, initialName = "", initialPhone = "" }: BookingFlowProps) {
  const params = useSearchParams();
  const service = services.find((s) => s.id === params.get("service")) ?? null;
  const rawBarber = params.get("barber");
  const eligible = useMemo(() => (service ? barbers.filter((b) => b.serviceIds.includes(service.id)) : []), [service, barbers]);
  // Before a service is chosen, any real barber counts (from "Book with …"); after, only those who offer it.
  const barber =
    rawBarber === "any" ? "any" : ((service ? eligible : barbers).find((b) => b.id === rawBarber)?.id ?? null);

  const [start, setStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  // Last picks, so going Back to an earlier step still shows what was chosen.
  const [picked, setPicked] = useState<{ service: string | null; barber: string | null }>({ service: null, barber: null });
  const [availability, setAvailability] = useState<Availability | null>(null);
  const pushes = useRef(0);

  // Work out the step from the URL, never skipping a step that still needs an answer.
  const asked = (params.get("step") as Step | null) ?? (service ? (barber ? "time" : "barber") : "service");
  const step: Step = !service ? "service" : !barber && asked !== "service" ? "barber" : asked === "details" && !start ? "time" : asked;
  const stepIndex = STEPS.indexOf(step);

  const navigate = (next: { step: Step; service?: string | null; barber?: string | null }, replace = false) => {
    const q = new URLSearchParams();
    const s = next.service === undefined ? service?.id : next.service;
    const b = next.barber === undefined ? barber : next.barber;
    if (s) q.set("service", s);
    if (b) q.set("barber", b);
    q.set("step", next.step);
    if (replaces) q.set("change", replaces);
    const url = `${window.location.pathname}?${q.toString()}`;
    if (replace) window.history.replaceState(null, "", url);
    else {
      pushes.current += 1;
      window.history.pushState(null, "", url);
    }
  };
  const back = () => {
    if (pushes.current > 0) {
      pushes.current -= 1;
      window.history.back();
    } else {
      navigate({ step: STEPS[Math.max(0, stepIndex - 1)] }, true);
    }
  };

  // Focus the heading when the step changes (not on first load).
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(step);
  useEffect(() => {
    if (step !== firstStep.current) {
      firstStep.current = "" as Step;
      heading.current?.focus();
    }
  }, [step]);

  // Free times for this service + barber.
  const availabilityKey = service && barber ? `${service.id}|${barber}|${refresh}` : null;
  useEffect(() => {
    if (!availabilityKey || !service) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ service: service.id });
    if (barber && barber !== "any") q.set("barber", barber);
    if (replaces) q.set("change", replaces);
    fetch(`/api/availability?${q}`, { signal: controller.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { days: Day[] }) => setAvailability({ key: availabilityKey, status: "ready", days: json.days }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setAvailability({ key: availabilityKey, status: "error", days: [] });
      });
    return () => controller.abort();
  }, [availabilityKey, service, barber, replaces]);
  const current = availability?.key === availabilityKey ? availability : null;
  const days = current?.days ?? [];
  const firstOpenDay = days.find((d) => d.times.length > 0)?.date ?? null;
  const day = days.find((d) => d.date === selectedDate && d.times.length > 0) ?? days.find((d) => d.date === firstOpenDay) ?? null;

  const [state, formAction, pending] = useActionState<RequestState, FormData>(async (prev, formData) => {
    const result = await requestSafely(prev, formData);
    if (result.code && RETIME_CODES.has(result.code)) {
      setNotice(result.error);
      setStart(null);
      setRefresh((n) => n + 1);
      navigate({ step: "time" }, true);
    }
    return result;
  }, INITIAL);

  // Request sent: full page load of the customer's private page (the flow never reopens with stale state).
  useEffect(() => {
    // A full page load on purpose (spec §4.3): Back can't reopen the flow with stale state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (state.token) window.location.assign(`/booking/${state.token}`);
  }, [state.token]);

  const today = useLondonToday();
  const barberName = barber === "any" ? "Any barber" : (barbers.find((b) => b.id === barber)?.name ?? null);
  const startDate = start ? new Date(start) : null;
  const showDetailsError = step === "details" && state.error && !(state.code && RETIME_CODES.has(state.code));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">
        <div className="mb-6 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-3 font-semibold hover:bg-muted">
              <ArrowLeft aria-hidden className="size-5" />
              Back
            </button>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
        <div aria-hidden className="mb-8 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="pole-stripe h-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>

        <h2 ref={heading} tabIndex={-1} className="text-h2 font-extrabold outline-none" data-testid="step-heading">
          {STEP_TITLES[step]}
        </h2>

        {step === "service" && (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    const keep = barber && (barber === "any" || barbers.find((b) => b.id === barber)?.serviceIds.includes(s.id));
                    setStart(null);
                    setPicked((p) => ({ ...p, service: s.id }));
                    navigate({ step: keep ? "time" : "barber", service: s.id, barber: keep ? barber : null });
                  }}
                  aria-pressed={(service?.id ?? picked.service) === s.id}
                  className={cn(
                    "flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:border-foreground",
                    (service?.id ?? picked.service) === s.id && "border-2 border-foreground",
                  )}
                >
                  <span>
                    <span className="block font-semibold">{s.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatMinutes(s.durationMin)}
                      {s.bookableDays && <> · {formatDays(s.bookableDays)} only</>}
                    </span>
                  </span>
                  <span className="price text-price">{formatPence(s.pricePence)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === "barber" && service && (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[{ id: "any", name: "Any barber", title: "First one free", photo: null as BookingBarber["photo"] }, ...eligible].map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setStart(null);
                    setPicked((p) => ({ ...p, barber: b.id }));
                    navigate({ step: "time", barber: b.id });
                  }}
                  aria-pressed={(barber ?? picked.barber) === b.id}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left hover:border-foreground",
                    (barber ?? picked.barber) === b.id && "border-2 border-foreground",
                  )}
                >
                  {b.id === "any" ? (
                    <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <Users className="size-6" />
                    </span>
                  ) : b.photo ? (
                    <Image src={b.photo.url} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-full bg-highlight font-heading text-lg font-extrabold text-highlight-foreground">
                      {initials(b.name)}
                    </span>
                  )}
                  <span>
                    <span className="block font-semibold">{b.name}</span>
                    {b.title && <span className="text-sm text-muted-foreground">{b.title}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === "time" && service && barber && (
          <div className="mt-6">
            {notice && (
              <p role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 font-medium text-destructive">
                {notice}
              </p>
            )}
            <div className="mb-6 max-w-xs space-y-2">
              <Label htmlFor="barber-switch">Barber</Label>
              <NativeSelect
                id="barber-switch"
                className="w-full"
                value={barber}
                onChange={(e) => {
                  setStart(null);
                  navigate({ step: "time", barber: e.target.value }, true);
                }}
              >
                <NativeSelectOption value="any">Any barber</NativeSelectOption>
                {eligible.map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {b.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            {!current ? (
              <p className="py-10 text-muted-foreground" role="status">
                Finding free times…
              </p>
            ) : current.status === "error" ? (
              <p role="alert" className="rounded-lg bg-muted px-4 py-3">
                Couldn&apos;t load free times. Check your connection and{" "}
                <button type="button" className="font-semibold underline" onClick={() => setRefresh((n) => n + 1)}>
                  try again
                </button>
                .
              </p>
            ) : !firstOpenDay ? (
              <div className="rounded-2xl border bg-card p-6" data-testid="no-times">
                <h3 className="text-h3 font-bold">No free times online</h3>
                <p className="mt-2 text-muted-foreground">
                  {barber === "any" ? "We're fully booked online for now." : `${barberName} has no free times online for now.`} Message or call us and
                  we&apos;ll try to fit you in.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {shop.whatsappE164 && (
                    <a href={`https://wa.me/${shop.whatsappE164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "pop" }))}>
                      <MessageCircle aria-hidden />
                      WhatsApp
                    </a>
                  )}
                  <a href={`tel:${shop.phoneE164}`} className={cn(buttonVariants({ variant: "outline" }))}>
                    <Phone aria-hidden />
                    Call {shop.phoneDisplay}
                  </a>
                </div>
              </div>
            ) : (
              <>
                <ul aria-label="Days" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" data-testid="day-strip">
                  {days.map((d) => {
                    const disabled = d.times.length === 0;
                    const selected = day?.date === d.date;
                    return (
                      <li key={d.date} className="snap-start">
                        <button
                          type="button"
                          disabled={disabled}
                          aria-pressed={selected}
                          onClick={() => setSelectedDate(d.date)}
                          className={cn(
                            "relative flex min-h-16 w-16 flex-col items-center justify-center rounded-xl border text-sm",
                            selected ? "border-2 border-shadow-hard bg-primary font-bold text-primary-foreground" : "bg-card hover:border-foreground",
                            disabled && "cursor-not-allowed bg-transparent text-muted-foreground line-through opacity-60 hover:border-border",
                          )}
                        >
                          <span>{today && formatRelativeDay(d.date, today) === "Today" ? "Today" : formatDay(d.date).split(" ")[0]}</span>
                          <span className="font-heading text-lg font-bold">{Number(d.date.slice(8))}</span>
                          <span className="sr-only">
                            {` ${formatDay(d.date).split(" ")[2]}, ${disabled ? "no free times" : `${d.times.length} free times`}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {day && (
                  <div className="mt-4 space-y-6" data-testid="times">
                    <p className="font-semibold">{formatDayLong(day.date)}</p>
                    {(Object.entries(groupByPartOfDay(day.times.map((t) => ({ start: new Date(t), iso: t })))) as [string, { start: Date; iso: string }[]][])
                      .filter(([, list]) => list.length > 0)
                      .map(([part, list]) => (
                        <div key={part}>
                          <h3 className="text-label font-semibold tracking-[0.14em] text-muted-foreground uppercase">{part}</h3>
                          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                            {list.map((t) => (
                              <li key={t.iso}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStart(t.iso);
                                    setNotice(null);
                                    navigate({ step: "details" });
                                  }}
                                  aria-pressed={start === t.iso}
                                  className={cn(
                                    "min-h-11 w-full rounded-lg border bg-card px-2 font-semibold tabular-nums hover:border-foreground",
                                    start === t.iso && "border-2 border-shadow-hard bg-primary text-primary-foreground",
                                  )}
                                >
                                  {formatTime(t.start)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === "details" && service && barber && start && (
          <form action={formAction} className="mt-6 max-w-md space-y-5" noValidate>
            <input type="hidden" name="serviceId" value={service.id} />
            <input type="hidden" name="barberId" value={barber === "any" ? "" : barber} />
            <input type="hidden" name="start" value={start} />
            {replaces && <input type="hidden" name="replaces" value={replaces} />}
            {/* Honeypot: hidden from people, filled by bots. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

            {showDetailsError && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 font-medium text-destructive">
                {state.error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{replaces ? "Name" : "Your name"}</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
                aria-invalid={state.fields.name ? true : undefined}
                aria-describedby={state.fields.name ? "name-error" : undefined}
              />
              {state.fields.name && (
                <p id="name-error" role="alert" className="text-sm font-medium text-destructive">
                  {state.fields.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="07123 456789"
                required
                aria-invalid={state.fields.phone ? true : undefined}
                aria-describedby={state.fields.phone ? "phone-error phone-hint" : "phone-hint"}
              />
              <p id="phone-hint" className="text-sm text-muted-foreground">
                We&apos;ll confirm by WhatsApp or text. UK mobiles only.
              </p>
              {state.fields.phone && (
                <p id="phone-error" role="alert" className="text-sm font-medium text-destructive">
                  {state.fields.phone}
                </p>
              )}
            </div>
            <Button type="submit" variant="pop" size="lg" className="w-full sm:w-auto" disabled={pending || Boolean(state.token)}>
              {pending || state.token ? "Sending…" : replaces ? "Send change request" : "Send booking request"}
            </Button>
            <p className="text-sm text-muted-foreground">Your booking isn&apos;t confirmed until the shop replies.</p>
          </form>
        )}
      </div>

      {service && (
        <aside aria-label="Your booking" className="rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="font-heading text-lg font-bold">Your booking</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <SummaryRow label="Service" onChange={step !== "service" ? () => navigate({ step: "service" }) : undefined}>
              {service.name} · {formatPence(service.pricePence)} · {formatMinutes(service.durationMin)}
            </SummaryRow>
            {barberName && (
              <SummaryRow label="Barber" onChange={step !== "barber" ? () => navigate({ step: "barber" }) : undefined}>
                {barberName}
              </SummaryRow>
            )}
            {startDate && (
              <SummaryRow label="Time" onChange={step !== "time" ? () => navigate({ step: "time" }) : undefined}>
                {formatDay(startDate)}, {formatTime(startDate)}
              </SummaryRow>
            )}
          </dl>
        </aside>
      )}
    </div>
  );
}

function SummaryRow({ label, children, onChange }: { label: string; children: React.ReactNode; onChange?: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-start-1 mt-0.5 flex items-center gap-1.5 font-semibold">
        <Check aria-hidden className="size-4 shrink-0 text-status-done-foreground" />
        {children}
      </dd>
      {onChange && (
        <dd className="col-start-2 row-span-2 row-start-1">
          <button type="button" onClick={onChange} className="min-h-11 px-2 font-semibold text-link underline underline-offset-4 hover:no-underline">
            Change<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        </dd>
      )}
    </div>
  );
}
