import React, { useEffect, useState } from 'react';
import { ControllerHistory, getHistory, onHistoryChanged } from 'history';

const HOUR = 60 * 60 * 1000;
const RANGES = [
	{ id: 'day', label: '24 h', ms: 24 * HOUR },
	{ id: 'week', label: '7 days', ms: 7 * 24 * HOUR },
	{ id: 'month', label: '30 days', ms: 30 * 24 * HOUR },
];

const W = 520;
const H = 180;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function formatTick(t: number, rangeMs: number) {
	const d = new Date(t);
	return rangeMs <= 24 * HOUR
		? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		: d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}


function formatDuration(ms: number) {
	const minutes = Math.round(ms / 60000);
	const h = Math.floor(minutes / 60);
	return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

// Axis marks on whole hours (every 6 h over a day) or at midnight (every day over a week, every
// 5 days over a month), in local time
function roundTicks(from: number, to: number) {
	const span = to - from;
	const ticks: number[] = [];
	const d = new Date(from);
	d.setMinutes(0, 0, 0);
	if (span <= 24 * HOUR) {
		d.setHours(Math.ceil(d.getHours() / 6) * 6);
		for (; d.getTime() <= to; d.setHours(d.getHours() + 6)) if (d.getTime() >= from) ticks.push(d.getTime());
		return ticks;
	}
	const days = span <= 7 * 24 * HOUR ? 1 : 5;
	d.setHours(24);
	for (; d.getTime() <= to; d.setDate(d.getDate() + days)) ticks.push(d.getTime());
	return ticks;
}

// Over a week each day is named in the middle of its column (today, yesterday, then weekdays);
// otherwise the marks themselves carry the time or date
function axisLabels(ticks: number[], from: number, to: number): [number, string][] {
	if (to - from > 7 * 24 * HOUR || to - from <= 24 * HOUR) return ticks.map((t) => [t, formatTick(t, to - from)]);
	const relative = new Intl.RelativeTimeFormat([], { numeric: 'auto' });
	const today = new Date(to);
	today.setHours(0, 0, 0, 0);
	const starts = [ticks[0]! - 24 * HOUR, ...ticks];
	return starts
		.map((start): [number, string] => {
			const daysAgo = Math.round((today.getTime() - start) / (24 * HOUR));
			const name = daysAgo < 2 ? relative.format(-daysAgo, 'day') : new Date(start).toLocaleDateString([], { weekday: 'long' });
			return [Math.max(start, from) / 2 + Math.min(start + 24 * HOUR, to) / 2, name.charAt(0).toUpperCase() + name.slice(1)];
		})
		.filter(([t]) => t > from && t < to);
}

// Gaps narrower than this many pixels get no shading: on long ranges they would only add noise
const MIN_GAP_PX = 24;

function Graph({ entry, from, to }: { entry: ControllerHistory; from: number; to: number }) {
	const x = (t: number) => PAD.left + ((Math.min(Math.max(t, from), to) - from) / (to - from)) * PLOT_W;
	const y = (level: number) => PAD.top + (1 - level / 100) * PLOT_H;
	const sessionOf = (t: number) => entry.sessions.findIndex(([start, end]) => t >= start && t <= (end || Infinity));

	// The readings in range, with the last one before it so the line starts at the left edge
	const before = entry.samples.filter((s) => s[0] < from).pop();
	const samples = [...(before ? [before] : []), ...entry.samples.filter((s) => s[0] >= from && s[0] <= to)];
	const open = entry.sessions[entry.sessions.length - 1];
	const last = samples[samples.length - 1];
	if (last && open && open[1] === 0) samples.push([to, last[1], last[2]]);

	// Connected stretches are drawn as steps (a level holds until the next reading). Between two
	// connections the line goes straight from the last reading to the next one, dashed: the
	// controller kept draining unseen. A higher level after the gap means it was charged meanwhile.
	let solid = '';
	let guessed = '';
	const charges: number[][] = [];
	const offlineCharges: number[] = [];
	const gaps: number[][] = [];
	samples.forEach((p, i) => {
		const prev = samples[i - 1];
		if (!prev) {
			solid += `M${x(p[0])},${y(p[1])}`;
			return;
		}
		if (prev[2]) charges.push([prev[0], p[0]]);
		if (sessionOf(prev[0]) === sessionOf(p[0])) {
			solid += `H${x(p[0])}V${y(p[1])}`;
			return;
		}
		gaps.push([prev[0], p[0]]);
		if (p[1] > prev[1]) {
			offlineCharges.push(p[0]);
			guessed += `M${x(prev[0])},${y(prev[1])}H${x(p[0])}`;
		} else {
			guessed += `M${x(prev[0])},${y(prev[1])}L${x(p[0])},${y(p[1])}`;
		}
		solid += `M${x(p[0])},${y(p[1])}`;
	});

	const ticks = roundTicks(from, to);

	return (
		<svg width={W} height={H} style={{ display: 'block' }}>
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
				<rect key={i} x={x(a!)} y={PAD.top} width={Math.max(1, x(b!) - x(a!))} height={PLOT_H} fill="rgba(89,191,64,0.12)" />
			))}
			<path d={guessed} fill="none" stroke="#1a9fff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4,3" />
			<path d={solid} fill="none" stroke="#1a9fff" strokeWidth="2" />
			{offlineCharges.map((t, i) => {
				const p = samples.find((s) => s[0] === t)!;
				return <circle key={i} cx={x(t)} cy={y(p[1])} r="3.5" fill="#59bf40" />;
			})}
		</svg>
	);
}

