import React, { useEffect, useRef, useState } from 'react';
import { ControllerHistory, getHistory, onHistoryChanged } from 'history';
import { displayFor, onSettingsChanged, resetController, saveSettings, setForController, settings, Settings, TOGGLES } from 'settings';

const HOUR = 60 * 60 * 1000;

const W = 520;
const H = 180;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;



function formatDuration(ms: number) {
	const minutes = Math.round(ms / 60000);
	const h = Math.floor(minutes / 60);
	return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

const DAY = 24 * HOUR;
const MIN_SPAN = HOUR;
const MAX_SPAN = 30 * DAY;
const HOUR_STEPS = [0.25, 0.5, 1, 2, 3, 6, 12].map((h) => h * HOUR);
const DAY_STEPS = [1, 2, 5, 7].map((d) => d * DAY);

// Axis marks on whole quarters, hours or midnights in local time, as many as fit (about six)
function roundTicks(from: number, to: number) {
	const span = to - from;
	const ticks: number[] = [];
	if (span <= 2 * DAY) {
		const step = HOUR_STEPS.find((s) => span / s <= 7) ?? 12 * HOUR;
		const midnight = new Date(from);
		midnight.setHours(0, 0, 0, 0);
		for (let t = midnight.getTime() + Math.ceil((from - midnight.getTime()) / step) * step; t <= to; t += step) ticks.push(t);
		return ticks;
	}
	const days = DAY_STEPS.find((s) => span / s <= 8) ?? 7 * DAY;
	const d = new Date(from);
	d.setHours(24, 0, 0, 0);
	for (; d.getTime() <= to; d.setDate(d.getDate() + days / DAY)) ticks.push(d.getTime());
	return ticks;
}

// Up to two days the marks carry the time; up to about a week each day is named in the middle of its
// column (today, yesterday, then weekdays); beyond that the marks carry the date
function axisLabels(ticks: number[], from: number, to: number): [number, string][] {
	const span = to - from;
	if (span <= 2 * DAY) return ticks.map((t) => [t, new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]);
	if (span > 8 * DAY) return ticks.map((t) => [t, new Date(t).toLocaleDateString([], { day: '2-digit', month: '2-digit' })]);
	const relative = new Intl.RelativeTimeFormat([], { numeric: 'auto' });
	const today = new Date(to);
	today.setHours(0, 0, 0, 0);
	const starts = [ticks[0]! - DAY, ...ticks];
	return starts
		.map((start): [number, string] => {
			const daysAgo = Math.round((today.getTime() - start) / DAY);
			const name = daysAgo < 2 ? relative.format(-daysAgo, 'day') : new Date(start).toLocaleDateString([], { weekday: span > 4 * DAY ? 'short' : 'long' });
			return [Math.max(start, from) / 2 + Math.min(start + DAY, to) / 2, name.charAt(0).toUpperCase() + name.slice(1)];
		})
		.filter(([t]) => t > from && t < to);
}

// The shown span in words, e.g. "Last 6 h" or "Last 3 days"
function spanLabel(span: number) {
	return span < 2 * DAY ? `Last ${Math.round(span / HOUR)} h` : `Last ${Math.round(span / DAY)} days`;
}

// Gaps narrower than this many pixels get no shading: on long ranges they would only add noise
const MIN_GAP_PX = 24;
const LINE = '#59bf40';
const LOW = '#e2412f';

type Sample = [number, number, number];

// Tangents for a monotone cubic curve through the points (Fritsch-Carlson): smooth, but never
// above or below the readings it joins
function tangents(px: number[], py: number[]) {
	const n = px.length;
	const d: number[] = [];
	for (let i = 0; i < n - 1; i++) d.push((py[i + 1]! - py[i]!) / (px[i + 1]! - px[i]! || 1));
	const m = py.map((_, i) => (i === 0 ? d[0] ?? 0 : i === n - 1 ? d[n - 2] ?? 0 : d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2));
	for (let i = 0; i < n - 1; i++) {
		if (d[i] === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = m[i]! / d[i]!;
		const b = m[i + 1]! / d[i]!;
		const s = a * a + b * b;
		if (s > 9) {
			const k = 3 / Math.sqrt(s);
			m[i] = k * a * d[i]!;
			m[i + 1] = k * b * d[i]!;
		}
	}
	return m;
}

function Graph({ entry, from, to }: { entry: ControllerHistory; from: number; to: number }) {
	const [hover, setHover] = useState<Sample | null>(null);
	const x = (t: number) => PAD.left + ((Math.min(Math.max(t, from), to) - from) / (to - from)) * PLOT_W;
	const y = (level: number) => PAD.top + (1 - level / 100) * PLOT_H;
	const sessionOf = (t: number) => entry.sessions.findIndex(([start, end]) => t >= start && t <= (end || Infinity));

	// The readings in range, with the last one before it so the line starts at the left edge
	const before = entry.samples.filter((s) => s[0] < from).pop();
	const samples: Sample[] = [...(before ? [before] : []), ...entry.samples.filter((s) => s[0] >= from && s[0] <= to)];
	const open = entry.sessions[entry.sessions.length - 1];
	const last = samples[samples.length - 1];
	if (last && open && open[1] === 0) samples.push([to, last[1], last[2]]);

	// Connected stretches are a smooth curve through the readings. Between two connections the line goes
	// straight from the last reading to the next one, dashed: the controller kept draining unseen. A higher
	// level after the gap means it was charged meanwhile.
	const px = samples.map((p) => x(p[0]));
	const py = samples.map((p) => y(p[1]));
	const m = tangents(px, py);
	let area = '';
	let solid = '';
	let guessed = '';
	const charges: number[][] = [];
	const offlineCharges: Sample[] = [];
	const gaps: number[][] = [];
	samples.forEach((p, i) => {
		const prev = samples[i - 1];
		if (!prev) {
			area = `M${px[i]},${py[i]}`;
			solid = area;
			return;
		}
		if (prev[2]) charges.push([prev[0], p[0]]);
		if (sessionOf(prev[0]) === sessionOf(p[0])) {
			const h = (px[i]! - px[i - 1]!) / 3;
			const curve = `C${px[i - 1]! + h},${py[i - 1]! + m[i - 1]! * h} ${px[i]! - h},${py[i]! - m[i]! * h} ${px[i]},${py[i]}`;
			area += curve;
			solid += curve;
			return;
		}
		gaps.push([prev[0], p[0]]);
		// A rise of a point or two after a reconnection is the reading settling, not a charge
		const charged = p[1] >= prev[1] + 3;
		if (charged) offlineCharges.push(p);
		const join = charged ? `H${px[i]}V${py[i]}` : `L${px[i]},${py[i]}`;
		area += join;
		guessed += `M${px[i - 1]},${py[i - 1]}${charged ? `H${px[i]}` : `L${px[i]},${py[i]}`}`;
		solid += `M${px[i]},${py[i]}`;
	});
	if (samples.length) area += `V${PAD.top + PLOT_H}H${px[0]}Z`;

	const ticks = roundTicks(from, to);

	// The reading nearest to the pointer, shown with its level, date and time
	const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
		const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
		let best: Sample | null = null;
		let bestDist = Infinity;
		samples.forEach((p, i) => {
			const dist = Math.abs(px[i]! - mx);
			if (dist < bestDist) {
				bestDist = dist;
				best = p;
			}
		});
		setHover(best);
	};

	const tip = hover && (() => {
		const hx = x(hover[0]);
		const hy = y(hover[1]);
		const date = new Date(hover[0]);
		const line1 = date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const line2 = `${hover[1]}%${hover[2] ? ' ⚡' : ''}`;
		const w = 104;
		const left = hx + 10 + w > W - PAD.right ? hx - 10 - w : hx + 10;
		const top = Math.min(Math.max(hy - 18, PAD.top), PAD.top + PLOT_H - 36);
		return (
			<g pointerEvents="none">
				<line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.25)" />
				<circle cx={hx} cy={hy} r="4" fill={LINE} stroke="#fff" strokeWidth="1.5" />
				<rect x={left} y={top} width={w} height="36" rx="3" fill="#2a3a2e" stroke={LINE} strokeOpacity="0.6" />
				<text x={left + 8} y={top + 14} fill="#b8bcbf" fontSize="10">
					{line1}
				</text>
				<text x={left + 8} y={top + 29} fill="#fff" fontSize="12" fontWeight="bold">
					{line2}
				</text>
			</g>
		);
	})();

	return (
		<svg width={W} height={H} style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
			<defs>
				<linearGradient id="scb-fill" x1="0" y1={PAD.top} x2="0" y2={PAD.top + PLOT_H} gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor={LINE} stopOpacity="0.55" />
					<stop offset="1" stopColor={LOW} stopOpacity="0.25" />
				</linearGradient>
			</defs>
			{[0, 25, 50, 75, 100].map((l) => (
				<g key={l}>
					<line x1={PAD.left} x2={W - PAD.right} y1={y(l)} y2={y(l)} stroke="rgba(255,255,255,0.06)" />
					<text x={PAD.left - 6} y={y(l) + 3} fill="#8b929a" fontSize="10" textAnchor="end">
						{l}%
					</text>
				</g>
			))}
			{ticks.map((t) => (
				<line key={t} x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.06)" />
			))}
			{axisLabels(ticks, from, to).map(([t, label]) => (
				<text key={t} x={x(t)} y={H - 6} fill="#8b929a" fontSize="10" textAnchor="middle">
					{label}
				</text>
			))}
			{gaps
				.filter(([a, b]) => x(b!) - x(a!) >= MIN_GAP_PX)
				.map(([a, b], i) => (
					<rect key={i} x={x(a!)} y={PAD.top} width={x(b!) - x(a!)} height={PLOT_H} fill="rgba(255,255,255,0.03)" />
				))}
			{charges.map(([a, b], i) => (
				<rect key={i} x={x(a!)} y={PAD.top} width={Math.max(1, x(b!) - x(a!))} height={PLOT_H} fill="rgba(89,191,64,0.10)" />
			))}
			<path d={area} fill="url(#scb-fill)" />
			<path d={guessed} fill="none" stroke={LINE} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4,3" />
			<path d={solid} fill="none" stroke={LINE} strokeWidth="2" />
			{offlineCharges.map((p, i) => (
				<circle key={i} cx={x(p[0])} cy={y(p[1])} r="3.5" fill={LINE} stroke="#fff" strokeWidth="1" />
			))}
			{tip}
		</svg>
	);
}

