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
	// An Xbox controller on USB (cable or Xbox Wireless Adapter): Steam gives it a fake 100% and Windows no level,
	// so it shows without a battery and is left out of the history
	noLevel: boolean;
	// The level comes in four steps (Xbox Wireless Adapter), not in %
	steps: boolean;
}

// EControllerType values of the Steam Controller family (original, its second revision and the 2026 model).
// The Steam Deck's built-in controls report a battery through the system instead and are left out.
export const STEAM_CONTROLLER_TYPES = new Set([2, 3, 10]);

// The key a controller is remembered by (history, its own settings and colour). Steam's serial for an Xbox
// controller is "vendor-product-id", and the product part changes with the connection (Bluetooth, USB, Xbox
// Wireless Adapter): the same controller keeps one key without it. "Awaiting_Logon" is the placeholder Steam
// reports before signing in: no key.
export function controllerKey(serial: string): string {
	if (!serial || serial === 'Awaiting_Logon') return '';
	const parts = /^([0-9a-f]+)-[0-9a-f]+-([0-9a-f]+)$/i.exec(serial);
	return parts ? `${parts[1]}-${parts[2]}` : serial;
}

function store(): any {
	return (window as any).ControllerStore;
}

const MICROSOFT = 0x045e;
// Sony: DualShock 4 and DualSense, whose level Steam reads over USB as well as over Bluetooth
const SONY = 0x054c;

// Levels Windows knows for Bluetooth controllers (Xbox ones), refreshed from the backend
// steps: a level from the Xbox Wireless Adapter, which only knows empty, low, medium and full
let windowsLevels: { name: string; level: number; steps?: boolean }[] = [];
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
		// Wired controllers too when they have a real battery reading: PlayStation ones (Steam reads their level
		// over USB as well), or any that Steam reports charging or below 100%. Xbox ones on USB show without a
		// level (Steam gives them a fake 100%); other wired pads without a battery stay out
		.filter(({ c, fromWindows }) => c.bWireless || c.bBluetooth || fromWindows || Number(c.unVendorID) === SONY || Number(c.unVendorID) === MICROSOFT || !!c.bCharging || (Number(c.ucBatteryLevel) > 0 && Number(c.ucBatteryLevel) < 100))
		.filter(({ c }) => !steamControllerOnly || STEAM_CONTROLLER_TYPES.has(Number(c.eControllerType)))
		.map(({ c, player, fromWindows }) => ({
			index: Number(c.nControllerIndex),
			serial: controllerKey(String(c.strSerialNumber || `${c.unVendorID}-${c.unProductID}`)),
			// A name starting with "#" is one of Steam's untranslated text ids ("#controller_xboxone"), not a name
			name: String(fromWindows?.name ?? (String(c.strName ?? '').startsWith('#') ? '' : c.strName ?? '')),
			type: Number(c.eControllerType),
			level: Math.max(0, Math.min(100, fromWindows ? fromWindows.level : Number(c.ucBatteryLevel) || 0)),
			charging: fromWindows ? false : !!c.bCharging,
			led: `rgb(${Number(c.nLEDColorR) || 0}, ${Number(c.nLEDColorG) || 0}, ${Number(c.nLEDColorB) || 0})`,
			player,
			noLevel: Number(c.unVendorID) === MICROSOFT && !c.bWireless && !c.bBluetooth && !fromWindows,
			steps: !!fromWindows?.steps,
		}))
		// Not signed in yet: Steam reports a placeholder instead of the serial, which would make a controller of its own
		.filter((c) => c.serial);
}
