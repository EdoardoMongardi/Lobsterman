/**
 * EventSourceAdapter interface
 *
 * Contract for all event source adapters (mock, file, etc.)
 * - `start(callback)` begins emitting normalized events via the callback
 * - `stop()` ceases emission
 * - `isRunning()` returns current emission state
 *
 * Adapters are responsible for:
 * 1. Reading raw events from their source
 * 2. Calling the normalizer to produce NormalizedEvent
 * 3. Invoking the callback with each normalized event
 */
export type { EventSourceAdapter, EventCallback } from '../core/types';
