import React, { useEffect, useState } from 'react';
import { definePlugin, IconsModule, ToggleField } from '@steambrew/client';
import { loadSettings, onSettingsChanged, saveSettings, settings, Settings, TOGGLES } from 'settings';
import { startTopBar } from 'topbar';
import { loadLanguage, t as tr } from 'lang';

declare global {
	interface Window {
		__scb_started__?: boolean;
	}
}

// Millennium's plugin settings panel; the display switches are also above the chart
function PluginPanel() {
	const [config, setConfig] = useState<Settings>(settings());
	useEffect(() => onSettingsChanged(setConfig) as unknown as () => void, []);

	return (
		<>
			{TOGGLES.map(({ key, label }) => (
				<ToggleField key={key} label={tr(label)} checked={config[key]} onChange={(value: boolean) => saveSettings({ ...config, [key]: value })} />
			))}
			<ToggleField
				label={tr('Steam Controller only')}
				description={tr('When off, every wireless controller with a known battery level is shown.')}
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
		// Texts follow Steam's language: known before the indicator draws any
		loadLanguage().finally(startTopBar);
		loadSettingsWhenReady().catch((err) => console.error('[SC-Battery] settings failed', err));
	}

	return {
		title: 'SC-Battery',
		icon: <IconsModule.Settings />,
		content: <PluginPanel />,
	};
});
