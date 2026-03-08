import { EventSourceAdapter, EventCallback, NormalizedEvent } from '../core/types';
import { normalizeEvent, resetSequence } from '../core/event-normalizer';
import { DEMO_EVENTS, DEMO_TASK, DEMO_CONSTRAINTS } from '../lib/demo-scenario';

export class MockEventSource implements EventSourceAdapter {
    private intervalId: NodeJS.Timeout | null = null;
    private currentIndex: number = 0;
    private running: boolean = false;

    start(callback: EventCallback): void {
        if (this.running) return;

        resetSequence();
        this.currentIndex = 0;
        this.running = true;

        // Emit first event immediately
        this.emitNext(callback);

        // Then emit on interval
        this.intervalId = setInterval(() => {
            this.emitNext(callback);
        }, 1500);
    }

    private emitNext(callback: EventCallback): void {
        if (this.currentIndex >= DEMO_EVENTS.length) {
            this.stop();
            return;
        }

        const raw = DEMO_EVENTS[this.currentIndex];
        // Assign timestamps starting from "now" and incrementing
        const baseTime = Date.now() - (DEMO_EVENTS.length - this.currentIndex) * 1500;
        const event: NormalizedEvent = normalizeEvent(
            { ...raw, timestamp: raw.timestamp ?? baseTime + this.currentIndex * 1500 },
            'mock'
        );

        this.currentIndex++;
        callback(event);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.running = false;
    }

    isRunning(): boolean {
        return this.running;
    }

    /** Expose demo metadata for state initialization */
    static getDemoTask(): string {
        return DEMO_TASK;
    }

    static getDemoConstraints(): string[] {
        return DEMO_CONSTRAINTS;
    }
}
