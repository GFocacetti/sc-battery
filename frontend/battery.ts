// Controller battery as Steam's own ControllerStore keeps it (the same data Big Picture shows).
// ucBatteryLevel is 0-100, bCharging is true while plugged in.

export interface ControllerBattery {
	index: number;
	serial: string;
	name: string;
	type: number;
	level: number;
	charging: boolean;
}

// EControllerType values of the Steam Controller family (original, its second revision and the 2026 model).
// The Steam Deck's built-in controls report a battery through the system instead and are left out.
const STEAM_CONTROLLER_TYPES = new Set([2, 3, 10]);

function store(): any {
	return (window as any).ControllerStore;
}

export function batteries(steamControllerOnly: boolean): ControllerBattery[] {
	const list: any[] = store()?.m_controllerList ?? [];
	return list
		.filter((c) => c && (c.bWireless || c.bBluetooth))
		.filter((c) => !steamControllerOnly || STEAM_CONTROLLER_TYPES.has(Number(c.eControllerType)))
		.map((c) => ({
			index: Number(c.nControllerIndex),
			serial: String(c.strSerialNumber ?? c.nControllerIndex),
			name: String(c.strName ?? ''),
			type: Number(c.eControllerType),
			level: Math.max(0, Math.min(100, Number(c.ucBatteryLevel) || 0)),
			charging: !!c.bCharging,
		}));
}
