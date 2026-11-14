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
const STEAM_CONTROLLER_TYPES = new Set([2, 3, 10]);

function store(): any {
	return (window as any).ControllerStore;
}

export function batteries(steamControllerOnly: boolean): ControllerBattery[] {
	const list: any[] = (store()?.m_controllerList ?? []).filter((c: any) => c);
	// Player numbers follow Steam's controller order across every controller, wired ones included
	return [...list]
		.sort((a, b) => Number(a.nControllerIndex) - Number(b.nControllerIndex))
		.map((c, i) => ({ c, player: i + 1 }))
		.filter(({ c }) => c.bWireless || c.bBluetooth)
		.filter(({ c }) => !steamControllerOnly || STEAM_CONTROLLER_TYPES.has(Number(c.eControllerType)))
		.map(({ c, player }) => ({
			index: Number(c.nControllerIndex),
			serial: String(c.strSerialNumber ?? c.nControllerIndex),
			name: String(c.strName ?? ''),
			type: Number(c.eControllerType),
			level: Math.max(0, Math.min(100, Number(c.ucBatteryLevel) || 0)),
			charging: !!c.bCharging,
			led: `rgb(${Number(c.nLEDColorR) || 0}, ${Number(c.nLEDColorG) || 0}, ${Number(c.nLEDColorB) || 0})`,
			player,
		}));
}
