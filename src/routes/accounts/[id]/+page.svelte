<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import NetWorthChart from '$lib/components/history/NetWorthChart.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';
	import { owed } from '$lib/components/history/fmt';

	let { data, form } = $props();
	let editId = $state<number | null>(null);
	let showClose = $state(false);

	const a = $derived(data.account);
	const SOURCE: Record<string, string> = {
		manual: 'You',
		sheet: 'Sheet',
		month_end: 'Month end',
		calculated: 'Calculated'
	};
	const asInput = (c: number) => (c / 100).toFixed(2);
</script>

<svelte:head><title>{a.name} · Ben's Tally</title></svelte:head>

<a class="h-back" href="/"><Icon name="back" size={18} /> Home</a>

<header class="head">
	<div class="title">
		<span class="dot" style="background: {data.colour}"></span>
		<h1 class="disp h-title">{a.name}</h1>
	</div>
	<a class="btn" href="/manage/accounts/{a.id}">Edit account</a>
</header>

<div class="grid">
	<div class="col">
		<section class="card hero">
			<span class="lbl">{data.kindLabel} · {a.side === 'liability' ? 'owed' : 'owned'}</span>
			<span class="disp num big">{data.value ? owed(data.value.valueCents, a.side) : '—'}</span>
			<div class="meta">
				<span class="badge">{data.badge}</span>
				<span class="sub">{data.detail}</span>
			</div>
			{#if a.closedOn}
				<p class="sub">
					Closed on {shortDate(a.closedOn, { year: true })}. Its history stays in every month it was
					part of.
				</p>
			{/if}
			{#if data.history.length > 1}
				<NetWorthChart
					id="acct"
					points={data.history}
					rings={false}
					colour={data.colour}
					height={140}
				/>
			{/if}
		</section>

		<section class="card">
			<span class="lbl">Add an entry</span>
			<form method="POST" action="?/add" class="h-form" use:enhance>
				<div class="h-row2">
					<label class="h-label"
						>Date <input
							class="h-input"
							type="date"
							name="date"
							value={data.today}
							required
						/></label
					>
					<label class="h-label"
						>{a.side === 'liability' ? 'Owed' : 'Value'}
						<span class="h-money"
							><span class="cur">$</span><input
								name="value"
								inputmode="decimal"
								required
								placeholder="0.00"
							/></span
						></label
					>
				</div>
				<label class="h-check"
					><input type="checkbox" name="reestimate" checked={a.kind === 'property'} /> A new estimate,
					not money in or out</label
				>
				<label class="h-label"
					>Note <input class="h-input" name="note" placeholder="Optional" /></label
				>
				{#if a.source === 'calculated'}
					<p class="sub small">An entry here replaces the calculation from its date on.</p>
				{/if}
				<div class="h-actions">
					<button class="btn primary">Add entry</button>
					{#if form?.error && !form.editId}<span class="h-error" role="alert">{form.error}</span
						>{/if}
				</div>
			</form>
		</section>
	</div>

	<div class="col">
		<section class="card">
			<span class="lbl">Entries</span>
			{#if data.balances.length}
				<p class="sub small">
					Locked months keep their own numbers; correct those on the month’s page.
				</p>
				<ul class="entries">
					{#each data.balances as b (b.id)}
						<li>
							<div class="e-row">
								<span class="grow">
									<span class="strong">{shortDate(b.date, { year: true })}</span>
									<span class="sub small"
										>{SOURCE[b.source] ?? b.source}{b.reestimate ? ' · re-estimate' : ''}{b.note
											? ` · ${b.note}`
											: ''}</span
									>
								</span>
								<span class="num strong"
									>{formatMoney(b.valueCents, { cents: b.valueCents % 100 !== 0 })}</span
								>
								<button
									class="edit"
									aria-expanded={editId === b.id}
									aria-label="Edit the {shortDate(b.date, { year: true })} entry"
									onclick={() => (editId = editId === b.id ? null : b.id)}>Edit</button
								>
							</div>
							{#if editId === b.id}
								<form
									method="POST"
									action="?/update"
									class="h-form fix"
									use:enhance={() =>
										({ update }) => {
											editId = null;
											return update();
										}}
								>
									<input type="hidden" name="id" value={b.id} />
									<div class="h-row2">
										<label class="h-label"
											>Date <input
												class="h-input"
												type="date"
												name="date"
												value={b.date}
												required
											/></label
										>
										<label class="h-label"
											>Amount <span class="h-money"
												><span class="cur">$</span><input
													name="value"
													inputmode="decimal"
													value={asInput(b.valueCents)}
													required
												/></span
											></label
										>
									</div>
									<label class="h-check"
										><input type="checkbox" name="reestimate" checked={b.reestimate} /> Re-estimate</label
									>
									<label class="h-label"
										>Note <input class="h-input" name="note" value={b.note ?? ''} /></label
									>
									<div class="h-actions">
										<button class="btn primary">Save</button>
										<button class="btn danger" formaction="?/delete" formnovalidate>Delete</button>
										<button type="button" class="btn" onclick={() => (editId = null)}>Cancel</button
										>
									</div>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="sub">
					No entries yet{a.source === 'calculated' ? '; its value is worked out.' : '.'}
				</p>
			{/if}
		</section>

		{#if data.transactions}
			<section class="card">
				<div class="tx-head">
					<span class="lbl">Transactions</span>
					{#if data.transactions.total > data.transactions.rows.length}
						<a class="sub tx-all" href="/transactions?account={a.id}"
							>All {data.transactions.total.toLocaleString('en-AU')} ›</a
						>
					{/if}
				</div>
				{#each data.transactions.rows as t (t.id)}
					<div class="row tx">
						<span class="tx-main">
							<span class="tx-name">{t.description}</span>
							<span class="sub tx-sub"
								>{shortDate(t.date, { year: true })}{#if t.held}
									· <span class="badge">Pending</span>{/if}</span
							>
						</span>
						<span class="num" class:gain={t.amountCents > 0}
							>{formatMoney(t.amountCents, { cents: true, sign: t.amountCents > 0 })}</span
						>
					</div>
				{:else}
					<p class="sub">No transactions yet.</p>
				{/each}
			</section>
		{/if}

		<section class="card">
			<span class="lbl">{a.closedOn ? 'Closed' : 'Close this account'}</span>
			{#if a.closedOn}
				<form method="POST" action="?/reopen" use:enhance class="h-form">
					<button class="btn">Reopen</button>
				</form>
			{:else if showClose}
				<form method="POST" action="?/close" use:enhance class="h-form">
					<label class="h-label"
						>Stops counting from <input
							class="h-input"
							type="date"
							name="on"
							value={data.today}
							required
						/></label
					>
					<div class="h-actions">
						<button class="btn danger">Close {a.name}</button>
						<button type="button" class="btn" onclick={() => (showClose = false)}>Cancel</button>
					</div>
				</form>
			{:else}
				<p class="sub">Closing keeps its history; it just stops counting from the day you pick.</p>
				<div class="h-actions">
					<button class="btn" onclick={() => (showClose = true)}>Close account…</button>
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}
	.head :global(.h-title) {
		margin: 0;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		flex: none;
	}
	.grid {
		display: grid;
		gap: 12px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
			align-items: start;
			column-gap: 20px;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.big {
		font-size: 44px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 600;
	}
	p {
		margin: 0;
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entries li {
		border-top: 1px solid var(--surface-2);
	}
	.entries li:first-child {
		border-top: 0;
	}
	.e-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 56px;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.edit {
		min-height: 44px;
		min-width: 44px;
		border: 0;
		background: transparent;
		color: var(--link);
		font: 600 13px var(--font-body);
		cursor: pointer;
	}
	.fix {
		padding: 4px 0 14px;
	}
	.tx-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.tx-all {
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.tx-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.tx-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tx-sub {
		font-size: 12px;
	}
</style>
