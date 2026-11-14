import { callable } from '@steambrew/client';
// Controller battery as Steam's own ControllerStore keeps it (the same data Big Picture shows).
// ucBatteryLevel is 0-100, bCharging is true while plugged in.

export interface ControllerBattery {
	index: number;
	serial: string;
	name: string;
	type: number;
	level: number;
	charging: boolean;
	// Colour of the controller's LED, as set in Steam ("rgb(...)"), and its place in Steam's controller order (1, 2, ...)
	led: string;
	player: number;
}

// EControllerType values of the Steam Controller family (original, its second revision and the 2026 model).
// The Steam Deck's built-in controls report a battery through the system instead and are left out.
export const STEAM_CONTROLLER_TYPES = new Set([2, 3, 10]);

function store(): any {
	return (window as any).ControllerStore;
}

const MICROSOFT = 0x045e;

// Levels Windows knows for Bluetooth controllers (Xbox ones), refreshed from the backend
let windowsLevels: { name: string; level: number }[] = [];
const windowsBatteries = callable<[], string>('scb_windows_batteries');

export function startWindowsBatteries(pollMs: number) {
	const update = () =>
		windowsBatteries()
			.then((raw) => {
				let value = JSON.parse(String(raw ?? '[]'));
				// A JSON list sent back as a quoted string decodes to the string first
				if (typeof value === 'string') value = JSON.parse(value);
				windowsLevels = (Array.isArray(value) ? value : [value]).filter((v: any) => v && typeof v.level === 'number');
			})
			.catch(() => {});
	update();
	setInterval(update, pollMs);
}

export function batteries(steamControllerOnly: boolean): ControllerBattery[] {
	const list: any[] = (store()?.m_controllerList ?? []).filter((c: any) => c);
	const xboxFromWindows = windowsLevels.filter((w) => /xbox/i.test(w.name));
	let xboxUsed = 0;
	// Player numbers follow Steam's controller order across every controller, wired ones included
	return [...list]
		.sort((a, b) => Number(a.nControllerIndex) - Number(b.nControllerIndex))
		.map((c, i) => {
			// Steam gets no level for Xbox controllers (it reports them as wired, at 100%): Windows'
			// level is used instead, matched in order when there are several
			const fromWindows = Number(c.unVendorID) === MICROSOFT && !c.bWireless && !c.bBluetooth ? xboxFromWindows[xboxUsed++] : undefined;
			return { c, player: i + 1, fromWindows };
		})
		.filter(({ c, fromWindows }) => c.bWireless || c.bBluetooth || fromWindows)
		.filter(({ c }) => !steamControllerOnly || STEAM_CONTROLLER_TYPES.has(Number(c.eControllerType)))
		.map(({ c, player, fromWindows }) => ({
			index: Number(c.nControllerIndex),
			serial: String(c.strSerialNumber || `${c.unVendorID}-${c.unProductID}`),
			name: String(fromWindows?.name ?? c.strName ?? ''),
			type: Number(c.eControllerType),
			level: Math.max(0, Math.min(100, fromWindows ? fromWindows.level : Number(c.ucBatteryLevel) || 0)),
			charging: fromWindows ? false : !!c.bCharging,
			led: `rgb(${Number(c.nLEDColorR) || 0}, ${Number(c.nLEDColorG) || 0}, ${Number(c.nLEDColorB) || 0})`,
			player,
		}));
}
