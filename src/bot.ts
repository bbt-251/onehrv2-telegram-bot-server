// Telegram Bot implementation with node-telegram-bot-api for polling support
import { getHealthyDbInstances, retryDatabaseOperation, employeeCache } from './firebase-config';
import { getUTCTimestamp } from './util/dayjs_format';
import { generateEmployeeAuthToken } from './services/auth-token.service';
import {
    Contact,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    TelegramMessage
} from './types/telegram';
import TelegramBot from 'node-telegram-bot-api';
import type { Location as TgLocation } from 'node-telegram-bot-api';
import dayjs from 'dayjs';
import getFullName from './util/getEmployeeFullName';
import { EmployeeModel } from './models/employee';

// In-memory storage for chat sessions
interface ChatSession {
    phoneNumber: string;
    projectName: string;
    employeeUid: string;
    employeeId: string;
    employeeName: string;
}

const isDev = process.env.NODE_ENV === "development";

const chatSessions = new Map<number, ChatSession>();

// Track active live location sessions to infer when a user stops sharing
interface LiveEntry {
    chatId: number;
    messageId: number;
    employeeId: string;
    projectName: string;
    liveUntilMs: number | null;
    lastUpdateMs: number;
}

const liveSessions = new Map<string, LiveEntry>();
const LIVE_GRACE_MS = 2 * 60 * 1000; // 2 minutes grace after expected end or last update

function makeLiveKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

// Periodically finalize sessions that seem ended (no updates past threshold)
setInterval(async () => {
    const now = Date.now();
    for (const [key, entry] of liveSessions.entries()) {
        // End when EITHER duration has passed OR updates have gone stale for the grace window
        const durationEnd = entry.liveUntilMs || Number.POSITIVE_INFINITY;
        const staleEnd = entry.lastUpdateMs + LIVE_GRACE_MS;
        const threshold = Math.min(durationEnd, staleEnd);
        if (now >= threshold) {
            try {
                const dbs = await getHealthyDbInstances();
                const db = dbs[entry.projectName];
                if (db) {
                    const ts = getUTCTimestamp();
                    await retryDatabaseOperation(async () => {
                        return db.collection('employee').doc(entry.employeeId).update({
                            ['currentLocation.isLive']: false,
                            ['currentLocation.endedAt']: ts,
                            lastChanged: ts
                        } as unknown as Record<string, unknown>);
                    }, 2, 1000, entry.projectName);
                }
            } catch (e) {
                console.error('Live session finalization failed:', e);
            } finally {
                liveSessions.delete(key);
            }
        }
    }
}, 60000);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required but not set');
}

// Create bot with polling configuration (always enabled for main functionality)
const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 3000,  // how often to poll in ms
        autoStart: true,
        params: {
            timeout: 10     // Telegram's "long polling" timeout in seconds
        }
    }
});

// Handle all incoming messages
bot.on('message', (msg: TelegramMessage) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    console.log('📨 Received message:', text, 'from chat:', chatId);

    // Handle contact sharing
    if (msg.contact) {
        const contact = msg.contact as Contact;
        handleContactShare(chatId, contact);
    }
    // Handle phone number as text
    else if (text && (/^[+]?[0-9\s\-()]{10,15}$/).test(text)) {
        const cleanPhone = text.replace(/[\s\-()]/g, '');
        const normalizedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;
        handleContactShare(chatId, {
            phone_number: normalizedPhone,
            first_name: msg.from?.first_name || 'User'
        });
    }

    // Handle static location or start of a live location
    if (msg.location) {
        void handleLocationMessage(msg, false);
    }
});

// Handle live location updates (Telegram sends edited_message updates)
bot.on('edited_message', (msg: TelegramMessage) => {
    if (msg.location) {
        void handleLocationMessage(msg, true);
    }
});

// Handle specific commands
bot.onText(/\/start/, (msg: TelegramMessage) => {
    const chatId = msg.chat.id;
    console.log(`🔔 RECEIVED /start command from chat ${chatId}`);
    sendContactRequest(chatId);
});

bot.onText(/\/test/, (msg: TelegramMessage) => {
    const chatId = msg.chat.id;
    console.log(`🔔 RECEIVED /test command from chat ${chatId}`);
    sendMessage(chatId, '✅ Bot is working!');
});

