<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { monthName, shortDateTime } from '$lib/time';
	import { owed, signed, tone } from '$lib/components/history/fmt';

	let { data, form } = $props();
	let editing = $state<number | null>(null);

	const money = (v: string | null) => (v == null || v === '' ? '—' : formatMoney(Number(v)));
	const isMoneyField = (f: string) => f !== 'note';
</script>

<svelte:head><title>{data.name} · Ben's Tally</title></svelte:head>

<a class="h-back" href="/months"><Icon name="back" size={18} /> Months</a>

<header class="head">
	<h1 class="disp h-title">{data.name}</h1>
	<span class="badge"
		>{data.status === 'locked' ? 'Locked' : 'Open'}{data.origin === 'sheet'
			? ' · from the sheet'
			: ''}</span
	>
</header>

<div class="grid">
	<div class="col">
		<section class="card summary">
			{#if data.breakdown}
				<span class="lbl"
					>Your money{data.prevMonth
						? ` since ${monthName(data.prevMonth, { year: false })}`
						: ''}</span
				>
				<span class="disp num mine {tone(data.breakdown.mine)}">{signed(data.breakdown.mine)}</span>
				{#each data.breakdown.parts as p (p.key)}
					<div class="line">
						<span>{p.label}</span><span class="num strong {tone(p.cents)}">{signed(p.cents)}</span>
					</div>
				{/each}
				{#each data.breakdown.estimateItems as e (e.accountId)}
					<div class="line">
						<span>{e.name} estimate (kept apart)</span><span class="num strong est"
							>{signed(e.cents)}</span
						>
					</div>
				{/each}
				<div class="line total">
					<span>Net worth change</span><span class="num strong {tone(data.breakdown.total)}"
						>{signed(data.breakdown.total)}</span
					>
				</div>
			{:else}
				<p class="sub">The first month on record, so there is nothing to compare it with.</p>
			{/if}
			<div class="line total">
				<span>Net worth</span><span class="num strong">{formatMoney(data.netWorth)}</span>
			</div>
			{#if data.status === 'open'}
				<a class="btn primary" href="/months/close"
					>Close {monthName(data.month, { year: false })}</a
				>
			{/if}
		</section>

		<section class="card">
			<form
				method="POST"
				action="?/note"
				class="h-form"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
			>
				<label class="h-label" for="note">Your note</label>
				<textarea
					id="note"
					name="note"
					class="h-textarea"
					rows="3"
					placeholder="Big purchases, a pay change, anything you’ll want to remember"
					>{data.note ?? ''}</textarea
				>
				{#if data.status === 'locked'}
					<input
						class="h-input"
						name="reason"
						placeholder="Why it changed (optional, kept in the history)"
						aria-label="Reason for the change"
					/>
				{/if}
				<div class="h-actions">
					<button class="btn">Save note</button>
					{#if form?.noteSaved}<span class="h-ok" role="status">Saved</span>{/if}
					{#if form?.noteError}<span class="h-error" role="alert">{form.noteError}</span>{/if}
				</div>
			</form>
		</section>
	</div>

	<div class="col">
		<section class="card">
			<div class="row-head">
				<span class="lbl">Each account at month end</span>
			</div>
			{#each data.rows as r (r.id)}
				<div class="acct">
					<div class="acct-row">
						<span class="dot" style="background: {r.colour}"></span>
						<a class="grow name" href="/accounts/{r.id}">{r.name}</a>
						<span class="num strong">{r.valueCents == null ? '—' : owed(r.valueCents, r.side)}</span
						>
						{#if data.status === 'locked'}
							<button
								class="edit"
								aria-expanded={editing === r.id}
								aria-label="Correct {r.name}"
								onclick={() => (editing = editing === r.id ? null : r.id)}>Edit</button
							>
						{/if}
					</div>
					{#if editing === r.id}
						<form
							method="POST"
							action="?/value"
							class="h-form fix"
							use:enhance={() =>
								({ update }) => {
									editing = null;
									return update();
								}}
						>
							<input type="hidden" name="accountId" value={r.id} />
							<label class="h-label"
								>{r.side === 'liability' ? 'Owed' : 'Value'} on the last day
								<span class="h-money"
									><span class="cur">$</span><input
										name="value"
										inputmode="decimal"
										value={r.valueCents == null ? '' : (r.valueCents / 100).toFixed(2)}
									/></span
								></label
							>
							<label class="h-label"
								>Why <input
									class="h-input"
									name="reason"
									required
									placeholder="e.g. statement came in lower"
								/></label
							>
							<div class="h-actions">
								<button class="btn primary">Save correction</button>
								<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
							</div>
						</form>
					{/if}
					{#if form?.valueError && form.accountId === r.id}<p class="h-error" role="alert">
							{form.valueError}
						</p>{/if}
				</div>
			{/each}
		</section>

		<section class="card">
			<span class="lbl">Edit history</span>
			{#if data.edits.length}
				<ul class="edits">
					{#each data.edits as e (e.id)}
						<li>
							<div class="e-top">
								<strong>{e.what}</strong><span class="sub small">{shortDateTime(e.at)}</span>
							</div>
							<span class="sub num"
								>{isMoneyField(e.field)
									? `${money(e.oldValue)} → ${money(e.newValue)}`
									: `“${e.oldValue ?? ''}” → “${e.newValue ?? ''}”`}</span
							>
							{#if e.reason}<span class="small">{e.reason}</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="sub">No changes since it was {data.status === 'locked' ? 'locked' : 'opened'}.</p>
			{/if}
		</section>

		<nav class="pn" aria-label="Other months">
			{#if data.prev}<a class="btn" href="/months/{data.prev}">← {monthName(data.prev)}</a
				>{:else}<span></span>{/if}
			{#if data.next}<a class="btn" href="/months/{data.next}">{monthName(data.next)} →</a>{/if}
		</nav>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
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
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
			column-gap: 20px;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
	}
	.summary {
		gap: 4px;
	}
	.summary .btn {
		margin-top: 12px;
	}
	.mine {
		font-size: 34px;
		font-weight: 750;
		padding: 4px 0 8px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 0;
		border-top: 1px solid var(--surface-2);
		font-size: 15px;
	}
	.line.total {
		border-top-color: var(--border-strong);
	}
	.strong {
		font-weight: 600;
	}
	.est {
		color: var(--estimate);
	}
	.small {
		font-size: 12px;
	}
	.row-head {
		margin-bottom: 4px;
	}
	.acct {
		border-top: 1px solid var(--surface-2);
	}
	.acct:first-of-type {
		border-top: 0;
	}
	.acct-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		flex: none;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.name {
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.name:hover {
		color: var(--link);
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
	.edits {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.edits li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 0;
		border-top: 1px solid var(--surface-2);
	}
	.edits li:first-child {
		border-top: 0;
	}
	.e-top {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	p {
		margin: 0;
	}
	.pn {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
