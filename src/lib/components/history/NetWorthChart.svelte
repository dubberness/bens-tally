<script lang="ts">
	import { formatMoney } from '$lib/money';

	interface Point {
		key: string;
		label: string;
		value: number;
		/** Ringed when an estimate changed that month. */
		estimate?: number;
		estimateNote?: string;
	}

	let {
		points,
		height = 150,
		rings = true,
		colour = 'var(--accent)',
		id = 'nw'
	}: {
		points: Point[];
		height?: number;
		rings?: boolean;
		colour?: string;
		id?: string;
	} = $props();

	let width = $state(360);
	const pad = 8;
	const H = $derived(height - 20);

	const geo = $derived.by(() => {
		const vals = points.map((p) => p.value);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const span = max - min || Math.abs(max) || 1;
		const lo = min - span * 0.12;
		const hi = max + span * 0.1;
		const x = (i: number) =>
			pad +
			(points.length > 1 ? (i * (width - 2 * pad)) / (points.length - 1) : (width - 2 * pad) / 2);
		const y = (v: number) => 6 + (H - 12) * (1 - (v - lo) / (hi - lo));
		const pts = points.map((p, i) => `${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`);
		const line = `M${pts.join(' L')}`;
		const area = `${line} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
		return { x, y, line, area };
	});

	const ticks = $derived.by(() => {
		if (points.length < 2) return [];
		const mid = Math.floor((points.length - 1) / 2);
		return [0, mid, points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
	});
	const short = (p: Point) => (p.key === 'now' ? 'Now' : p.label.replace(/^(\w{3})\w*/, '$1'));
	const summary = $derived(
		points.length
			? `From ${formatMoney(points[0].value)} in ${points[0].label} to ${formatMoney(points[points.length - 1].value)} ${points[points.length - 1].key === 'now' ? 'now' : `in ${points[points.length - 1].label}`}.`
			: ''
	);
</script>

<figure class="chart" bind:clientWidth={width} style="height: {height}px">
	<svg {width} height={H} viewBox="0 0 {width} {H}" role="img" aria-label={summary}>
		<defs>
			<linearGradient id="{id}-fill" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color={colour} stop-opacity="0.32" />
				<stop offset="1" stop-color={colour} stop-opacity="0" />
			</linearGradient>
		</defs>
		{#if points.length > 1}
			<path d={geo.area} fill="url(#{id}-fill)" />
			<path
				d={geo.line}
				fill="none"
				stroke={colour}
				stroke-width="2.4"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/if}
		{#each points as p, i (p.key)}
			{#if rings && p.estimate}
				<circle cx={geo.x(i)} cy={geo.y(p.value)} r="4.5" class="ring">
					<title>{p.label}: {p.estimateNote || 'estimate changed'}</title>
				</circle>
			{/if}
		{/each}
		{#if points.length}
			{@const lastI = points.length - 1}
			<circle cx={geo.x(lastI)} cy={geo.y(points[lastI].value)} r="3.5" fill={colour} />
		{/if}
	</svg>
	<figcaption class="axis">
		{#each ticks as t (t)}
			<span>{short(points[t])}</span>
		{/each}
	</figcaption>
</figure>

<style>
	.chart {
		position: relative;
		margin: 0;
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.ring {
		fill: var(--ground);
		stroke: var(--estimate);
		stroke-width: 2;
	}
	.axis {
		position: absolute;
		left: 6px;
		right: 6px;
		bottom: 0;
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-3);
	}
</style>
