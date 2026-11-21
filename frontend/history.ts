import { callable } from '@steambrew/client';
import { batteries, ControllerBattery } from 'battery';

// Per controller (by serial number): the level readings and the connection sessions.
// A sample is [time ms, level 0-100, charging 0/1]; a session is [connected ms, disconnected ms or 0 while connected].
export interface ControllerHistory {
	name: string;
	samples: [number, number, number][];
	sessions: [number, number][];
	// Periods with a game running while the controller was connected: [start ms, end ms or 0 while playing]
	play: [number, number][];
	// Last time the controller was seen connected, saved every few minutes: closes a session left open when Steam quits
	seen: number;
}

export type History = Record<string, ControllerHistory>;

const KEEP_MS = 31 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 15_000;
const SEEN_EVERY_MS = 5 * 60 * 1000;
const STABLE_MS = 15_000;
// A 100% between two levels this close (in %) is Steam's placeholder, not a reading
const PEAK_RANGE = 5;
// A 100% (not charging) after a lower level, waiting for the next level to tell whether it was real
const held = new Map<string, [number, number, number]>();

const historyGet = callable<[], string>('scb_history_get');
const historySave = callable<[{ json: string }], boolean>('scb_history_save');

let history: History = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
// Per controller, a new level waiting to hold for STABLE_MS before it is recorded
const pending = new Map<string, [number, number, number]>();

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
				play: Array.isArray(entry.play) ? entry.play : [],
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
		entry.play = entry.play.filter((s) => s[1] === 0 || s[1] >= cutoff);
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
		const playing = entry.play[entry.play.length - 1];
		if (playing && playing[1] === 0) playing[1] = Math.max(playing[0], open?.[1] ?? 0);
	}
}

// Readings saved before levels had to hold (see record): one replaced within STABLE_MS by another
// reading of the same connection was a placeholder or a flicker, and is dropped
function dropShortReadings() {
	for (const entry of Object.values(history)) {
		entry.samples = entry.samples.filter((s, i) => {
			const next = entry.samples[i + 1];
			if (!next || next[0] - s[0] >= STABLE_MS) return true;
			return !entry.sessions.some(([start, end]) => s[0] >= start && next[0] <= (end || Infinity));
		});
	}
}

// Placeholder 100% readings already saved: not charging, and the levels before and after it are within
// PEAK_RANGE of each other (85% -> 100% -> 85%)
function dropPlaceholderHundreds() {
	for (const entry of Object.values(history)) {
		entry.samples = entry.samples.filter((s, i) => {
			const prev = entry.samples[i - 1];
			const next = entry.samples[i + 1];
			if (s[1] !== 100 || s[2] || !prev || prev[1] >= 100 || !next) return true;
			return Math.abs(next[1] - prev[1]) > PEAK_RANGE;
		});
	}
}

function record(list: ControllerBattery[], now: number) {
	let dirty = false;
	const connected = new Set(list.map((c) => c.serial));
	// Any game running, Steam or not (non-Steam shortcuts count too)
	const inGame = ((window as any).SteamUIStore?.RunningApps?.length ?? 0) > 0;
	for (const c of list) {
		const entry = (history[c.serial] ??= { name: c.name, samples: [], sessions: [], play: [], seen: now });
		if (c.name && entry.name !== c.name) entry.name = c.name;
		if (now - entry.seen >= SEEN_EVERY_MS) {
			entry.seen = now;
			dirty = true;
		}
		let session = entry.sessions[entry.sessions.length - 1];
		if (!session || session[1] !== 0) {
			session = [now, 0];
			entry.sessions.push(session);
			dirty = true;
		}
		const playing = entry.play[entry.play.length - 1];
		const playOpen = !!playing && playing[1] === 0;
		if (inGame && !playOpen) {
			entry.play.push([now, 0]);
			dirty = true;
		} else if (!inGame && playOpen) {
			playing[1] = now;
			dirty = true;
		}
		// A level is kept only once it has held for a while: right after connecting Steam reports a
		// placeholder (100%) for a few seconds, and the level can flicker by 1% before settling
		const charging = c.charging ? 1 : 0;
		const last = entry.samples[entry.samples.length - 1];
		const sessionHasReading = !!last && last[0] >= session[0];
		if (sessionHasReading && last[1] === c.level && last[2] === charging) {
			pending.delete(c.serial);
			// Back to the level before a held 100%: that 100% was the placeholder
			held.delete(c.serial);
			continue;
		}
		const candidate = pending.get(c.serial);
		if (!candidate || candidate[1] !== c.level || candidate[2] !== charging) {
			pending.set(c.serial, [now, c.level, charging]);
			continue;
		}
		if (now - candidate[0] >= STABLE_MS) {
			pending.delete(c.serial);
			// Steam's placeholder 100% can last minutes: a 100% (not charging) after a lower level waits for
			// the next level. Within PEAK_RANGE of the level before it, it was the placeholder and is dropped
			if (candidate[1] === 100 && !charging && last && last[1] < 100) {
				if (!held.has(c.serial)) held.set(c.serial, candidate);
				continue;
			}
			const peak = held.get(c.serial);
			held.delete(c.serial);
			if (peak && (!last || Math.abs(candidate[1] - last[1]) > PEAK_RANGE)) entry.samples.push(peak);
			entry.samples.push(candidate);
			dirty = true;
		}
	}
	for (const [serial, entry] of Object.entries(history)) {
		const session = entry.sessions[entry.sessions.length - 1];
		if (!connected.has(serial)) {
			pending.delete(serial);
			held.delete(serial);
			const playing = entry.play[entry.play.length - 1];
			if (playing && playing[1] === 0) {
				playing[1] = now;
				dirty = true;
			}
		}
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
	dropShortReadings();
	dropPlaceholderHundreds();
	prune(Date.now());
	const tick = () => record(batteries(false), Date.now());
	tick();
	setInterval(tick, pollMs);
}