// Average drain while connected and not charging, in % per hour over the shown range, split between
// time with a game running and the rest. Between two readings the drop is shared out by how much of
// that time was in game.
function drainPerHour(entry: ControllerHistory, from: number) {
	const now = Date.now();
	const overlap = (a: number, b: number) =>
		entry.play.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(b, end || now) - Math.max(a, start)), 0);
	const game = { drop: 0, time: 0 };
	const idle = { drop: 0, time: 0 };
	const s = entry.samples.filter((p) => p[0] >= from);
	for (let i = 1; i < s.length; i++) {
		const a = s[i - 1]!;
		const b = s[i]!;
		const inSession = entry.sessions.some(([start, end]) => a[0] >= start && b[0] <= (end || Infinity));
		if (a[2] || b[2] || !inSession || b[1] > a[1]) continue;
		const span = b[0] - a[0];
		const share = span > 0 ? overlap(a[0], b[0]) / span : 0;
		game.drop += (a[1] - b[1]) * share;
		game.time += span * share;
		idle.drop += (a[1] - b[1]) * (1 - share);
		idle.time += span * (1 - share);
	}
	const rate = ({ drop, time }: { drop: number; time: number }) => (time > 30 * 60 * 1000 && drop > 0 ? (drop / time) * HOUR : 0);
	return { game: rate(game), idle: rate(idle) };
}