bot.onText(/\/app/, async (msg: TelegramMessage) => {
    const chatId = msg.chat.id;
    console.log(`🔔 RECEIVED /app command from chat ${chatId}`);

    const session = chatSessions.get(chatId);

    if (!session) {
        sendMessage(chatId, '❌ No active session found. Please use /start and share your phone number first.');
        return;
    }

    try {
        // Generate authentication token for the employee
        const authData = await generateEmployeeAuthToken(session.employeeUid, session.projectName, session.phoneNumber);

        // Generate app URL with authentication parameters
        const appUrl = generateAppUrl(
            session.phoneNumber,
            session.projectName,  // Use environment prefix instead of project ID
            session.employeeUid,
            authData.customToken
        );

        // Calculate expiration time (24 hours from now)
        // const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        // const formattedExpiration = expirationTime.toLocaleTimeString('en-US', {
        //     hour: '2-digit',
        //     minute: '2-digit',
        //     hour12: true,
        //     month: 'short',
        //     day: 'numeric'
        // });

        if (isDev)
            sendMessage(
                chatId,
                `⬇️ Direct Link: \n\n ${appUrl}`,
            );

        // Send app link with inline keyboard (skip phone verification message)
        await sendMessage(
            chatId,
            buildAuthAppMessage(session.employeeName),
            {
                inline_keyboard: [
                    [{ text: '🚀 Open oneHR App', web_app: { url: appUrl } }]
                ],
            }
        );

        console.log(`Successfully regenerated app link for chat ${chatId}`);
    } catch (error) {
        console.error('Error regenerating app link:', error);

        // Fallback: Generate basic URL without authentication
        const basicUrl = generateAppUrl(session.phoneNumber);

        // Send basic app link
        await sendMessage(
            chatId,
            buildBasicAppMessage(session.employeeName),
            {
                inline_keyboard: [
                    [{ text: '🚀 Open oneHR App', web_app: { url: basicUrl } }]
                ],
            }
        );
    }
});

// Prompt user to share location or live location via command
bot.onText(/\/(location|live)/, async (msg: TelegramMessage) => {
    const chatId = msg.chat.id;
    await sendLocationPrompt(chatId);
});

console.log('🤖 Bot initialized successfully');
console.log('🔧 Bot token is valid and working');
console.log('🚀 Starting polling with node-telegram-bot-api...');
console.log('✅ Polling started successfully');
console.log('📡 Bot is now listening for messages...');

