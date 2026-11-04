<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';
	import type { ValuePoint } from '$lib/invest/range';

	let {
		points,
		height = 170,
		colour = 'var(--c-etf)',
		id = 'inv'
	}: {
		points: ValuePoint[];
		height?: number;
		colour?: string;
		id?: string;
	} = $props();

	let width = $state(360);
	let hover = $state<number | null>(null);
	const pad = 8;
	/** Beyond this many buy/sell days the rings crowd the line, so they become ticks. */
	const MAX_RINGS = 60;
	const H = $derived(height - 20);

	const geo = $derived.by(() => {
		const vals = points.map((p) => p.valueCents);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const span = max - min || Math.abs(max) || 1;
		const lo = min - span * 0.12;
		const hi = max + span * 0.1;
		const x = (i: number) =>
			pad +
			(points.length > 1 ? (i * (width - 2 * pad)) / (points.length - 1) : (width - 2 * pad) / 2);
		const y = (v: number) => 6 + (H - 12) * (1 - (v - lo) / (hi - lo));
		const pts = points.map((p, i) => `${x(i).toFixed(1)} ${y(p.valueCents).toFixed(1)}`);
		const line = `M${pts.join(' L')}`;
		const area = `${line} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
		return { x, y, line, area };
	});

	// The first point is the level before the range (when there is one), so it carries no trade.
	const trades = $derived(points.map((p, i) => ({ p, i })).filter(({ p, i }) => p.traded && i > 0));
	const rings = $derived(trades.length <= MAX_RINGS);

	const ticks = $derived.by(() => {
		if (points.length < 2) return [];
		const mid = Math.floor((points.length - 1) / 2);
		return [0, mid, points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
	});

	const tradeNote = (p: ValuePoint) =>
		p.flowCents > 0
			? `${formatMoney(p.flowCents)} added`
			: p.flowCents < 0
				? `${formatMoney(-p.flowCents)} taken out`
				: 'bought and sold';

	function move(e: PointerEvent) {
		if (points.length < 2) return;
		const box = (e.currentTarget as SVGElement).getBoundingClientRect();
		const f = (e.clientX - box.left - pad) / (box.width - 2 * pad);
		hover = Math.min(points.length - 1, Math.max(0, Math.round(f * (points.length - 1))));
	}

	const summary = $derived(
		points.length > 1
			? `Portfolio value from ${formatMoney(points[0].valueCents)} on ${shortDate(points[0].date)} to ${formatMoney(points[points.length - 1].valueCents)} on ${shortDate(points[points.length - 1].date)}.`
			: ''
	);
	const shown = $derived(hover != null ? points[hover] : null);
</script>

<figure class="chart" bind:clientWidth={width} style="height: {height + 18}px">
	<div class="read" aria-live="off">
		{#if shown}
			<span class="sub">{shortDate(shown.date, { year: true })}</span>
			<span class="num strong">{formatMoney(shown.valueCents)}</span>
			{#if shown.traded && hover !== 0}<span class="sub">{tradeNote(shown)}</span>{/if}
		{/if}
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		{width}
		height={H}
		viewBox="0 0 {width} {H}"
		role="img"
		aria-label={summary}
		onpointermove={move}
		onpointerdown={move}
		onpointerleave={() => (hover = null)}
	>
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
			{#each trades as { p, i } (p.date)}
				{#if rings}
					<circle cx={geo.x(i)} cy={geo.y(p.valueCents)} r="3.5" class="ring">
						<title>{shortDate(p.date)}: {tradeNote(p)}</title>
					</circle>
				{:else}
					<line x1={geo.x(i)} x2={geo.x(i)} y1={H - 6} y2={H} class="tick" />
				{/if}
			{/each}
			{#if hover != null}
				<line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} class="guide" />
				<circle cx={geo.x(hover)} cy={geo.y(points[hover].valueCents)} r="4" fill={colour} />
			{:else}
				{@const last = points.length - 1}
				<circle cx={geo.x(last)} cy={geo.y(points[last].valueCents)} r="3.5" fill={colour} />
			{/if}
		{/if}
	</svg>
	<figcaption class="axis">
		{#each ticks as t (t)}
			<span>{shortDate(points[t].date)}</span>
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
		touch-action: pan-y;
		margin-top: 18px;
	}
	.read {
		position: absolute;
		top: 0;
		left: 6px;
		right: 6px;
		display: flex;
		gap: 8px;
		align-items: baseline;
		font-size: 12px;
		pointer-events: none;
		z-index: 1;
	}
	.strong {
		font-weight: 600;
	}
	.ring {
		fill: var(--ground);
		stroke: var(--text-2);
		stroke-width: 1.8;
	}
	.tick {
		stroke: var(--text-3);
		stroke-width: 1.5;
	}
	.guide {
		stroke: var(--text-3);
		stroke-width: 1;
		stroke-dasharray: 3 3;
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
