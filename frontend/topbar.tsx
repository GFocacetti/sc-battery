import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { findClassModule, IconsModule, Menu, showContextMenu } from '@steambrew/client';
import { batteries, ControllerBattery, startWindowsBatteries, STEAM_CONTROLLER_TYPES } from 'battery';
import { colorFor, displayFor, onSettingsChanged, settings, Settings } from 'settings';
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
// Steam's newer builds no longer keep the readable class name on the element, only the generated one: that is
// looked up in Steam's class map (the readable name stays as a fallback for older builds).
function anchor(doc: Document): Element | null {
	const generated: string | undefined = findClassModule((m) => m.TitleBarControls && m.TitleBar)?.TitleBarControls;
	const selector = ['.TitleBarControls', ...(generated ? ['.' + generated.trim().split(/\s+/).join('.')] : [])].join(', ');
	return doc.querySelector(selector)?.firstElementChild ?? null;
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

// Controller outline (vector version of the project's own artwork, assets/controller.svg)
function ControllerGlyph() {
	return (
		<svg width="30" height="22" viewBox="10 125 980 720" aria-hidden="true" style={{ display: 'block' }}>
			<path fill="currentColor" fillRule="evenodd" d="M130 215C140 175 175 145 235 138C265 135 285 145 295 160L705 160C715 145 735 135 765 138C825 145 860 175 870 215C930 320 980 520 980 660C980 760 940 830 870 835L835 835C810 835 800 820 795 805L775 745C760 700 740 680 690 678L310 678C260 680 240 700 225 745L205 805C200 820 190 835 165 835L130 835C60 830 20 760 20 660C20 520 70 320 130 215Z M200 218H240V258H280V298H240V338H200V298H160V258H200Z M470 268a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z M320 348a50 50 0 1 0 100 0a50 50 0 1 0 -100 0Z M580 348a50 50 0 1 0 100 0a50 50 0 1 0 -100 0Z M745 233a25 25 0 1 0 50 0a25 25 0 1 0 -50 0Z M700 278a25 25 0 1 0 50 0a25 25 0 1 0 -50 0Z M790 278a25 25 0 1 0 50 0a25 25 0 1 0 -50 0Z M745 323a25 25 0 1 0 50 0a25 25 0 1 0 -50 0Z M262 425L388 442Q418 446 414 476L402 588Q398 618 366 614L258 600Q226 596 230 566L240 452Q244 422 262 425Z M738 425L612 442Q582 446 586 476L598 588Q602 618 634 614L742 600Q774 596 770 566L760 452Q756 422 738 425Z M480 518H520A20 20 0 0 1 520 558H480A20 20 0 0 1 480 518Z" />
		</svg>
	);
}

// Steam's gauge turned upright. Its drawing leaves empty room on one side, so after the turn it sits off
// centre: the drawn part is measured and moved to the middle of the box.
function UprightGauge({ level, charging, Battery }: { level: number; charging: boolean; Battery: any }) {
	const box = useRef<HTMLDivElement>(null);
	const gauge = useRef<HTMLDivElement>(null);
	const [shift, setShift] = useState({ x: 0, y: 0 });

	useLayoutEffect(() => {
		const drawn = gauge.current?.querySelector('svg > g') ?? gauge.current?.querySelector('svg');
		if (!box.current || !drawn) return;
		const outer = box.current.getBoundingClientRect();
		const inner = drawn.getBoundingClientRect();
		const dx = outer.left + outer.width / 2 - (inner.left + inner.width / 2);
		const dy = outer.top + outer.height / 2 - (inner.top + inner.height / 2);
		if (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.25) setShift((s) => ({ x: s.x + dx, y: s.y + dy }));
	});

	return (
		<div ref={box} style={{ position: 'relative', width: '15px', height: '22px' }}>
			<div
				ref={gauge}
				style={{
					position: 'absolute',
					left: '50%',
					top: '50%',
					transform: `translate(calc(-50% + ${shift.x}px), calc(-50% + ${shift.y}px)) rotate(270deg)`,
					display: 'flex',
				}}
			>
				<Battery acState={charging ? 2 : 1} batteryLevel={level / 100} batteryCriticalThreshold={0.15} style={{ width: '20px', height: 'auto', minWidth: 'unset' }} />
			</div>
		</div>
	);
}

// Steam Controllers use the project's own outline; any other model gets Steam's icon for it (the one
// Big Picture shows), sized to the same height
function ControllerIcon({ type }: { type: number }) {
	const SteamIcon = IconsModule?.ControllerType;
	const box = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState(1);

	// Steam's icons leave empty room around the drawing: it is measured and enlarged to the height
	// of the Steam Controller outline (700 of its 720 units at 22 px)
	useLayoutEffect(() => {
		const svg = box.current?.querySelector('svg');
		if (!svg) return;
		const drawn = svg.getBoundingClientRect().height ? (svg as SVGGraphicsElement).getBBox() : null;
		const view = svg.viewBox?.baseVal;
		if (!drawn || !view?.height || !drawn.height) return;
		const drawnPx = (drawn.height / view.height) * 22;
		const next = (22 * (700 / 720)) / drawnPx;
		if (Math.abs(next - zoom) > 0.01) setZoom(next);
	});

	if (STEAM_CONTROLLER_TYPES.has(type) || !SteamIcon) return <ControllerGlyph />;
	return (
		<div ref={box} className="scb-controller-icon" style={{ height: '22px', display: 'flex', alignItems: 'center' }}>
			<style>{'.scb-controller-icon svg { height: 22px; width: auto; display: block; }'}</style>
			<div style={{ zoom } as React.CSSProperties}>
				<SteamIcon controllerType={type} />
			</div>
		</div>
	);
}

// Steam's battery gauge, the one Big Picture shows, next to the controller outline. It takes the level
// as 0-1 and the charging state as Steam's EACState: 1 on battery, 2 charging.
function SteamBatteryIcon({ type, level, charging, showPad, showGauge }: { type: number; level: number; charging: boolean; showPad: boolean; showGauge: boolean }) {
	const Battery = IconsModule?.Battery;
	if (!Battery && showGauge && !showPad) return <BatteryIcon level={level} charging={charging} />;
	return (
		// The controller, then the gauge standing upright beside it. A rotated element keeps its
		// unrotated box, so the gauge sits centred in a box of its upright size.
		<div style={{ height: '22px', display: 'flex', alignItems: 'center', gap: '3px' }}>
			{showPad && (
			<div style={{ height: '22px', color: '#dcdedf' }}>
				<ControllerIcon type={type} />
			</div>
			)}
			{showGauge && (Battery ? <UprightGauge level={level} charging={charging} Battery={Battery} /> : <BatteryIcon level={level} charging={charging} />)}
		</div>
	);
}

// With several controllers: the player number on a dot of the controller's LED colour (grey when the
// colour is turned off, a smaller plain dot when the number is)
function PlayerBadge({ player, led, showNumber }: { player: number; led: string; showNumber: boolean }) {
	const [r, g, b] = (led.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
	const light = 0.299 * r! + 0.587 * g! + 0.114 * b! > 150;
	return (
		<div
			style={{
				width: showNumber ? '14px' : '10px',
				height: showNumber ? '14px' : '10px',
				borderRadius: '50%',
				background: led,
				color: light ? '#000' : '#fff',
				fontSize: '10px',
				fontWeight: 'bold',
				lineHeight: '14px',
				textAlign: 'center',
				flexShrink: 0,
			}}
		>
			{showNumber && player}
		</div>
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
					style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
					{list.length > 1 && (displayFor(config, c.serial).showColor || displayFor(config, c.serial).showNumber) && <PlayerBadge player={c.player} led={displayFor(config, c.serial).showColor ? colorFor(config, c.serial, c.led) : 'rgb(220, 222, 223)'} showNumber={displayFor(config, c.serial).showNumber} />}
					{(displayFor(config, c.serial).showPad || displayFor(config, c.serial).showGauge) && <SteamBatteryIcon type={c.type} level={c.level} charging={c.charging} showPad={displayFor(config, c.serial).showPad} showGauge={displayFor(config, c.serial).showGauge} />}
					{displayFor(config, c.serial).showPercent && <span>{c.level}%</span>}
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
	startWindowsBatteries(30_000);
	startHistory(POLL_MS).catch((err) => console.error('[SC-Battery] history failed', err));
	ensureMounted();
	setInterval(ensureMounted, 2000);
}
