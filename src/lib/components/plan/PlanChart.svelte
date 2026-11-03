<script lang="ts">
	import { formatMoneyShort } from '$lib/money';
	import type { PlanPoint } from '$lib/plan/model';

	let {
		series,
		accessAge,
		freeAge,
		mortgageGoneYear
	}: {
		series: PlanPoint[];
		accessAge: number;
		freeAge: number | null;
		mortgageGoneYear: number | null;
	} = $props();

	let width = $state(340);
	const H = 190;
	const top = 6;
	const side = 4;
	let sel = $state<number | null>(null);

	const cents = (v: number) => Math.round(v * 100);
	const max = $derived(Math.max(1, ...series.map((p) => p.outside + p.super)));
	/** A round number to scale the bars to, so the axis label reads cleanly. */
	const ceiling = $derived.by(() => {
		const mag = Math.pow(10, Math.floor(Math.log10(max)));
		for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= max) return m * mag;
		return max;
	});
	const slot = $derived((width - 2 * side) / Math.max(series.length, 1));
	const barW = $derived(Math.max(2, Math.min(14, slot * 0.72)));
	const x = (i: number) => side + slot * i + slot / 2;
	const h = (v: number) => ((H - top) * v) / ceiling;

	const age0 = $derived(series[0]?.age ?? 0);
	const year0 = $derived(series[0]?.year ?? 0);
	const atAge = (age: number) =>
		age - age0 >= 0 && age - age0 < series.length ? age - age0 : null;

	const marks = $derived.by(() => {
		const out: { i: number; text: string; colour: string; row: number }[] = [];
		const add = (age: number | null, text: string, colour: string, row: number) => {
			const i = age === null ? null : atAge(age);
			if (i !== null) out.push({ i, text, colour, row });
		};
		if (mortgageGoneYear !== null)
			add(age0 + (mortgageGoneYear - year0), 'Mortgage gone', 'var(--c-home)', 1);
		if (freeAge !== null && freeAge < accessAge)
			add(freeAge, `Free at ${freeAge}`, 'var(--accent)', 0);
		add(accessAge, `Super at ${accessAge}`, 'var(--c-super)', 1);
		return out;
	});

	const view = $derived(sel !== null && series[sel] ? series[sel] : null);
	const money = (v: number) => formatMoneyShort(cents(v));
	const summary = $derived(
		freeAge === null
			? `Money outside super and in super by age. Work does not become optional before ${accessAge}.`
			: `Money outside super and in super by age. Work becomes optional at ${freeAge}.`
	);

	function onkey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const at = sel ?? (freeAge === null ? 0 : (atAge(freeAge) ?? 0));
		sel = Math.min(series.length - 1, Math.max(0, at + (e.key === 'ArrowRight' ? 1 : -1)));
	}
</script>

<figure class="chart" bind:clientWidth={width}>
	<div class="marks" aria-hidden="true">
		{#each marks as m (m.text)}
			{@const left = x(m.i)}
			<span
				class="mark"
				style="top: {m.row * 17}px; color: {m.colour}; {left > width * 0.62
					? `right: ${(width - left - 4).toFixed(1)}px`
					: `left: ${(left - 4).toFixed(1)}px`}">{m.text}</span
			>
		{/each}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		{width}
		height={H}
		viewBox="0 0 {width} {H}"
		role="img"
		aria-label={summary}
		tabindex="0"
		onkeydown={onkey}
		onmouseleave={() => (sel = null)}
	>
		<line x1="0" x2={width} y1={H - 0.5} y2={H - 0.5} class="base" />
		{#each [0.5, 1] as g (g)}
			<line x1="0" x2={width} y1={H - h(ceiling * g)} y2={H - h(ceiling * g)} class="grid" />
			<text x="2" y={H - h(ceiling * g) - 3} class="tick">{money(ceiling * g)}</text>
		{/each}
		{#each marks as m (m.text)}
			<line x1={x(m.i)} x2={x(m.i)} y1="0" y2={H} class="dash" style="stroke: {m.colour}" />
		{/each}
		{#each series as p, i (p.age)}
			{@const hs = h(p.super)}
			{@const ho = h(p.outside)}
			<g class:on={sel === i}>
				<rect x={x(i) - barW / 2} y={H - hs} width={barW} height={hs} class="super" />
				<rect
					x={x(i) - barW / 2}
					y={H - hs - ho}
					width={barW}
					height={ho}
					class="outside"
					class:drawing={p.phase === 'bridge'}
				/>
				<rect
					x={x(i) - slot / 2}
					y="0"
					width={slot}
					height={H}
					class="hit"
					role="presentation"
					onmouseenter={() => (sel = i)}
					onclick={() => (sel = sel === i ? null : i)}
				/>
			</g>
		{/each}
	</svg>
	<div class="axis sub">
		<span>{year0} · {age0}</span>
		<span>{series.at(-1)?.year} · {series.at(-1)?.age}</span>
	</div>
	<p class="readout num" aria-live="polite">
		{#if view}
			<strong>{view.year}</strong> · age {view.age} · outside super {money(view.outside)} · super
			{money(view.super)}
		{:else}
			<span class="sub">Tap a bar to see that year.</span>
		{/if}
	</p>
	<div class="legend">
		<span class="sub"><i style="background: var(--c-etf)"></i>Outside super</span>
		<span class="sub"><i style="background: var(--c-super)"></i>Super</span>
		<span class="sub">Today's dollars</span>
	</div>
</figure>

<style>
	.chart {
		position: relative;
		margin: 0;
	}
	.marks {
		position: relative;
		height: 36px;
	}
	.mark {
		position: absolute;
		font-size: 11px;
		font-weight: 700;
		white-space: nowrap;
	}
	svg {
		display: block;
		overflow: visible;
		border-radius: 6px;
	}
	.base {
		stroke: #33333a;
	}
	.grid {
		stroke: var(--surface-2);
		stroke-dasharray: 2 4;
	}
	.tick {
		font-size: 10px;
		fill: var(--text-3);
	}
	.dash {
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
		opacity: 0.8;
	}
	.super {
		fill: var(--c-super);
	}
	.outside {
		fill: var(--c-etf);
	}
	.outside.drawing {
		opacity: 0.55;
	}
	.on .super,
	.on .outside {
		filter: brightness(1.25);
	}
	.hit {
		fill: transparent;
		cursor: pointer;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		padding-top: 6px;
	}
	.readout {
		margin: 6px 0 0;
		font-size: 13px;
		min-height: 20px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		padding-top: 8px;
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}
	.legend i {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		display: inline-block;
	}
</style>