// Small on/off switches for the parts of this controller's indicator in the top bar, with a way back
// to the general settings (Millennium's plugin panel) once it has its own
function DisplaySwitches({ serial }: { serial?: string }) {
	const [config, setConfig] = useState<Settings>(settings());
	useEffect(() => onSettingsChanged(setConfig) as unknown as () => void, []);
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: '10px' }}>
			{serial && config.perController[serial] && (
				<div onClick={() => resetController(serial)} style={{ cursor: 'pointer', color: '#1a9fff', order: 1 }}>
					Use general settings
				</div>
			)}
			{TOGGLES.map(({ key, label }) => {
				const on = serial ? displayFor(config, serial)[key] : config[key];
				return (
					<div
						key={key}
						onClick={() => (serial ? setForController(serial, key, !on) : saveSettings({ ...config, [key]: !on }))}
						style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: on ? '#dcdedf' : '#8b929a' }}
					>
						<div style={{ position: 'relative', width: '24px', height: '13px', borderRadius: '7px', background: on ? LINE : 'rgba(255,255,255,0.15)', transition: 'background 0.15s' }}>
							<div
								style={{
									position: 'absolute',
									top: '2px',
									left: on ? '13px' : '2px',
									width: '9px',
									height: '9px',
									borderRadius: '50%',
									background: '#fff',
									transition: 'left 0.15s',
								}}
							/>
						</div>
						{label}
					</div>
				);
			})}
		</div>
	);
}

