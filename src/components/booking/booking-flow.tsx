"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, MessageCircle, Moon, Phone, ShieldCheck, Sparkles, Sun, Sunrise, Zap } from "lucide-react";
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
import { dateKey, formatDay, formatDays, formatDayLong, formatMinutes, formatRelativeDay, formatTime } from "@/lib/domain/time";
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
const STEP_SHORT: Record<Step, string> = { service: "Service", barber: "Barber", time: "Time", details: "Details" };
const STEP_HINTS: Record<Step, string> = {
  service: "Tap a service to start. You pay in the shop.",
  barber: "Pick someone you know, or any barber for the earliest time.",
  time: "Pick a day, then a time. All times are UK time.",
  details: "Just your name and mobile. We'll message you to confirm.",
};
const PART_ICONS = { morning: Sunrise, afternoon: Sun, evening: Moon } as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-11-15" -> "November 2026". */
const formatMonth = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

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
  /** Label for the name field ("Who is this for?" when booking for someone else). */
  nameLabel?: string;
  /** Extra URL parameters kept on every step (e.g. ?for= so a reload still fills the details in). */
  carry?: Record<string, string>;
};

const requestSafely = safely(requestBooking);
const INITIAL: RequestState = { error: null, code: null, fields: {}, token: null, attempt: 0 };

/** Card style shared by the service and barber choices. */
const choiceCard =
  "group flex h-full min-h-20 w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-[var(--shadow-soft)] sm:p-5";

/**
 * Booking flow: Service → Barber (or any) → Date & time → Name & mobile → request sent.
 * The step, service and barber live in the URL (?service=&barber=&step=), so Back works and links can preselect.
 * Choosing an option moves on; focus moves to each step's heading. All times are London time.
 */
