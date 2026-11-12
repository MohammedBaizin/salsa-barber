import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { AutoRefresh, REFRESH_MS } = await import("@/components/dashboard/auto-refresh");
const { SHEET_CLOSED_EVENT } = await import("@/components/dashboard/sheet");

let visibility: DocumentVisibilityState = "visible";
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  visibility = "visible";
  online = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const tick = () => act(() => vi.advanceTimersByTime(REFRESH_MS));

describe("dashboard auto-refresh", () => {
  it("refreshes every 60 seconds while visible", () => {
    render(<AutoRefresh />);
    act(() => vi.advanceTimersByTime(REFRESH_MS - 1));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    tick();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and refreshes once when the page is visible again", () => {
    render(<AutoRefresh />);
    visibility = "hidden";
    tick();
    tick();
    expect(refresh).not.toHaveBeenCalled();
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("pauses while offline and catches up when back online", () => {
    render(<AutoRefresh />);
    online = false;
    tick();
    expect(refresh).not.toHaveBeenCalled();
    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("pauses while a sheet is open and refreshes once after it closes", () => {
    render(<AutoRefresh />);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    tick();
    expect(refresh).not.toHaveBeenCalled();
    dialog.removeAttribute("open");
    act(() => window.dispatchEvent(new Event(SHEET_CLOSED_EVENT)));
    expect(refresh).toHaveBeenCalledTimes(1);
    // Nothing was missed since: closing another sheet doesn't refresh again.
    act(() => window.dispatchEvent(new Event(SHEET_CLOSED_EVENT)));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("doesn't refresh on visibility changes when nothing was missed", () => {
    render(<AutoRefresh />);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops when the dashboard is left", () => {
    const { unmount } = render(<AutoRefresh />);
    unmount();
    tick();
    expect(refresh).not.toHaveBeenCalled();
  });
});