export default function ChartPanel({ serial }: { serial?: string }) {
	const [span, setSpan] = useState(DAY);
	const [, refresh] = useState(0);
	useEffect(() => onHistoryChanged(() => refresh((n) => n + 1)), []);

	// The wheel zooms in and out, always ending now; a native listener so the page doesn't scroll as well
	const graph = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = graph.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			setSpan((s) => Math.min(MAX_SPAN, Math.max(MIN_SPAN, s * (e.deltaY > 0 ? 1.25 : 0.8))));
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	const history = getHistory();
	const serials = Object.keys(history);
	const [selected, setSelected] = useState(serial && history[serial] ? serial : serials[0]);
	const entry = selected ? history[selected] : undefined;
	const to = Date.now();
	const from = to - span;

	const drain = entry ? drainPerHour(entry, from) : { game: 0, idle: 0 };
	const current = entry?.samples[entry.samples.length - 1];

	return (
		<div style={{ width: `${W}px`, color: '#dcdedf', fontSize: '12px' }}>
			<div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
				{serials.length > 1 ? (
					<select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ background: '#2a2e35', color: '#dcdedf', border: 'none', padding: '3px' }}>
						{serials.map((s) => (
							<option key={s} value={s}>
								{history[s]!.name || s}
							</option>
						))}
					</select>
				) : (
					<strong style={{ fontSize: '13px' }}>{entry?.name || 'Steam Controller'}</strong>
				)}
				<div style={{ flex: 1 }} />
				<span style={{ color: '#8b929a' }} title="Scroll to zoom">
					{spanLabel(span)}
				</span>
			</div>
			<DisplaySwitches serial={selected} />
			{entry ? (
				<>
					<div ref={graph}>
						<Graph entry={entry} from={from} to={to} />
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '2px', margin: '8px 0 0', color: '#8b929a' }}>
						{current && <span>Now: {current[1]}%{current[2] ? ' (charging)' : ''}</span>}
						{drain.game > 0 && <span>In game: {drain.game.toFixed(1)}% per hour</span>}
						{drain.idle > 0 && <span>Outside games: {drain.idle.toFixed(1)}% per hour</span>}
						{drain.game > 0 && current && !current[2] && <span>About {formatDuration((current[1] / drain.game) * HOUR)} of play left</span>}
						{!drain.game && drain.idle > 0 && current && !current[2] && <span>About {formatDuration((current[1] / drain.idle) * HOUR)} left</span>}
					</div>
				</>
			) : (
				<div style={{ color: '#8b929a' }}>No readings yet.</div>
			)}
		</div>
	);
}