// Keyboard markup for phone number request
export function createContactKeyboard(): ReplyKeyboardMarkup {
    return {
        keyboard: [
            [{ text: '📱 Share Phone Number', request_contact: true }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
    };
}

// Send prompt explaining how to share LIVE location only
export async function sendLocationPrompt(chatId: number): Promise<TelegramBot.Message> {
    const text = [
        '📡 Live location',
        '',
        'To share LIVE location: tap the paperclip/attach icon ➜ Location ➜ "Share My Live Location for…" and pick a duration.',
        '',
        'When you stop or the duration ends, the system will mark it as ended automatically.'
    ].join('\n');
    return sendMessage(chatId, text, { remove_keyboard: true });
}

// Send message with optional keyboard
export async function sendMessage(
    chatId: number,
    text: string,
    keyboard?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | { remove_keyboard: true }
): Promise<TelegramBot.Message> {
    // Ensure text is not empty
    const messageText = text && text.trim() ? text : '.';
    const options: { parse_mode: 'HTML' } & { reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove } = { parse_mode: 'HTML' };
    if (keyboard) {
        options.reply_markup = keyboard;
    }
    return bot.sendMessage(chatId, messageText, options);
}

// Remove keyboard
export async function removeKeyboard(chatId: number): Promise<TelegramBot.Message> {
    return bot.sendMessage(chatId, '.', { reply_markup: { remove_keyboard: true } });
}


// Helpers: format names and compose messages
function normalizeName(name: string | null | undefined): string {
    return (name ?? '').replace(/\s+/g, ' ').trim();
}

function buildAuthAppMessage(name?: string): string {
    const greeting = name && name.trim() ? `👋 Welcome back ${name}!\n\n` : '';
    return `${greeting}⬇️ Click below to open your oneHR dashboard:\n\n💡 Use /app if this doesn't work\n\n ⚠️ This link expires after 1 hour!`;
}

function buildBasicAppMessage(name?: string): string {
    const greeting = name && name.trim() ? `👋 Welcome back ${name}!\n\n` : '';
    return `${greeting}⬇️ Click below to open your oneHR dashboard:\n\n💡 Use /app command to get a new authenticated link\n\n ⚠️ This link expires after 1 hour!`;
}

// Send contact request message
export async function sendContactRequest(chatId: number): Promise<TelegramBot.Message> {
    const keyboard = createContactKeyboard();
    return sendMessage(
        chatId,
        '👋 Welcome to oneHR!\n\nTo continue, please share your phone number so we can verify your employee account.',
        keyboard
    );
}

// Send app link message with authentication data
export async function sendAppLink(
    chatId: number,
    phoneNumber: string,
    projectName: string,
    employeeUid: string,
    employeeName?: string
): Promise<TelegramBot.Message> {
    try {
        // Generate authentication token for the employee
        const authData = await generateEmployeeAuthToken(employeeUid, projectName, phoneNumber);

        // Generate app URL with authentication parameters
        const appUrl = generateAppUrl(
            phoneNumber,
            projectName,  // Use environment prefix instead of project ID
            employeeUid,
            authData.customToken
        );

        // Send success message with keyboard removal
        await sendMessage(
            chatId,
            '✅ Phone verified and linked to your employee account!',
            { remove_keyboard: true }
        );

        // Calculate expiration time (24 hours from now)
        // const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        // const formattedExpiration = expirationTime.toLocaleTimeString('en-US', {
        //     hour: '2-digit',
        //     minute: '2-digit',
        //     hour12: true,
        //     month: 'short',
        //     day: 'numeric'
        // });

        if (isDev)
            sendMessage(
                chatId,
                `⬇️ Direct Link: \n\n ${appUrl}`,
            );

        // Send app link with inline keyboard
        return sendMessage(
            chatId,
            buildAuthAppMessage(employeeName),
            {
                inline_keyboard: [
                    [{ text: '🚀 Open oneHR App', web_app: { url: appUrl } }]
                ],
            }
        );
    } catch (error) {
        console.error('Error generating auth token for app link:', error);

        // Fallback: Generate basic URL without authentication
        const basicUrl = generateAppUrl(phoneNumber);

        // Send error message with keyboard removal
        await sendMessage(
            chatId,
            '✅ Phone verified! (Auto-login unavailable)',
            { remove_keyboard: true }
        );

        // Send basic app link
        return sendMessage(
            chatId,
            buildBasicAppMessage(employeeName),
            {
                inline_keyboard: [
                    [{ text: '🚀 Open oneHR App', web_app: { url: basicUrl } }]
                ],
            }
        );
    }
}

// Phone number lookup across all Firebase projects
async function findEmployeeByPhoneNumber(phoneNumber: string): Promise<{ employee: { id: string; uid: string;[key: string]: unknown }; projectName: string } | null> {
    // Check cache first
    const cached = employeeCache.get(phoneNumber);
    if (cached) {
        console.log(`Cache hit for phone ${phoneNumber} in project ${cached.projectName}`);
        return { employee: cached.data as { id: string; uid: string;[key: string]: unknown }, projectName: cached.projectName };
    }

    const healthyDbs = await getHealthyDbInstances();
    console.log(`Searching for phone ${phoneNumber} across ${Object.keys(healthyDbs).length} Firebase projects`);

    for (const [projectName, db] of Object.entries(healthyDbs)) {
        try {
            const employeesRef = db.collection('employee');
            const query = await retryDatabaseOperation(async () => {
                return await employeesRef
                    .where('personalPhoneNumber', '==', phoneNumber)
                    .limit(1)
                    .get();
            }, 2, 1000, projectName);

            if (!query.empty) {
                const doc = query.docs[0];
                if (doc && doc.exists) {
                    const employee = { id: doc.id, uid: doc.data().uid, ...doc.data() };

                    // Cache the result
                    employeeCache.set(phoneNumber, employee, projectName);

                    console.log(`Found employee ${employee.id} (UID: ${employee.uid}) in project ${projectName}`);
                    return { employee, projectName };
                }
            }
        } catch (error) {
            console.error(`Error searching ${projectName}:`, error);
            continue;
        }
    }

    console.log(`Employee with phone ${phoneNumber} not found in any project`);
    return null;
}

// Update employee's telegramChatID
async function updateEmployeeTelegramChatID(employeeId: string, chatId: number, projectName: string): Promise<boolean> {
    const db = (await getHealthyDbInstances())[projectName];
    if (!db) {
        throw new Error(`Database for project ${projectName} is not healthy`);
    }

    try {
        await retryDatabaseOperation(async () => {
            return await db.collection('employee').doc(employeeId).update({
                telegramChatID: chatId.toString(),
                lastChanged: getUTCTimestamp()
            });
        }, 2, 1000, projectName);

        console.log(`Updated telegramChatID for employee ${employeeId} in ${projectName}`);
        return true;
    } catch (error) {
        console.error(`Failed to update telegramChatID for employee ${employeeId}:`, error);
        return false;
    }
}

// Generate dynamic app URL with authentication parameters
// @param projectName - Environment prefix (e.g., "development", "dev"), not Firebase project ID
function generateAppUrl(
    phoneNumber: string,
    projectName?: string,
    employeeUid?: string,
    customToken?: string
): string {
    const baseUrl = process.env.WEB_APP_URL || 'https://your-default-app-url.com';
    const encodedPhone = encodeURIComponent(phoneNumber);
    const timestamp = Date.now();

    // Base URL with phone and timestamp
    let url = `${baseUrl}?phone=${encodedPhone}&t=${timestamp}`;

    // Add authentication parameters if available
    if (projectName) {
        url += `&pid=${encodeURIComponent(projectName)}`;
    }
    if (employeeUid) {
        url += `&uid=${encodeURIComponent(employeeUid)}`;
    }
    if (customToken) {
        url += `&token=${encodeURIComponent(customToken)}`;
    }

    return url;
}

// Handle contact sharing
async function handleContactShare(chatId: number, contact: Contact): Promise<void> {
    const phoneNumber = contact.phone_number;
    // Normalize phone number: remove spaces and special characters, ensure + prefix
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '');
    const normalizedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;

    console.log(`Processing contact share for chat ${chatId}, phone: ${normalizedPhone}`);

    try {
        // Send initial verification message
        await sendMessage(chatId, '⏳ Please wait while we verify your phone number...');
        // Search for employee across all Firebase projects
        const result = await findEmployeeByPhoneNumber(normalizedPhone);

        if (result) {
            const { employee, projectName } = result;

            // Update employee's telegramChatID
            const updateSuccess = await updateEmployeeTelegramChatID(employee.id, chatId, projectName);

            if (updateSuccess) {
                const fullName = normalizeName(getFullName(employee as unknown as EmployeeModel));
                // Store session data for future /app command usage
                chatSessions.set(chatId, {
                    phoneNumber: normalizedPhone,
                    projectName,
                    employeeUid: employee.uid,
                    employeeId: employee.id,
                    employeeName: fullName
                });
                // Send success message with app link (includes auth token generation)
                await sendAppLink(chatId, normalizedPhone, projectName, employee.uid, fullName);
                // Prompt to share live/static location
                await sendLocationPrompt(chatId);
                console.log(`Successfully linked employee ${employee.id} to chat ${chatId}`);
            } else {
                await sendMessage(chatId, '❌ Failed to link your account. Please try again or contact support.');
            }
        } else {
            // Employee not found
            await sendMessage(
                chatId,
                '❌ Employee account not found.\n\nPlease ensure you are sharing the same phone number registered in the HR system, or contact your HR administrator for assistance.',
                { remove_keyboard: true }
            );
        }
    } catch (error) {
        console.error('Error processing contact:', error);
        await sendMessage(
            chatId,
            '❌ An error occurred while processing your request. Please try again later.',
            { remove_keyboard: true }
        );
    }
}

// Live location handling utilities

interface EmployeeRef {
    employeeId: string;
    projectName: string;
    employeeUid: string;
}

// Lookup employee by telegramChatID across projects
async function findEmployeeByChatId(chatId: number): Promise<{ employee: { id: string; uid: string;[key: string]: unknown }; projectName: string } | null> {
    const healthyDbs = await getHealthyDbInstances();
    for (const [projectName, db] of Object.entries(healthyDbs)) {
        try {
            const employeesRef = db.collection('employee');
            const query = await retryDatabaseOperation(async () => {
                return await employeesRef
                    .where('telegramChatID', '==', chatId.toString())
                    .limit(1)
                    .get();
            }, 2, 1000, projectName);

            if (!query.empty) {
                const doc = query.docs[0];
                if (doc && doc.exists) {
                    const employee = { id: doc.id, uid: doc.data().uid, ...doc.data() };
                    return { employee, projectName };
                }
            }
        } catch (error) {
            console.error(`Error searching by chatId in ${projectName}:`, error);
            continue;
        }
    }
    return null;
}

// Ensure we have employee context for a given chat
async function ensureEmployeeByChat(chatId: number): Promise<EmployeeRef | null> {
    const session = chatSessions.get(chatId);
    if (session) {
        return { employeeId: session.employeeId, projectName: session.projectName, employeeUid: session.employeeUid };
    }
    const found = await findEmployeeByChatId(chatId);
    if (found) {
        return { employeeId: found.employee.id, projectName: found.projectName, employeeUid: found.employee.uid };
    }
    return null;
}

// Persist the latest location and append a history log
async function saveEmployeeLocation(projectName: string, employeeId: string, chatId: number, messageId: number, location: TgLocation, livePeriodSeconds: number | null, isEdit: boolean): Promise<void> {
    const db = (await getHealthyDbInstances())[projectName];
    if (!db) {
        throw new Error(`Database for project ${projectName} is not healthy`);
    }

    const nowTs = getUTCTimestamp();
    const key = makeLiveKey(chatId, messageId);
    let isLive = false;
    let liveUntilMs: number | null = null;

    if (typeof livePeriodSeconds === 'number' && livePeriodSeconds > 0) {
        // Initial live location share with a known duration
        isLive = true;
        liveUntilMs = Date.now() + (livePeriodSeconds * 1000);
        liveSessions.set(key, {
            chatId,
            messageId,
            employeeId,
            projectName,
            liveUntilMs,
            lastUpdateMs: Date.now()
        });
    } else {
        // Subsequent live updates may not include live_period, rely on tracker
        const existing = liveSessions.get(key);
        if (existing) {
            isLive = true;
            liveUntilMs = existing.liveUntilMs;
            existing.lastUpdateMs = Date.now();
            liveSessions.set(key, existing);
        } else if (isEdit) {
            // If we receive an edited_message with location but no tracker yet,
            // treat it as a live session with unknown duration (until user stops)
            isLive = true;
            liveUntilMs = null;
            liveSessions.set(key, {
                chatId,
                messageId,
                employeeId,
                projectName,
                liveUntilMs,
                lastUpdateMs: Date.now()
            });
        }
    }

    const liveUntil = liveUntilMs ? dayjs.utc(liveUntilMs).toISOString() : null;

    // Some clients may include heading/speed; guard with type checks
    const heading = (location as unknown as { heading?: number }).heading;
    const speed = (location as unknown as { speed?: number }).speed;
    const accuracy = (location as unknown as { horizontal_accuracy?: number }).horizontal_accuracy;

    const currentLocationData = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        heading: typeof heading === 'number' ? heading : null,
        speed: typeof speed === 'number' ? speed : null,
        source: isLive ? 'telegram_live' : 'telegram',
        isLive: isLive,
        updatedAt: nowTs,
        liveMessageId: String(messageId),
        liveChatId: String(chatId),
        liveUntil: liveUntil,
        endedAt: null as string | null
    };

    await retryDatabaseOperation(async () => {
        await db.collection('employee').doc(employeeId).update({
            currentLocation: currentLocationData,
            lastChanged: nowTs
        });
    }, 2, 1000, projectName);

    // Append to history (best-effort)
    const history = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        heading: typeof heading === 'number' ? heading : null,
        speed: typeof speed === 'number' ? speed : null,
        source: currentLocationData.source,
        timestamp: nowTs,
        chatId: String(chatId),
        messageId: String(messageId),
        livePeriodSeconds: livePeriodSeconds ?? null
    };

    await retryDatabaseOperation(async () => {
        await db.collection('employee').doc(employeeId).collection('locationLogs').add(history);
    }, 2, 1000, projectName);
}

// Handle a location message or an update of a live location
async function handleLocationMessage(msg: TelegramMessage, isEdit: boolean): Promise<void> {
    try {
        const chatId = msg.chat.id;
        const messageId = msg.message_id;
        const loc = msg.location as TgLocation | undefined;
        if (!loc) return;

        // live_period can arrive either on the message or (rarely) bundled inside location
        const livePeriodSeconds = (msg as unknown as { live_period?: number }).live_period ??
            (loc as unknown as { live_period?: number }).live_period ??
            null;

        const context = await ensureEmployeeByChat(chatId);
        if (!context) {
            console.warn(`No employee context for chat ${chatId}; ignoring ${isEdit ? 'live location update' : 'location message'}.`);
            return;
        }

        await saveEmployeeLocation(context.projectName, context.employeeId, chatId, messageId, loc, livePeriodSeconds, isEdit);
    } catch (error) {
        console.error('Failed to handle location message:', error);
    }
}

// Initialize bot handlers
console.log('Initializing Telegram bot handlers...');
console.log('Telegram bot handlers initialized successfully');