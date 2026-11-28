import { callable } from '@steambrew/client';
import { controllerKey } from 'battery';

export type DisplayKey = 'showColor' | 'showNumber' | 'showPad' | 'showGauge' | 'showPercent';

export interface Settings {
	// Parts of each indicator: player dot in the LED colour, player number, controller icon, battery gauge, percentage
	showColor: boolean;
	showNumber: boolean;
	showPad: boolean;
	showGauge: boolean;
	showPercent: boolean;
	// Per controller (by serial number): its own choice for the switches above; missing ones follow the general setting
	perController: Record<string, Partial<Record<DisplayKey, boolean>>>;
	// Only Steam Controllers, or every wireless controller with a known battery level
	steamControllerOnly: boolean;
	// Per controller (by serial number): the colour chosen for its dot ("#rrggbb"); missing ones use the LED colour set in Steam
	colors: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
	showColor: true,
	showNumber: true,
	showPad: true,
	showGauge: true,
	showPercent: true,
	perController: {},
	steamControllerOnly: true,
	colors: {},
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
		perController: readPerController(stored.perController),
		colors: Object.fromEntries(
			Object.entries<unknown>(stored.colors && typeof stored.colors === 'object' ? (stored.colors as Record<string, unknown>) : {}).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string' && /^#[0-9a-f]{6}$/i.test(entry[1]),
			)
				// Saved under Steam's raw serial by older versions: kept under the controller's key
				.map(([serial, color]) => [controllerKey(serial), color] as const)
				.filter(([key]) => key),
		),
	};
	listeners.forEach((l) => l(current));
	return current;
}

export async function saveSettings(next: Settings) {
	current = next;
	listeners.forEach((l) => l(current));
	await saveSettingsCall({ json: JSON.stringify(next) });
}

export const TOGGLES: { key: DisplayKey; label: string }[] = [
	{ key: 'showColor', label: 'Colour' },
	{ key: 'showNumber', label: 'Numbers' },
	{ key: 'showPad', label: 'Controller icons' },
	{ key: 'showGauge', label: 'Battery' },
	{ key: 'showPercent', label: 'Percentage' },
];

function readPerController(value: unknown): Settings['perController'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const result: Settings['perController'] = {};
	for (const [serial, choice] of Object.entries<any>(value)) {
		if (!choice || typeof choice !== 'object') continue;
		const own: Partial<Record<DisplayKey, boolean>> = {};
		for (const { key } of TOGGLES) if (typeof choice[key] === 'boolean') own[key] = choice[key];
		// Saved under Steam's raw serial by older versions: kept under the controller's key
		const key = controllerKey(serial);
		if (key && Object.keys(own).length) result[key] = { ...result[key], ...own };
	}
	return result;
}

// What a controller's indicator shows: its own choices over the general ones
export function displayFor(config: Settings, serial: string): Record<DisplayKey, boolean> {
	const own = config.perController[serial] ?? {};
	const result = {} as Record<DisplayKey, boolean>;
	for (const { key } of TOGGLES) result[key] = own[key] ?? config[key];
	return result;
}

export function setForController(serial: string, key: DisplayKey, value: boolean) {
	const own = { ...displayFor(current, serial), [key]: value };
	return saveSettings({ ...current, perController: { ...current.perController, [serial]: own } });
}

// The colour of a controller's dot: the one chosen in the chart's options, else the LED colour set in Steam
export const colorFor = (config: Settings, serial: string, led: string) => config.colors[serial] ?? led;

export function setColor(serial: string, color: string | undefined) {
	const colors = { ...current.colors };
	if (color) colors[serial] = color;
	else delete colors[serial];
	return saveSettings({ ...current, colors });
}

export function resetController(serial: string) {
	const perController = { ...current.perController };
	delete perController[serial];
	return saveSettings({ ...current, perController });
}
