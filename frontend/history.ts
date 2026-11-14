import { callable } from '@steambrew/client';
import { batteries, ControllerBattery } from 'battery';

// Per controller (by serial number): the level readings and the connection sessions.
// A sample is [time ms, level 0-100, charging 0/1]; a session is [connected ms, disconnected ms or 0 while connected].
export interface ControllerHistory {
	name: string;
	samples: [number, number, number][];
	sessions: [number, number][];
	// Last time the controller was seen connected, saved every few minutes: closes a session left open when Steam quits
	seen: number;
}

export type History = Record<string, ControllerHistory>;

const KEEP_MS = 31 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 15_000;
const SEEN_EVERY_MS = 5 * 60 * 1000;

const historyGet = callable<[], string>('scb_history_get');
const historySave = callable<[{ json: string }], boolean>('scb_history_save');

let history: History = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export const getHistory = () => history;

export function onHistoryChanged(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function parse(raw: unknown): History {
	try {
		let value = JSON.parse(String(raw ?? ''));
		// A JSON object sent back as a quoted string decodes to the string first
		if (typeof value === 'string') value = JSON.parse(value);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		const result: History = {};
		for (const [serial, entry] of Object.entries<any>(value)) {
			if (!entry || typeof entry !== 'object') continue;
			result[serial] = {
				name: String(entry.name ?? ''),
				samples: Array.isArray(entry.samples) ? entry.samples : [],
				sessions: Array.isArray(entry.sessions) ? entry.sessions : [],
				seen: Number(entry.seen) || 0,
			};
		}
		return result;
	} catch {
		return {};
	}
}

function prune(now: number) {
	const cutoff = now - KEEP_MS;
	for (const entry of Object.values(history)) {
		entry.samples = entry.samples.filter((s) => s[0] >= cutoff);
		entry.sessions = entry.sessions.filter((s) => s[1] === 0 || s[1] >= cutoff);
	}
}

function scheduleSave() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = undefined;
		historySave({ json: JSON.stringify(history) }).catch((err) => console.error('[SC-Battery] history save failed', err));
	}, SAVE_DELAY_MS);
}

function changed() {
	listeners.forEach((l) => l());
	scheduleSave();
}

// Sessions left open by a Steam exit are closed at the last reading taken before it
function closeStaleSessions() {
	for (const entry of Object.values(history)) {
		const open = entry.sessions[entry.sessions.length - 1];
		if (open && open[1] === 0) open[1] = Math.max(open[0], entry.seen, entry.samples[entry.samples.length - 1]?.[0] ?? 0);
	}
}

function record(list: ControllerBattery[], now: number) {
	let dirty = false;
	const connected = new Set(list.map((c) => c.serial));
	for (const c of list) {
		const entry = (history[c.serial] ??= { name: c.name, samples: [], sessions: [], seen: now });
		if (c.name && entry.name !== c.name) entry.name = c.name;
		if (now - entry.seen >= SEEN_EVERY_MS) {
			entry.seen = now;
			dirty = true;
		}
		const session = entry.sessions[entry.sessions.length - 1];
		if (!session || session[1] !== 0) {
			entry.sessions.push([now, 0]);
			dirty = true;
		}
		const last = entry.samples[entry.samples.length - 1];
		const charging = c.charging ? 1 : 0;
		if (!last || last[1] !== c.level || last[2] !== charging) {
			entry.samples.push([now, c.level, charging]);
			dirty = true;
		}
	}
	for (const [serial, entry] of Object.entries(history)) {
		const session = entry.sessions[entry.sessions.length - 1];
		if (!connected.has(serial) && session && session[1] === 0) {
			session[1] = now;
			// The last level is repeated at the disconnection so the line reaches the end of the session
			const last = entry.samples[entry.samples.length - 1];
			if (last) entry.samples.push([now, last[1], last[2]]);
			dirty = true;
		}
	}
	if (dirty) {
		prune(now);
		changed();
	}
}

// Every controller with a battery is recorded, whatever the display settings say
export async function startHistory(pollMs: number) {
	if (loaded) return;
	loaded = true;
	history = parse(await historyGet());
	closeStaleSessions();
	prune(Date.now());
	const tick = () => record(batteries(false), Date.now());
	tick();
	setInterval(tick, pollMs);
}
