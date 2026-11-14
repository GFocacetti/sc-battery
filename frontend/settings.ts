import { callable } from '@steambrew/client';

export interface Settings {
	// Parts of each indicator: player dot in the LED colour, player number, controller icon, battery gauge, percentage
	showColor: boolean;
	showNumber: boolean;
	showPad: boolean;
	showGauge: boolean;
	showPercent: boolean;
	// Only Steam Controllers, or every wireless controller with a known battery level
	steamControllerOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	showColor: true,
	showNumber: true,
	showPad: true,
	showGauge: true,
	showPercent: true,
	steamControllerOnly: true,
};

const getSettings = callable<[], string>('scb_get_settings');
const saveSettingsCall = callable<[{ json: string }], boolean>('scb_save_settings');

// Millennium may hand string results back still wrapped in JSON quotes: every string from a
// backend call goes through this
export const unquote = (value: unknown) => String(value ?? '').replace(/^"|"$/g, '');

function parse(raw: unknown): Record<string, unknown> {
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
	return () => {
		listeners.delete(listener);
	};
}

export async function loadSettings() {
	const stored = parse(await getSettings());
	const flag = (key: keyof Settings, fallback: boolean) => (typeof stored[key] === 'boolean' ? (stored[key] as boolean) : fallback);
	// Settings saved by the first version had one "mode": icon, percent or both
	const mode = stored.mode;
	current = {
		showColor: flag('showColor', DEFAULT_SETTINGS.showColor),
		showNumber: flag('showNumber', DEFAULT_SETTINGS.showNumber),
		showPad: flag('showPad', mode !== 'percent'),
		showGauge: flag('showGauge', mode !== 'percent'),
		showPercent: flag('showPercent', mode !== 'icon'),
		steamControllerOnly: flag('steamControllerOnly', DEFAULT_SETTINGS.steamControllerOnly),
	};
	listeners.forEach((l) => l(current));
	return current;
}

export async function saveSettings(next: Settings) {
	current = next;
	listeners.forEach((l) => l(current));
	await saveSettingsCall({ json: JSON.stringify(next) });
}

export const TOGGLES: { key: keyof Settings; label: string }[] = [
	{ key: 'showColor', label: 'Colour' },
	{ key: 'showNumber', label: 'Numbers' },
	{ key: 'showPad', label: 'Controller icons' },
	{ key: 'showGauge', label: 'Battery' },
	{ key: 'showPercent', label: 'Percentage' },
];
