/**
 * Telegram Bot - Lobsterman's primary operator interface.
 *
 * Sends DM notifications to the user when rules trigger, risk changes,
 * or sessions start/end. Handles inline button callbacks for operator
 * intent capture.
 *
 * Uses long-polling (no webhooks needed for local use).
 */

import TelegramBot from 'node-telegram-bot-api';
import {
    formatRuleWarning,
    formatRiskChange,
    formatSessionStart,
    formatSessionEnd,
} from './message-templates';
import { recordDecision } from './operator-intent';
import type { RedFlag, RiskLevel, NormalizedEvent, SupervisorState, EngineCallbacks } from '../core/types';

let bot: TelegramBot | null = null;
let chatId: string | null = null;
const dashboardUrl: string = 'http://localhost:3001';

/**
 * Initialize the Telegram bot and start listening for callbacks.
 */
export function initTelegramBot(): EngineCallbacks | null {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !targetChatId) {
        console.warn('[Lobsterman] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set - Telegram disabled');
        return null;
    }

    chatId = targetChatId;
    bot = new TelegramBot(token, { polling: true });

    // Handle inline button callbacks
    bot.on('callback_query', async (query) => {
        if (!query.data) return;

        const [action, ruleId] = query.data.split(':');

        switch (action) {
            case 'ack':
                recordDecision('acknowledged', ruleId);
                await bot!.answerCallbackQuery(query.id, { text: 'Acknowledged' });
                break;
            case 'flag':
                recordDecision('flagged_for_review', ruleId);
                await bot!.answerCallbackQuery(query.id, { text: 'Flagged for review' });
                break;
            case 'dashboard':
                await bot!.answerCallbackQuery(query.id, {
                    text: 'Opening dashboard...',
                    url: dashboardUrl,
                });
                break;
            default:
                await bot!.answerCallbackQuery(query.id, { text: 'Unknown action' });
        }
    });

    // Handle /status command
    bot.onText(/\/status/, async (msg) => {
        if (String(msg.chat.id) !== chatId) return;
        await sendPlainText('Lobsterman is running and monitoring.');
    });

    // Handle /help command
    bot.onText(/\/help/, async (msg) => {
        if (String(msg.chat.id) !== chatId) return;
        const helpLines = [
            'Lobsterman Commands',
            '',
            '/status - Check if monitoring is active',
            '/help - Show this help',
            '',
            'I will DM you automatically when:',
            '- A new session starts',
            '- A rule triggers (warnings)',
            '- Risk level changes',
            '- A session ends',
        ];
        await sendPlainText(helpLines.join('\n'));
    });

    console.log(`[Lobsterman] Telegram bot started - sending to chat ${chatId}`);

    // Return engine callbacks that send Telegram messages
    return {
        onRuleTriggered: handleRuleTriggered,
        onRiskChanged: handleRiskChanged,
        onSessionStart: handleSessionStart,
    };
}

// --- Callback Handlers ---

async function handleRuleTriggered(flag: RedFlag, event: NormalizedEvent): Promise<void> {
    const text = formatRuleWarning(flag, event);
    const keyboard = makeWarningKeyboard(flag.ruleId);
    await sendMarkdown(text, keyboard);
}

async function handleRiskChanged(
    oldLevel: RiskLevel,
    newLevel: RiskLevel,
    flags: RedFlag[],
): Promise<void> {
    const text = formatRiskChange(oldLevel, newLevel, flags);
    // Attach buttons using the most recent flag's ruleId
    const topFlag = flags[flags.length - 1];
    const keyboard = topFlag ? makeWarningKeyboard(topFlag.ruleId) : undefined;
    await sendMarkdown(text, keyboard);
}

async function handleSessionStart(sessionId: string, task: string): Promise<void> {
    const text = formatSessionStart(sessionId, task);
    await sendMarkdown(text);
}

/**
 * Send a session end notification (called externally, not via engine callback).
 */
export async function sendSessionEnd(
    sessionId: string,
    stats: SupervisorState['stats'],
    riskLevel: RiskLevel,
    duration?: string,
): Promise<void> {
    const text = formatSessionEnd(sessionId, stats, riskLevel, duration);
    await sendMarkdown(text);
}

// --- Telegram Helpers ---

function makeWarningKeyboard(ruleId: string): TelegramBot.InlineKeyboardMarkup {
    return {
        inline_keyboard: [[
            { text: '✅ Acknowledged', callback_data: `ack:${ruleId}` },
            { text: '🚩 Flag for Review', callback_data: `flag:${ruleId}` },
        ]],
    };
}

async function sendMarkdown(
    text: string,
    replyMarkup?: TelegramBot.InlineKeyboardMarkup,
): Promise<void> {
    if (!bot || !chatId) return;

    try {
        await bot.sendMessage(chatId, text, {
            parse_mode: 'MarkdownV2',
            reply_markup: replyMarkup,
        });
    } catch (err) {
        console.error('[Lobsterman] Telegram MarkdownV2 send failed, trying plain text:', err);
        // Fallback: try without markdown
        try {
            const plainText = text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
            await bot.sendMessage(chatId, plainText, {
                reply_markup: replyMarkup,
            });
        } catch (fallbackErr) {
            console.error('[Lobsterman] Telegram fallback send also failed:', fallbackErr);
        }
    }
}

async function sendPlainText(text: string): Promise<void> {
    if (!bot || !chatId) return;
    try {
        await bot.sendMessage(chatId, text);
    } catch (err) {
        console.error('[Lobsterman] Telegram plain text send failed:', err);
    }
}

/**
 * Stop the Telegram bot polling.
 */
export function stopTelegramBot(): void {
    if (bot) {
        bot.stopPolling();
        bot = null;
        console.log('[Lobsterman] Telegram bot stopped');
    }
}
