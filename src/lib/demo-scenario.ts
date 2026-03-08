import { RawEvent } from '../core/types';

export const DEMO_TASK =
    'Refactor the authentication module to use JWT tokens instead of session cookies. Do not modify test files.';

export const DEMO_CONSTRAINTS = [
    'Do not modify test files',
    'Keep backward compatibility with existing API',
    "Use the project's existing JWT library",
];

// Generate a large string of N bytes for simulating large outputs
function largeContent(sizeKB: number): string {
    const line =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n';
    const targetBytes = sizeKB * 1024;
    let result = '';
    while (result.length < targetBytes) {
        result += line;
    }
    return result.slice(0, targetBytes);
}

const PROJECT_ROOT = '/Users/example/project';

export const DEMO_EVENTS: RawEvent[] = [
    // ═══════════════════════════════════════════
    // Events 1–15: Normal progress
    // ═══════════════════════════════════════════

    // 1
    {
        type: 'assistant_message',
        content:
            'I will refactor the authentication module from session cookies to JWT tokens. Let me start by examining the current auth structure.',
    },
    // 2
    {
        type: 'tool_call',
        tool: 'list_dir',
        target: `${PROJECT_ROOT}/src/auth`,
        content: 'Listing files in the auth directory',
    },
    // 3
    {
        type: 'tool_result',
        tool: 'list_dir',
        target: `${PROJECT_ROOT}/src/auth`,
        content:
            'session.ts\nmiddleware.ts\ntypes.ts\nutils.ts\nindex.ts\ncookies.ts',
    },
    // 4
    {
        type: 'tool_call',
        tool: 'view_file',
        target: `${PROJECT_ROOT}/src/auth/session.ts`,
        content: 'Reading session.ts to understand current session-based auth',
    },
    // 5
    {
        type: 'tool_result',
        tool: 'view_file',
        target: `${PROJECT_ROOT}/src/auth/session.ts`,
        content:
            'import { Request, Response } from "express";\nimport { SessionStore } from "./types";\n\nexport class SessionManager {\n  private store: SessionStore;\n  constructor(store: SessionStore) { this.store = store; }\n  async createSession(userId: string): Promise<string> {\n    const sessionId = crypto.randomUUID();\n    await this.store.set(sessionId, { userId, createdAt: Date.now() });\n    return sessionId;\n  }\n}',
    },
    // 6
    {
        type: 'assistant_message',
        content:
            'I can see the session-based auth. I will create a new JWT provider module and update the middleware to use it.',
    },
    // 7 — progress marker: file created
    {
        type: 'tool_call',
        tool: 'write_to_file',
        target: `${PROJECT_ROOT}/src/auth/jwt-provider.ts`,
        content:
            'import jwt from "jsonwebtoken";\n\nexport class JWTProvider {\n  private secret: string;\n  constructor(secret: string) { this.secret = secret; }\n  sign(payload: Record<string, unknown>): string {\n    return jwt.sign(payload, this.secret, { expiresIn: "24h" });\n  }\n  verify(token: string): Record<string, unknown> {\n    return jwt.verify(token, this.secret) as Record<string, unknown>;\n  }\n}',
    },
    // 8
    {
        type: 'tool_result',
        tool: 'write_to_file',
        target: `${PROJECT_ROOT}/src/auth/jwt-provider.ts`,
        content: 'File created successfully',
    },
    // 9 — progress marker: file edited
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/auth/middleware.ts`,
        content:
            'Updating middleware to validate JWT tokens from Authorization header instead of session cookies',
    },
    // 10
    {
        type: 'tool_result',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/auth/middleware.ts`,
        content: 'File updated successfully',
    },
    // 11
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/auth/index.ts`,
        content: 'Updating auth barrel exports to include JWTProvider',
    },
    // 12
    {
        type: 'tool_result',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/auth/index.ts`,
        content: 'File updated successfully',
    },
    // 13 — progress marker: build passes
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'npm run build',
        content: 'Running build to check for compilation errors',
    },
    // 14
    {
        type: 'tool_result',
        tool: 'run_command',
        target: 'npm run build',
        content: 'Build completed successfully. No errors found.',
    },
    // 15
    {
        type: 'assistant_message',
        content:
            'JWT provider created. Middleware updated. Build passes. Now I need to update the route handlers to issue JWT tokens instead of session cookies.',
    },

    // ═══════════════════════════════════════════
    // Events 16–22: Context danger zone
    // Large outputs filling context
    // ═══════════════════════════════════════════

    // 16 — large output 24KB
    {
        type: 'tool_call',
        tool: 'grep_search',
        target: `${PROJECT_ROOT}/src`,
        content: 'Searching for all session cookie references across the codebase',
    },
    // 17
    {
        type: 'tool_result',
        tool: 'grep_search',
        target: `${PROJECT_ROOT}/src`,
        content: largeContent(24),
    },
    // 18 — large output 20KB
    {
        type: 'tool_call',
        tool: 'view_file',
        target: `${PROJECT_ROOT}/src/routes/api.ts`,
        content: 'Reading the full API routes file',
    },
    // 19
    {
        type: 'tool_result',
        tool: 'view_file',
        target: `${PROJECT_ROOT}/src/routes/api.ts`,
        content: largeContent(20),
    },
    // 20 — large output 32KB
    {
        type: 'tool_call',
        tool: 'grep_search',
        target: `${PROJECT_ROOT}`,
        content: 'Searching for all cookie-related imports across entire project',
    },
    // 21
    {
        type: 'tool_result',
        tool: 'grep_search',
        target: `${PROJECT_ROOT}`,
        content: largeContent(32),
    },
    // 22
    {
        type: 'assistant_message',
        content:
            'Found many session cookie references. Let me update each route handler to use JWT tokens.',
    },

    // ═══════════════════════════════════════════
    // Events 23–30: Looping zone
    // Repeated build failures with same error
    // ═══════════════════════════════════════════

    // 23
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/routes/api.ts`,
        content: 'Updating login route to return JWT token',
    },
    // 24
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'npm run build',
        content: 'npm run build',
    },
    // 25 — error
    {
        type: 'error',
        tool: 'run_command',
        target: 'npm run build',
        error:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
        content:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
    },
    // 26 — retry
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/src/routes/api.ts`,
        content: 'Fixing JWTPayload type mismatch in login route',
    },
    // 27
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'npm run build',
        content: 'npm run build',
    },
    // 28 — same error
    {
        type: 'error',
        tool: 'run_command',
        target: 'npm run build',
        error:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
        content:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
    },
    // 29 — another retry
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'npm run build',
        content: 'npm run build',
    },
    // 30 — same error again
    {
        type: 'error',
        tool: 'run_command',
        target: 'npm run build',
        error:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
        content:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
    },

    // ═══════════════════════════════════════════
    // Events 31–35: Risky action zone
    // Wrong project, sensitive files, destructive commands
    // ═══════════════════════════════════════════

    // 31 — path outside project root
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: '/Users/example/other-project/src/config.ts',
        content: 'Updating auth configuration in the config module',
    },
    // 32 — sensitive file
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: `${PROJECT_ROOT}/.env`,
        content: 'Adding JWT_SECRET to environment variables',
    },
    // 33 — destructive command
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'rm -rf dist/',
        content: 'rm -rf dist/',
    },
    // 34
    {
        type: 'tool_result',
        tool: 'run_command',
        target: 'rm -rf dist/',
        content: 'Directory removed',
    },
    // 35 — another path outside root
    {
        type: 'tool_call',
        tool: 'view_file',
        target: '/Users/example/other-project/package.json',
        content: 'Looking at the other project package.json for JWT library version',
    },

    // ═══════════════════════════════════════════
    // Events 36–40: Continued warnings / escalation
    // ═══════════════════════════════════════════

    // 36
    {
        type: 'tool_call',
        tool: 'run_command',
        target: 'npm run build',
        content: 'npm run build',
    },
    // 37 — same error persists
    {
        type: 'error',
        tool: 'run_command',
        target: 'npm run build',
        error:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
        content:
            "TSError: src/routes/api.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JWTPayload'. Property 'sub' is missing in type 'string'.",
    },
    // 38
    {
        type: 'tool_call',
        tool: 'replace_file_content',
        target: '/Users/example/other-project/src/auth/tokens.ts',
        content: 'Checking token implementation in the other project',
    },
    // 39
    {
        type: 'assistant_message',
        content:
            'I need to look at how the other project handles JWT tokens to understand the type mismatch.',
    },
    // 40
    {
        type: 'tool_call',
        tool: 'grep_search',
        target: '/Users/example/other-project/src',
        content: largeContent(20),
    },
];
