import React, { useEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Menu, showContextMenu } from '@steambrew/client';
import { batteries, ControllerBattery } from 'battery';
import { onSettingsChanged, settings, Settings } from 'settings';
import ChartPanel from 'Chart';
import { startHistory } from 'history';

const HOST_ID = 'sc-battery-indicator';
const POLL_MS = 5000;

// The main Steam window document (desktop mode), once it exists
function mainDocument(): Document | undefined {
	let doc: Document | undefined;
	(window as any).g_PopupManager?.m_mapPopups?.forEach?.((popup: any) => {
		if (!doc && String(popup?.m_strName ?? '').startsWith('SP Desktop')) doc = popup?.m_popup?.document;
	});
	return doc;
}

// The buttons on the right of the title bar (news, notifications, account): the indicator goes first.
// Steam keeps the readable class name next to the generated one.
function anchor(doc: Document): Element | null {
	return doc.querySelector('.TitleBarControls')?.firstElementChild ?? null;
}

function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
	const width = Math.round((level / 100) * 14);
	const fill = charging ? '#59bf40' : level <= 15 ? '#e2412f' : 'currentColor';
	return (
		<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
			<rect x="0.5" y="0.5" width="18" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
			<rect x="19" y="3.5" width="2.5" height="5" rx="1" fill="currentColor" />
			<rect x="2" y="2" width={width} height="8" rx="1" fill={fill} />
			{charging && <path d="M10.5 1.5 L6.5 6.5 H9.5 L8 10.5 L12.5 5.2 H9.5 Z" fill="#fff" stroke="#000" strokeWidth="0.4" />}
		</svg>
	);
}

function Indicator() {
	const [config, setConfig] = useState<Settings>(settings());
	const [list, setList] = useState<ControllerBattery[]>(() => batteries(settings().steamControllerOnly));

	useEffect(() => onSettingsChanged(setConfig) as unknown as () => void, []);
	useEffect(() => {
		const update = () => setList(batteries(config.steamControllerOnly));
		update();
		const timer = setInterval(update, POLL_MS);
		return () => clearInterval(timer);
	}, [config.steamControllerOnly]);

	if (!list.length) return null;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%', padding: '0 8px', color: '#dcdedf', fontSize: '12px' }}>
			{list.map((c) => (
				<div
					key={c.index}
					title={`${c.level}%${c.charging ? ' ⚡' : ''}`}
					style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
					// Steam's own menus open in a popup window of their own, the only way to show above the store and community pages
					onClick={(e) =>
						showContextMenu(
							<Menu label="SC-Battery">
								<div style={{ padding: '12px', background: '#1e2329', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontFamily: '"Motiva Sans", Arial, sans-serif' }}>
									<ChartPanel serial={c.serial} />
								</div>
							</Menu>,
							e.currentTarget,
							{ bForcePopup: true, bPreferPopLeft: true, bOverlapHorizontal: true, bShiftToFitWindow: true, strClassName: 'scb-chart-menu' },
						)
					}
				>
					{config.mode !== 'percent' && <BatteryIcon level={c.level} charging={c.charging} />}
					{config.mode !== 'icon' && <span>{c.level}%</span>}
				</div>
			))}
		</div>
	);
}

let mounted: { doc: Document; root: Root } | undefined;

// Steam rebuilds its top bar (window recreated, mode switches): check now and then and remount when gone
function ensureMounted() {
	const doc = mainDocument();
	if (!doc) return;
	if (mounted && mounted.doc === doc && doc.getElementById(HOST_ID)) return;
	const target = anchor(doc);
	if (!target?.parentElement) return;
	mounted?.root.unmount();
	const host = doc.createElement('div');
	host.id = HOST_ID;
	host.style.display = 'flex';
	target.parentElement.insertBefore(host, target);
	const root = createRoot(host);
	root.render(<Indicator />);
	mounted = { doc, root };
}

export function startTopBar() {
	startHistory(POLL_MS).catch((err) => console.error('[SC-Battery] history failed', err));
	ensureMounted();
	setInterval(ensureMounted, 2000);
}
