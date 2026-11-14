"use client";

import { startTransition, useId, useOptimistic, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, ImageUp, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  addPhoto, deletePhoto, deleteReview, removeShopPhoto, reorderPhotos, reorderReviews, replacePhoto, saveReview, saveShopPhoto,
  setPhotoVisible, updatePhoto,
} from "@/app/(staff)/dashboard/website/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dateKey, formatDay } from "@/lib/domain/time";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/domain/validation";
import { addsHiddenNote, PHOTO_LIMITS, PHOTO_SET_LABELS, PHOTO_SETS, photoMeter, type PhotoSet } from "@/lib/domain/website";
import { cn } from "@/lib/utils";
import { Card, ConfirmBar, Field, Form, FormError, useSave } from "./form-parts";
import { formWithPhoto, PhotoDrop, usePhotoPick } from "./photo-pick";
import { Sheet, SheetActions } from "./sheet";

export type GalleryPhoto = { id: string; url: string; alt: string; visible: boolean; set: PhotoSet };
export type ReviewRow = {
  id: string;
  authorName: string;
  body: string;
  stars: number;
  reviewDate: string | null;
  isGoogle: boolean;
  visible: boolean;
};

const textareaClass = cn(
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
);

// ---------------------------------------------------------------------------
// Instant reorder (useOptimistic), rolled back with a message if it can't be saved
// ---------------------------------------------------------------------------

function useReorder<T extends { id: string }>(items: T[], save: (ids: string[]) => Promise<{ error: string | null }>) {
  const [order, setOrder] = useOptimistic(items);
  const [error, setError] = useState<string | null>(null);
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[index], next[j]] = [next[j], next[index]];
    setError(null);
    startTransition(async () => {
      setOrder(next);
      try {
        const r = await save(next.map((i) => i.id));
        if (r.error) setError(`Couldn't save the new order. ${r.error}`);
      } catch {
        setError(navigator.onLine === false ? OFFLINE_ERROR : GENERIC_ERROR);
      }
    });
  };
  return { order, move, error };
}