// Average drain while in use and not charging, in % per hour, over the shown range
function drainPerHour(entry: ControllerHistory, from: number) {
	let drop = 0;
	let time = 0;
	const s = entry.samples.filter((p) => p[0] >= from);
	for (let i = 1; i < s.length; i++) {
		const a = s[i - 1]!;
		const b = s[i]!;
		const inSession = entry.sessions.some(([start, end]) => a[0] >= start && b[0] <= (end || Infinity));
		if (!a[2] && !b[2] && inSession && b[1] <= a[1]) {
			drop += a[1] - b[1];
			time += b[0] - a[0];
		}
	}
	return time > 30 * 60 * 1000 && drop > 0 ? (drop / time) * HOUR : 0;
}

export default function ChartPanel({ serial }: { serial?: string }) {
	const [range, setRange] = useState(RANGES[0]!);
	const [, refresh] = useState(0);
	useEffect(() => onHistoryChanged(() => refresh((n) => n + 1)), []);

	const history = getHistory();
	const serials = Object.keys(history);
	const [selected, setSelected] = useState(serial && history[serial] ? serial : serials[0]);
	const entry = selected ? history[selected] : undefined;
	const to = Date.now();
	const from = to - range.ms;

	const tab = (active: boolean): React.CSSProperties => ({
		padding: '4px 10px',
		borderRadius: '3px',
		cursor: 'pointer',
		background: active ? '#1a9fff' : 'rgba(255,255,255,0.08)',
		color: active ? '#fff' : '#dcdedf',
	});

	const drain = entry ? drainPerHour(entry, from) : 0;
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
				{RANGES.map((r) => (
					<div key={r.id} style={tab(r.id === range.id)} onClick={() => setRange(r)}>
						{r.label}
					</div>
				))}
			</div>
			{entry ? (
				<>
					<Graph entry={entry} from={from} to={to} />
					<div style={{ display: 'flex', gap: '16px', margin: '8px 0 0', color: '#8b929a' }}>
						{current && <span>Now: {current[1]}%{current[2] ? ' (charging)' : ''}</span>}
						{drain > 0 && <span>Average use: {drain.toFixed(1)}% per hour</span>}
						{drain > 0 && current && !current[2] && <span>About {formatDuration((current[1] / drain) * HOUR)} left</span>}
					</div>
				</>
			) : (
				<div style={{ color: '#8b929a' }}>No readings yet.</div>
			)}
		</div>
	);
}
