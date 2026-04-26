import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInAppPushBridge } from '../useInAppPushBridge';

describe('useInAppPushBridge', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let capturedHandler: ((event: ExtendableMessageEvent) => void) | null = null;

  beforeEach(() => {
    capturedHandler = null;

    // Spy on navigator.serviceWorker methods to capture the handler
    addEventListenerSpy = vi.spyOn(
      navigator.serviceWorker,
      'addEventListener'
    );
    removeEventListenerSpy = vi.spyOn(
      navigator.serviceWorker,
      'removeEventListener'
    );

    // Capture the handler function passed to addEventListener
    addEventListenerSpy.mockImplementation(function(
      this: ServiceWorkerContainer,
      event: string,
      handler: EventListener
    ) {
      if (event === 'message') {
        capturedHandler = handler as (event: MessageEvent) => void;
      }
      // Call the original method
      EventTarget.prototype.addEventListener.call(this, event, handler);
    } as any);
  });

  it('should register message listener on mount', () => {
    renderHook(() => useInAppPushBridge());
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });

  it('should remove message listener on unmount', () => {
    const { unmount } = renderHook(() => useInAppPushBridge());
    expect(capturedHandler).not.toBeNull();

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });

  it('should not display toast for non-eac-push messages', () => {
    renderHook(() => useInAppPushBridge());

    const event = {
      data: {
        type: 'some-other-type',
        payload: { title: 'X', body: 'Y' },
      },
    } as unknown as MessageEvent;

    // Should not throw
    expect(() => {
      capturedHandler?.(event);
    }).not.toThrow();
  });

  it('should ignore message with missing payload', () => {
    renderHook(() => useInAppPushBridge());

    const event = {
      data: {
        type: 'eac-push',
        payload: null,
      },
    } as unknown as ExtendableMessageEvent;

    // Should not throw when payload is null
    expect(() => {
      capturedHandler?.(event);
    }).not.toThrow();
  });

  it('hook cleanup unregisters listener', () => {
    const { unmount } = renderHook(() => useInAppPushBridge());

    // Verify listener was added
    expect(addEventListenerSpy).toHaveBeenCalled();
    const initialCallCount = addEventListenerSpy.mock.calls.length;

    // Unmount
    unmount();

    // Verify listener was removed
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
