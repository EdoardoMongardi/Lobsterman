/**
 * FileEventSource — Poll-based JSONL file tailer.
 *
 * Reads new lines appended to a JSONL file and emits them as NormalizedEvents.
 * Handles the file not existing yet, partial lines, and graceful recovery.
 *
 * Usage:
 *   LOBSTERMAN_MODE=file
 *   LOBSTERMAN_SOURCE_FILE=./path/to/session.jsonl
 */

import * as fs from 'fs';
import { EventSourceAdapter, EventCallback } from '../core/types';
import { normalizeEvent } from '../core/event-normalizer';
import { parseOpenClawLine } from './openclaw-parser';

export class FileEventSource implements EventSourceAdapter {
    private filePath: string;
    private pollInterval: number;
    private lastReadPosition: number = 0;
    private intervalId: NodeJS.Timeout | null = null;
    private running: boolean = false;
    private partialLine: string = '';
    private skipExisting: boolean;

    constructor(filePath: string, pollInterval: number = 1000, skipExisting: boolean = false) {
        this.filePath = filePath;
        this.pollInterval = pollInterval;
        this.skipExisting = skipExisting;
    }

    start(callback: EventCallback): void {
        if (this.running) return;

        this.running = true;
        this.partialLine = '';

        // In skipExisting mode, skip to near the end of the file
        // Read only the last TAIL_BYTES to catch recent activity without replaying everything
        const TAIL_BYTES = 50_000; // ~50KB, enough for recent events
        if (this.skipExisting && fs.existsSync(this.filePath)) {
            const stat = fs.statSync(this.filePath);
            if (stat.size > TAIL_BYTES) {
                this.lastReadPosition = stat.size - TAIL_BYTES;
                console.log(`[FileEventSource] Skipping to last ${TAIL_BYTES} bytes (file: ${stat.size} bytes)`);
            } else {
                this.lastReadPosition = 0;
            }
        } else {
            this.lastReadPosition = 0;
        }

        console.log(`[FileEventSource] Tailing ${this.filePath} (poll: ${this.pollInterval}ms)`);

        // Always process available content from start position
        this.poll(callback);

        // Then poll on interval for new lines
        this.intervalId = setInterval(() => {
            this.poll(callback);
        }, this.pollInterval);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.running = false;
        console.log('[FileEventSource] Stopped');
    }

    isRunning(): boolean {
        return this.running;
    }

    private poll(callback: EventCallback): void {
        try {
            if (!fs.existsSync(this.filePath)) return;

            const stat = fs.statSync(this.filePath);
            if (stat.size <= this.lastReadPosition) return;

            // Read new bytes from the last position
            const fd = fs.openSync(this.filePath, 'r');
            const bytesToRead = stat.size - this.lastReadPosition;
            const buffer = Buffer.alloc(bytesToRead);
            fs.readSync(fd, buffer, 0, bytesToRead, this.lastReadPosition);
            fs.closeSync(fd);

            this.lastReadPosition = stat.size;

            // Combine with any buffered partial line and split
            const chunk = this.partialLine + buffer.toString('utf-8');
            const lines = chunk.split('\n');

            // Last element is either empty (line ended with \n) or a partial line
            this.partialLine = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                this.processLine(trimmed, callback);
            }
        } catch (err) {
            // File might be temporarily unavailable — silently retry next poll
            if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }
            console.error('[FileEventSource] Poll error:', err);
        }
    }

    private processLine(line: string, callback: EventCallback): void {
        try {
            const parsed = JSON.parse(line);
            const rawEvents = parseOpenClawLine(parsed);

            for (const raw of rawEvents) {
                const normalized = normalizeEvent(raw, 'file');
                callback(normalized);
            }
        } catch {
            console.warn('[FileEventSource] Failed to parse line:', line.slice(0, 100));
        }
    }
}
