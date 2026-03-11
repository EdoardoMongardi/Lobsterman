/**
 * Next.js Instrumentation — runs once on server startup.
 */
export async function register() {
    console.log('[Lobsterman] instrumentation.register() called, NEXT_RUNTIME:', process.env.NEXT_RUNTIME);

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const mode = process.env.LOBSTERMAN_MODE ?? 'demo';
        console.log(`[Lobsterman] LOBSTERMAN_MODE=${mode}`);

        if (mode === 'telegram') {
            console.log('[Lobsterman] Auto-starting engine in telegram mode...');
            const { getEngine } = await import('./core/engine');
            getEngine();
            console.log('[Lobsterman] Engine started via instrumentation');
        }
    }
}
