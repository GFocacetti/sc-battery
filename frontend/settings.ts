import { callable } from '@steambrew/client';

export type DisplayMode = 'icon' | 'percent' | 'both';

export interface Settings {
	mode: DisplayMode;
	// Only Steam Controllers, or every wireless controller Steam reports a battery for
	steamControllerOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: 'both', steamControllerOnly: true };

const getSettings = callable<[], string>('scb_get_settings');
const saveSettingsCall = callable<[{ json: string }], boolean>('scb_save_settings');

// Millennium may hand string results back still wrapped in JSON quotes: every string from a
// backend call goes through this
export const unquote = (value: unknown) => String(value ?? '').replace(/^"|"$/g, '');

function parse(raw: unknown): Partial<Settings> {
	try {
		let value = JSON.parse(String(raw ?? ''));
		// A JSON object sent back as a quoted string decodes to the string first
		if (typeof value === 'string') value = JSON.parse(value);
		return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	} catch {
		try {
			return JSON.parse(unquote(raw).replace(/\\"/g, '"'));
		} catch {
			return {};
		}
	}
}

let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<(s: Settings) => void>();

export const settings = () => current;

export function onSettingsChanged(listener: (s: Settings) => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function loadSettings() {
	const stored = parse(await getSettings());
	current = {
		mode: stored.mode === 'icon' || stored.mode === 'percent' || stored.mode === 'both' ? stored.mode : DEFAULT_SETTINGS.mode,
		steamControllerOnly: typeof stored.steamControllerOnly === 'boolean' ? stored.steamControllerOnly : DEFAULT_SETTINGS.steamControllerOnly,
	};
	listeners.forEach((l) => l(current));
	return current;
}

export async function saveSettings(next: Settings) {
	current = next;
	listeners.forEach((l) => l(current));
	await saveSettingsCall({ json: JSON.stringify(next) });
}