export function BookingFlow({ services, barbers, shop, replaces = null, initialName = "", initialPhone = "", nameLabel, carry }: BookingFlowProps) {
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
    for (const [k, v] of Object.entries(carry ?? {})) q.set(k, v);
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
  const earliest = days.find((d) => d.times.length > 0)?.times[0] ?? null;
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
  const monthLabel = day ? formatMonth(day.date) : null;

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-8 lg:items-start lg:gap-10", service && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
      <div className="min-w-0">
        <div className="mb-8 flex items-center gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={back}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card pr-4 pl-3 text-sm font-semibold transition-colors hover:border-foreground/40"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </button>
          ) : null}
          <ol className="flex min-w-0 flex-1 items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5 last:flex-none" aria-current={i === stepIndex ? "step" : undefined}>
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300",
                    i < stepIndex && "bg-foreground text-background",
                    i === stepIndex && "bg-primary text-primary-foreground shadow-pop-sm",
                    i > stepIndex && "border border-border text-muted-foreground",
                  )}
                >
                  {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span aria-hidden className={cn("hidden truncate text-sm font-semibold md:block", i === stepIndex ? "text-foreground" : "text-muted-foreground")}>
                  {STEP_SHORT[s]}
                </span>
                <span className="sr-only">{STEP_SHORT[s]}</span>
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-border">
                    <span className={cn("block h-full bg-foreground transition-[width] duration-500", i < stepIndex ? "w-full" : "w-0")} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <h2 ref={heading} tabIndex={-1} className="text-title font-extrabold outline-none" data-testid="step-heading">
          {STEP_TITLES[step]}
        </h2>
        <p className="mt-2 text-muted-foreground">{STEP_HINTS[step]}</p>

        {step === "service" && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => {
              const selected = (service?.id ?? picked.service) === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const keep = barber && (barber === "any" || barbers.find((b) => b.id === barber)?.serviceIds.includes(s.id));
                      setStart(null);
                      setPicked((p) => ({ ...p, service: s.id }));
                      navigate({ step: keep ? "time" : "barber", service: s.id, barber: keep ? barber : null });
                    }}
                    aria-pressed={selected}
                    className={cn(choiceCard, "justify-between", selected && "border-primary ring-2 ring-primary")}
                  >
                    <span className="min-w-0">
                      <span className="block font-heading text-lg leading-tight font-bold tracking-tight">{s.name}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                          <Clock aria-hidden className="size-3" />
                          {formatMinutes(s.durationMin)}
                        </span>
                        {s.bookableDays && <span className="rounded-full bg-muted px-2 py-0.5">{formatDays(s.bookableDays)} only</span>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="price text-price">{formatPence(s.pricePence)}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-full border border-border transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        <ArrowRight className="size-4" />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {step === "barber" && service && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {[{ id: "any", name: "Any barber", title: "Quickest: first one free", photo: null as BookingBarber["photo"] }, ...eligible].map((b) => {
              const selected = (barber ?? picked.barber) === b.id;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setStart(null);
                      setPicked((p) => ({ ...p, barber: b.id }));
                      navigate({ step: "time", barber: b.id });
                    }}
                    aria-pressed={selected}
                    className={cn(choiceCard, selected && "border-primary ring-2 ring-primary")}
                  >
                    {b.id === "any" ? (
                      <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop-sm">
                        <Sparkles className="size-6" />
                      </span>
                    ) : b.photo ? (
                      <Image src={b.photo.url} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover ring-2 ring-border" />
                    ) : (
                      <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-lg font-extrabold text-secondary-foreground">
                        {initials(b.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-lg leading-tight font-bold tracking-tight">{b.name}</span>
                      {b.title && <span className="mt-0.5 block text-sm text-muted-foreground">{b.title}</span>}
                    </span>
                    <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {step === "time" && service && barber && (
          <div className="mt-8">
            {notice && (
              <p role="alert" className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 font-medium text-destructive">
                {notice}
              </p>
            )}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div className="w-full max-w-xs space-y-2">
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
              {monthLabel && <p className="eyebrow">{monthLabel}</p>}
            </div>

            {!current ? (
              <div role="status" className="space-y-4">
                <span className="sr-only">Finding free times…</span>
                <div aria-hidden className="flex gap-2 overflow-hidden">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="h-[4.5rem] w-14 shrink-0 animate-pulse rounded-2xl bg-muted" />
                  ))}
                </div>
                <div aria-hidden className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span key={i} className="h-10 animate-pulse rounded-full bg-muted" />
                  ))}
                </div>
              </div>
            ) : current.status === "error" ? (
              <p role="alert" className="rounded-2xl bg-muted px-4 py-3">
                Couldn&apos;t load free times. Check your connection and{" "}
                <button type="button" className="font-semibold underline" onClick={() => setRefresh((n) => n + 1)}>
                  try again
                </button>
                .
              </p>
            ) : !firstOpenDay ? (
              <div className="rounded-3xl border bg-card p-6" data-testid="no-times">
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
                {earliest && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(firstOpenDay);
                      setStart(earliest);
                      setNotice(null);
                      navigate({ step: "details" });
                    }}
                    className="group mb-5 flex w-full items-center gap-4 rounded-2xl border border-primary/50 bg-primary/10 p-4 text-left transition-colors hover:border-primary hover:bg-primary/15"
                  >
                    <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Zap className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-muted-foreground">Earliest free time</span>
                      <span className="block font-heading text-lg font-bold tracking-tight">
                        {today ? formatRelativeDay(dateKey(new Date(earliest)), today) : formatDay(new Date(earliest))},{" "}
                        {formatTime(new Date(earliest))}
                      </span>
                    </span>
                    <span className="hidden text-sm font-semibold sm:block">Take it</span>
                    <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
                <ul
                  aria-label="Days"
                  className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-0"
                  data-testid="day-strip"
                >
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
                            "relative flex h-[4.5rem] w-14 flex-col items-center justify-center gap-0.5 rounded-2xl border text-xs font-semibold transition-all duration-200",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-pop-sm"
                              : "bg-card hover:-translate-y-0.5 hover:border-foreground/40",
                            disabled && "cursor-not-allowed border-dashed bg-transparent text-muted-foreground opacity-60 hover:translate-y-0 hover:border-border",
                          )}
                        >
                          <span>{today && formatRelativeDay(d.date, today) === "Today" ? "Today" : formatDay(d.date).split(" ")[0]}</span>
                          <span className="font-heading text-xl leading-none font-extrabold">{Number(d.date.slice(8))}</span>
                          <span
                            aria-hidden
                            className={cn("mt-0.5 size-1 rounded-full", disabled ? "bg-transparent" : selected ? "bg-primary-foreground" : "bg-status-done-foreground")}
                          />
                          <span className="sr-only">
                            {` ${formatDay(d.date).split(" ")[2]}, ${disabled ? "no free times" : `${d.times.length} free times`}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {day && (
                  <div className="mt-4 rounded-3xl border bg-card p-4 sm:p-6" data-testid="times">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-heading text-lg font-bold">{formatDayLong(day.date)}</span>
                      <span className="text-sm text-muted-foreground">{day.times.length} free</span>
                    </p>
                    <div className="mt-4 space-y-5">
                      {(Object.entries(groupByPartOfDay(day.times.map((t) => ({ start: new Date(t), iso: t })))) as [keyof typeof PART_ICONS, { start: Date; iso: string }[]][])
                        .filter(([, list]) => list.length > 0)
                        .map(([part, list]) => {
                          const Icon = PART_ICONS[part];
                          return (
                            <div key={part}>
                              <h3 className="flex items-center gap-2 text-label font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                                <Icon aria-hidden className="size-4" />
                                {part}
                              </h3>
                              <ul className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-5 xl:grid-cols-6">
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
                                        "h-10 w-full rounded-full border bg-background px-1 text-sm font-semibold tabular-nums transition-colors duration-150 hover:border-foreground/50 hover:bg-muted",
                                        start === t.iso && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                                      )}
                                    >
                                      {formatTime(t.start)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === "details" && service && barber && start && (
          <form action={formAction} className="mt-8 max-w-lg space-y-5 rounded-3xl border bg-card p-5 sm:p-7" noValidate>
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
              <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 font-medium text-destructive">
                {state.error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{nameLabel ?? (replaces ? "Name" : "Your name")}</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
                className="h-12 rounded-xl text-base"
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
                className="h-12 rounded-xl text-base tabular-nums"
                aria-invalid={state.fields.phone ? true : undefined}
                aria-describedby={state.fields.phone ? "phone-error phone-hint" : "phone-hint"}
              />
              <p id="phone-hint" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageCircle aria-hidden className="size-4 shrink-0" />
                We&apos;ll confirm by WhatsApp or text. UK mobiles only.
              </p>
              {state.fields.phone && (
                <p id="phone-error" role="alert" className="text-sm font-medium text-destructive">
                  {state.fields.phone}
                </p>
              )}
            </div>
            <Button type="submit" variant="pop" size="lg" className="w-full" disabled={pending || Boolean(state.token)}>
              {pending || state.token ? "Sending…" : replaces ? "Send change request" : "Send booking request"}
            </Button>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              Your booking isn&apos;t confirmed until the shop replies. Nothing to pay now.
            </p>
          </form>
        )}
      </div>

      {service && (
        <aside aria-label="Your booking" className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-soft)] lg:sticky lg:top-28">
          <div className="dark relative overflow-hidden bg-background px-6 py-5 text-foreground">
            <div aria-hidden className="glow-spot absolute -top-16 -right-16 size-48" />
            <h2 className="relative font-heading text-lg font-bold">Your booking</h2>
            <p className="relative mt-0.5 text-sm text-muted-foreground">Request · confirmed by the shop</p>
          </div>
          <dl className="space-y-4 p-6 text-sm">
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
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <dt className="font-semibold">Pay in the shop</dt>
              <dd className="price text-price">{formatPence(service.pricePence)}</dd>
            </div>
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
          <button type="button" onClick={onChange} className="min-h-11 rounded-full px-3 text-sm font-semibold text-link transition-colors hover:bg-muted">
            Change<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        </dd>
      )}
    </div>
  );
}
