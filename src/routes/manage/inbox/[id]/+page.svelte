<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { formatMoney } from '$lib/money';
	import { shortDate, shortDateTime } from '$lib/time';

	let { data } = $props();
	const STATUS: Record<string, string> = {
		applied: 'Applied',
		review: 'Waiting in the Inbox',
		ignored: 'Ignored'
	};
	const units = (e6: number | null) => (e6 == null ? '—' : String(e6 / 1e6));
	const money = (c: number) => formatMoney(c, { cents: true });
</script>

<svelte:head><title>Import · Ben's Tally</title></svelte:head>

<a class="h-back back" href="/manage/inbox"><Icon name="back" size={18} /> Inbox</a>
<h1 class="disp title">{data.mail?.subject ?? data.item.subject ?? 'Import'}</h1>

<div class="grid">
	<section class="card">
		<dl class="meta small">
			{#if data.mail}
				<dt>From</dt>
				<dd>{data.mail.from ?? 'unknown'}</dd>
				{#if data.mail.date}<dt>Sent</dt>
					<dd>{shortDateTime(new Date(data.mail.date))}</dd>{/if}
			{/if}
			<dt>Received</dt>
			<dd>{shortDateTime(data.item.receivedAt)}</dd>
			<dt>Status</dt>
			<dd>{STATUS[data.item.status] ?? data.item.status}</dd>
		</dl>
	</section>

	{#if data.parsed}
		{@const p = data.parsed}
		<section class="card">
			<span class="lbl">What the app reads in it</span>
			{#if p.kind === 'trade'}
				<p>
					<span class="strong"
						>{p.side === 'buy' ? 'Bought' : 'Sold'} {units(p.unitsE6)} {p.ticker}</span
					>
					at ${(p.priceE4 / 1e4).toFixed(4)} on {shortDate(p.date, { year: true })}: {money(
						p.valueCents
					)}{p.feeCents ? ` plus ${money(p.feeCents)} fees` : ''}.
				</p>
				<p class="sub small">Order {p.orderId}{p.fundName ? ` · ${p.fundName}` : ''}</p>
			{:else if p.kind === 'income'}
				<p>
					<span class="strong">Distributions paid {shortDate(p.date, { year: true })}</span>, {money(
						p.totalCents
					)} in all.
				</p>
				{#each p.lines as l (l.ticker)}
					<div class="row line">
						<span class="grow small"
							>{l.ticker} · {l.perUnitE6 != null ? `$${(l.perUnitE6 / 1e6).toFixed(6)}` : '—'} × {units(
								l.unitsE6
							)} units · {l.reinvested ? 'reinvested' : 'kept as cash'}</span
						>
						<span class="num small strong">{money(l.amountCents)}</span>
					</div>
				{/each}
			{:else}
				<p>{p.kind === 'ignored' ? 'Nothing to record:' : 'Not readable:'} {p.reason}.</p>
			{/if}
		</section>
	{/if}

	{#if data.mail}
		<section class="card">
			<span class="lbl">The email</span>
			<pre class="body">{data.mail.text}</pre>
		</section>
	{:else if data.csv}
		<section class="card">
			<span class="lbl">The CSV row</span>
			<dl class="meta small">
				{#each data.csv.row as cell, i (i)}
					<dt>{data.csv.headers[i] ?? `Column ${i + 1}`}</dt>
					<dd>{cell || '—'}</dd>
				{/each}
			</dl>
		</section>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		color: var(--text-2);
		text-decoration: none;
	}
	.title {
		font-size: 24px;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
		overflow-wrap: anywhere;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		max-width: 720px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 600;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.meta {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}
	.meta dt {
		color: var(--text-3);
	}
	.meta dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.body {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: inherit;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
		max-height: 60vh;
		overflow: auto;
	}
</style>