function MoveButtons({ name, index, count, move, shown }: { name: string; index: number; count: number; move: (i: number, d: -1 | 1) => void; shown: boolean }) {
  return (
    <div className={cn("gap-1", shown ? "flex" : "hidden lg:flex")}>
      <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${name} up`}>
        <ArrowUp aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" disabled={index === count - 1} onClick={() => move(index, 1)} aria-label={`Move ${name} down`}>
        <ArrowDown aria-hidden />
      </Button>
    </div>
  );
}

function ReorderToggle({ on, toggle, label }: { on: boolean; toggle: () => void; label: string }) {
  return (
    <Button variant="outline" className="lg:hidden" aria-pressed={on} onClick={toggle}>
      <ArrowUpDown aria-hidden />
      {on ? "Done reordering" : "Reorder"}
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

function InlineError({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Shop photo
// ---------------------------------------------------------------------------

export function ShopPhotoCard({ url }: { url: string | null }) {
  const pick = usePhotoPick();
  const upload = useSave(saveShopPhoto, () => pick.clear());
  const remove = useSave(removeShopPhoto);
  const [confirm, setConfirm] = useState(false);
  const busy = pick.optimising || upload.pending;
  return (
    <Card id="shop-photo" title="Shop photo" description="The big photo at the top of the homepage. Without one, the homepage leads with the logo.">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the saved photo
        <img src={url} alt="Current shop photo" className="aspect-video w-full max-w-md rounded-xl border object-cover" data-testid="shop-photo" />
      ) : (
        <p className="text-muted-foreground">No shop photo yet.</p>
      )}
      <Form onSubmit={(e) => upload.send(formWithPhoto(e, pick.picked))} className="space-y-3">
        <PhotoDrop id="shop-photo-file" label={url ? "Choose a new shop photo" : "Choose a shop photo"} pick={pick} error={upload.state.fields.photo} />
        <FormError>{upload.state.error ?? remove.state.error}</FormError>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="pop" disabled={busy || !pick.picked}>
            <ImageUp aria-hidden />
            {upload.pending ? "Uploading…" : url ? "Replace shop photo" : "Save shop photo"}
          </Button>
          {url && !confirm ? (
            <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
        {confirm ? (
          <ConfirmBar
            question="Remove the shop photo? The file is deleted."
            confirmLabel="Remove photo"
            pending={remove.pending}
            onKeep={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              remove.send(new FormData());
            }}
          />
        ) : null}
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Slideshow and Recent cuts
// ---------------------------------------------------------------------------

function AddPhotoForm({ set, full }: { set: PhotoSet; full: boolean }) {
  const pick = usePhotoPick();
  const [alt, setAlt] = useState("");
  const [child, setChild] = useState(false);
  const add = useSave(addPhoto, () => {
    pick.clear();
    setAlt("");
    setChild(false);
  });
  const id = useId();
  return (
    <Form onSubmit={(e) => add.send(formWithPhoto(e, pick.picked))} className="space-y-3 rounded-xl bg-muted/50 p-3">
      <input type="hidden" name="set" value={set} />
      <PhotoDrop id={`${id}-file`} label={`Add a photo to ${PHOTO_SET_LABELS[set]}`} pick={pick} error={add.state.fields.photo} />
      <Field label="Description (for people who can't see the photo)" htmlFor={`${id}-alt`} error={add.state.fields.alt}>
        <Input
          id={`${id}-alt`}
          name="alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={160}
          placeholder="e.g. Skin fade with a sharp line-up"
          aria-invalid={add.state.fields.alt ? true : undefined}
        />
      </Field>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="child" checked={child} onChange={(e) => setChild(e.target.checked)} className="mt-1 size-5 shrink-0 accent-foreground" />
        <span>
          <span className="font-medium">Shows a child</span>
          <span className="block text-sm text-muted-foreground">Starts hidden. Only show it once a parent has agreed.</span>
        </span>
      </label>
      {full ? (
        <p className="rounded-lg border-2 border-status-request-foreground bg-status-request p-3 text-sm text-status-request-foreground">{addsHiddenNote(set)}</p>
      ) : null}
      <FormError>{add.state.error}</FormError>
      <Button type="submit" variant="pop" disabled={pick.optimising || add.pending}>
        <Plus aria-hidden />
        {add.pending ? "Uploading…" : "Add photo"}
      </Button>
    </Form>
  );
}

function PhotoSheetForm({ photo, visibleIn, onClose }: { photo: GalleryPhoto; visibleIn: Record<PhotoSet, number>; onClose: () => void }) {
  const save = useSave(updatePhoto, onClose);
  const pick = usePhotoPick();
  const replace = useSave(replacePhoto, onClose);
  const remove = useSave(deletePhoto, onClose);
  const [set, setSet] = useState<PhotoSet>(photo.set);
  const [visible, setVisible] = useState(photo.visible);
  const [confirm, setConfirm] = useState(false);
  const id = useId();
  const others = visibleIn[set] - (photo.visible && photo.set === set ? 1 : 0);
  const wouldOverflow = visible && others >= PHOTO_LIMITS[set];
  return (
    <div className="space-y-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- the saved photo or the chosen replacement */}
      <img src={pick.picked?.url ?? photo.url} alt={photo.alt} className="max-h-56 w-full rounded-xl border object-contain" />
      <Form onSubmit={save.submit} className="space-y-4">
        <input type="hidden" name="id" value={photo.id} />
        <Field label="Description" htmlFor={`${id}-alt`} error={save.state.fields.alt}>
          <Input id={`${id}-alt`} name="alt" defaultValue={photo.alt} maxLength={160} aria-invalid={save.state.fields.alt ? true : undefined} />
        </Field>
        <Field label="Section" htmlFor={`${id}-set`}>
          <NativeSelect id={`${id}-set`} name="set" value={set} onChange={(e) => setSet(e.target.value as PhotoSet)} className="w-full">
            {PHOTO_SETS.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {PHOTO_SET_LABELS[s]} ({photoMeter(s, visibleIn[s]).label} shown)
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="visible" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-foreground" />
          <span className="font-medium">Show on the website</span>
        </label>
        {wouldOverflow ? (
          <p role="alert" className="rounded-lg border-2 border-status-request-foreground bg-status-request p-3 text-sm text-status-request-foreground">
            {PHOTO_SET_LABELS[set]} already shows {PHOTO_LIMITS[set]} photos. Untick “Show on the website” or hide another photo first.
          </p>
        ) : null}
        <FormError>{save.state.error}</FormError>
        <SheetActions>
          <Button type="submit" variant="pop" disabled={save.pending || wouldOverflow}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </SheetActions>
      </Form>

      <Form onSubmit={(e) => replace.send(formWithPhoto(e, pick.picked))} className="space-y-3 border-t pt-4">
        <input type="hidden" name="id" value={photo.id} />
        <PhotoDrop id={`${id}-replace`} label="Replace with another photo" pick={pick} error={replace.state.fields.photo} />
        <FormError>{replace.state.error}</FormError>
        <Button type="submit" variant="outline" disabled={!pick.picked || pick.optimising || replace.pending}>
          <ImageUp aria-hidden />
          {replace.pending ? "Uploading…" : "Replace photo"}
        </Button>
      </Form>

      <div className="border-t pt-4">
        {confirm ? (
          <ConfirmBar
            question="Delete this photo? It's removed from the website and the file is deleted."
            confirmLabel="Delete photo"
            pending={remove.pending}
            onKeep={() => setConfirm(false)}
            onConfirm={() => {
              const data = new FormData();
              data.set("id", photo.id);
              remove.send(data);
            }}
          />
        ) : (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Delete photo
          </Button>
        )}
        <FormError>{remove.state.error}</FormError>
      </div>
    </div>
  );
}

function VisibleToggle({ photo, onToggle, pending }: { photo: GalleryPhoto; onToggle: () => void; pending: boolean }) {
  return (
    <Button variant="ghost" size="icon" disabled={pending} onClick={onToggle} aria-label={`${photo.visible ? "Hide" : "Show"} ${photo.alt}`}>
      {photo.visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </Button>
  );
}

export function PhotoSetCard({
  set,
  photos,
  visibleIn,
}: {
  set: PhotoSet;
  photos: GalleryPhoto[];
  visibleIn: Record<PhotoSet, number>;
}) {
  const { order, move, error } = useReorder(photos, reorderPhotos);
  const [shown, setShown] = useOptimistic(new Map(photos.map((p) => [p.id, p.visible])));
  const toggle = useSave(setPhotoVisible);
  const [editing, setEditing] = useState<GalleryPhoto | null>(null);
  const [round, setRound] = useState(0);
  const [reordering, setReordering] = useState(false);
  const meter = photoMeter(set, visibleIn[set]);
  const title = PHOTO_SET_LABELS[set];
  const limit = PHOTO_LIMITS[set];

  const flip = (photo: GalleryPhoto) => {
    const data = new FormData();
    data.set("id", photo.id);
    data.set("visible", photo.visible ? "0" : "1");
    startTransition(() => {
      setShown((m) => new Map(m).set(photo.id, !photo.visible));
      toggle.send(data);
    });
  };

  return (
    <Card
      id={set === "slideshow" ? "slideshow" : "recent-cuts"}
      title={title}
      description={
        set === "slideshow"
          ? `The “Inside the shop” slideshow. Up to ${limit} photos show; hidden ones are kept here.`
          : `The Recent cuts gallery. Up to ${limit} photos show; hidden ones are kept here.`
      }
    >
      <div className="space-y-1.5">
        <p className="text-sm font-semibold" data-testid={`${set}-meter`}>
          {meter.label} shown{meter.full ? " · full" : ""}
        </p>
        <div aria-hidden className="flex gap-1">
          {Array.from({ length: limit }, (_, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-full", i < visibleIn[set] ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      <AddPhotoForm set={set} full={meter.full} />

      {order.length > 1 ? <ReorderToggle on={reordering} toggle={() => setReordering((r) => !r)} label={title} /> : null}
      <InlineError>{error ?? toggle.state.error}</InlineError>

      {order.length ? (
        <ol className="divide-y rounded-2xl border bg-background/50" data-testid={`${set}-list`}>
          {order.map((p, i) => {
            const photo = { ...p, visible: shown.get(p.id) ?? p.visible };
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2" data-testid="photo-row">
                {/* eslint-disable-next-line @next/next/no-img-element -- dashboard thumbnail */}
                <img src={p.url} alt="" className={cn("size-14 shrink-0 rounded-lg border object-cover", !photo.visible && "opacity-50")} loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{p.alt}</p>
                  {photo.visible ? null : (
                    <span className="mt-0.5 inline-block rounded-full bg-status-cancelled px-2 py-0.5 text-xs font-semibold text-status-cancelled-foreground">
                      Hidden
                    </span>
                  )}
                </div>
                <MoveButtons name={p.alt} index={i} count={order.length} move={move} shown={reordering} />
                <VisibleToggle photo={photo} pending={toggle.pending} onToggle={() => flip(photo)} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(photo);
                    setRound((r) => r + 1);
                  }}
                  aria-label={`Edit ${p.alt}`}
                >
                  <Pencil aria-hidden />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground">No photos yet. {set === "slideshow" ? "The slideshow is hidden on the website until there's one." : "The section is hidden until there's one."}</p>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit photo" description={title}>
        {editing ? <PhotoSheetForm key={round} photo={editing} visibleIn={visibleIn} onClose={() => setEditing(null)} /> : null}
      </Sheet>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${count} out of 5 stars`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn("size-4", i < count ? "fill-current text-foreground" : "text-muted-foreground")} />
      ))}
    </span>
  );
}

