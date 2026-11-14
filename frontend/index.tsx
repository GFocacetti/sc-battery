import React, { useEffect, useState } from 'react';
import { definePlugin, DropdownItem, IconsModule, ToggleField } from '@steambrew/client';
import { DisplayMode, loadSettings, onSettingsChanged, saveSettings, settings, Settings } from 'settings';
import { startTopBar } from 'topbar';

declare global {
	interface Window {
		__scb_started__?: boolean;
	}
}

const MODES: { data: DisplayMode; label: string }[] = [
	{ data: 'both', label: 'Icon and percentage' },
	{ data: 'icon', label: 'Icon only' },
	{ data: 'percent', label: 'Percentage only' },
];

// Millennium's plugin settings panel, the only place the settings live
function PluginPanel() {
	const [config, setConfig] = useState<Settings>(settings());
	useEffect(() => onSettingsChanged(setConfig) as unknown as () => void, []);

	return (
		<>
			<DropdownItem
				label="Show"
				rgOptions={MODES}
				selectedOption={config.mode}
				onChange={(option: any) => saveSettings({ ...config, mode: option.data })}
			/>
			<ToggleField
				label="Steam Controller only"
				description="When off, every wireless controller Steam reports a battery for is shown."
				checked={config.steamControllerOnly}
				onChange={(value: boolean) => saveSettings({ ...config, steamControllerOnly: value })}
			/>
		</>
	);
}

// Right after Steam starts the backend may not answer yet: retry until it does
async function loadSettingsWhenReady() {
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			return await Promise.race([loadSettings(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))]);
		} catch {
			await new Promise((r) => setTimeout(r, 2000));
		}
	}
	return settings();
}

export default definePlugin(async () => {
	if (!window.__scb_started__) {
		window.__scb_started__ = true;
		startTopBar();
		loadSettingsWhenReady().catch((err) => console.error('[SC-Battery] settings failed', err));
	}

	return {
		title: 'SC-Battery',
		icon: <IconsModule.Settings />,
		content: <PluginPanel />,
	};
});
