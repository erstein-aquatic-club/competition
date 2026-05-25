import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDelayedLoading } from "../useDelayedLoading";

describe("useDelayedLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns showSlowToast=false initially even when loading", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 5000));
    expect(result.current.showSlowToast).toBe(false);
  });

  it("flips showSlowToast to true after delayMs of continuous loading", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 5000));
    expect(result.current.showSlowToast).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.showSlowToast).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showSlowToast).toBe(true);
  });

  it("does not flip if loading completes before delayMs", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDelayedLoading(loading, 5000),
      { initialProps: { loading: true } },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender({ loading: false });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.showSlowToast).toBe(false);
  });

  it("resets to false when loading goes back to false after firing", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDelayedLoading(loading, 5000),
      { initialProps: { loading: true } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.showSlowToast).toBe(true);

    rerender({ loading: false });
    expect(result.current.showSlowToast).toBe(false);
  });

  it("triggers a fresh episode if loading goes true→false→true", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDelayedLoading(loading, 5000),
      { initialProps: { loading: true } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.showSlowToast).toBe(true);

    rerender({ loading: false });
    expect(result.current.showSlowToast).toBe(false);

    rerender({ loading: true });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.showSlowToast).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showSlowToast).toBe(true);
  });

  it("respects custom delayMs", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 1000));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.showSlowToast).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showSlowToast).toBe(true);
  });
});
