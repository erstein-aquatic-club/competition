import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 200));
    expect(result.current).toBe("hello");
  });

  it("delays value update by the specified delay", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ab");
  });

  it("clears the previous timeout on rapid updates (debounce reset)", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: "abc" });
    act(() => { vi.advanceTimersByTime(100); });
    // still within 200ms of the last change → not updated yet
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(100); });
    // 200ms after "abc" → updated
    expect(result.current).toBe("abc");
  });
});