function ReviewForm({ review, onClose }: { review: ReviewRow | null; onClose: () => void }) {
  const save = useSave(saveReview, onClose);
  const remove = useSave(deleteReview, onClose);
  const [confirm, setConfirm] = useState(false);
  const [today] = useState(() => dateKey(new Date()));
  const f = save.state.fields;
  const id = useId();
  return (
    <Form onSubmit={save.submit} className="space-y-4">
      {review ? <input type="hidden" name="id" value={review.id} /> : null}
      <p className="rounded-lg bg-muted p-3 text-sm">Copy real reviews word for word, with the reviewer&apos;s name as it appears. Never write or change one.</p>
      <Field label="Name" htmlFor={`${id}-name`} error={f.authorName}>
        <Input id={`${id}-name`} name="authorName" defaultValue={review?.authorName ?? ""} maxLength={80} aria-invalid={f.authorName ? true : undefined} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stars" htmlFor={`${id}-stars`} error={f.stars}>
          <NativeSelect id={`${id}-stars`} name="stars" defaultValue={String(review?.stars ?? 5)} className="w-full">
            {[5, 4, 3, 2, 1].map((n) => (
              <NativeSelectOption key={n} value={n}>
                {n} {n === 1 ? "star" : "stars"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date (optional)" htmlFor={`${id}-date`} error={f.reviewDate}>
          <Input id={`${id}-date`} name="reviewDate" type="date" max={today} defaultValue={review?.reviewDate ?? ""} aria-invalid={f.reviewDate ? true : undefined} />
        </Field>
      </div>
      <Field label="Review" htmlFor={`${id}-body`} error={f.body}>
        <textarea id={`${id}-body`} name="body" rows={5} maxLength={2000} defaultValue={review?.body ?? ""} aria-invalid={f.body ? true : undefined} className={textareaClass} />
      </Field>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="isGoogle" defaultChecked={review?.isGoogle ?? false} className="size-5 accent-foreground" />
        <span className="font-medium">From Google</span>
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="visible" defaultChecked={review?.visible ?? true} className="size-5 accent-foreground" />
        <span className="font-medium">Show on the website</span>
      </label>
      <FormError>{save.state.error ?? remove.state.error}</FormError>
      {review ? (
        confirm ? (
          <ConfirmBar
            question={`Delete the review from ${review.authorName}?`}
            confirmLabel="Delete review"
            pending={remove.pending}
            onKeep={() => setConfirm(false)}
            onConfirm={() => {
              const data = new FormData();
              data.set("id", review.id);
              remove.send(data);
            }}
          />
        ) : (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        )
      ) : null}
      <SheetActions>
        <Button type="submit" variant="pop" disabled={save.pending}>
          {save.pending ? "Saving…" : review ? "Save" : "Add review"}
        </Button>
      </SheetActions>
    </Form>
  );
}

export function ReviewsCard({ reviews }: { reviews: ReviewRow[] }) {
  const { order, move, error } = useReorder(reviews, reorderReviews);
  const [editing, setEditing] = useState<ReviewRow | "new" | null>(null);
  const [round, setRound] = useState(0);
  const [reordering, setReordering] = useState(false);
  const open = (r: ReviewRow | "new") => {
    setEditing(r);
    setRound((n) => n + 1);
  };
  return (
    <Card id="reviews" title="Reviews" description="Shown on the homepage in this order. The overall Google rating is set in Settings.">
      <div className="flex flex-wrap gap-2">
        <Button variant="pop" onClick={() => open("new")}>
          <Plus aria-hidden />
          Add review
        </Button>
        {order.length > 1 ? <ReorderToggle on={reordering} toggle={() => setReordering((r) => !r)} label="reviews" /> : null}
      </div>
      <InlineError>{error}</InlineError>
      {order.length ? (
        <ol className="divide-y rounded-2xl border bg-background/50" data-testid="review-list">
          {order.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="review-row">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{r.authorName}</span>
                  <Stars count={r.stars} />
                  {r.isGoogle ? <span className="text-xs font-semibold text-muted-foreground">Google</span> : null}
                  {r.visible ? null : (
                    <span className="rounded-full bg-status-cancelled px-2 py-0.5 text-xs font-semibold text-status-cancelled-foreground">Hidden</span>
                  )}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {r.reviewDate ? `${formatDay(r.reviewDate)} ${r.reviewDate.slice(0, 4)} · ` : ""}
                  {r.body}
                </p>
              </div>
              <MoveButtons name={`review from ${r.authorName}`} index={i} count={order.length} move={move} shown={reordering} />
              <Button variant="outline" size="sm" onClick={() => open(r)} aria-label={`Edit review from ${r.authorName}`}>
                <Pencil aria-hidden />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">No reviews yet. The reviews section is hidden on the website until there&apos;s one (or a Google rating).</p>
      )}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add a review" : "Edit review"}
        description={editing && editing !== "new" ? editing.authorName : undefined}
      >
        {editing ? <ReviewForm key={round} review={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      </Sheet>
    </Card>
  );
}

