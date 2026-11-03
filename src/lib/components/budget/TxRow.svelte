<script lang="ts">
	import { enhance } from '$app/forms';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';
	import { ACTION_LABELS, type Action } from '$lib/budget/rules';

	interface Tx {
		id: string;
		date: string;
		description: string;
		amountCents: number;
		accountName: string | null;
		action: Action | null;
		budgetLineId: number | null;
		label: string | null;
		byHand: boolean;
		ruleName: string | null;
	}
	let {
		tx,
		lines,
		labels,
		actions,
		message
	}: {
		tx: Tx;
		lines: { id: number; name: string }[];
		labels: string[];
		actions: { value: string; label: string }[];
		message?: string;
	} = $props();

	let open = $state(false);
	let to = $state('');
	const lineName = (id: number | null) => lines.find((l) => l.id === id)?.name;
	const status = $derived(
		tx.action == null
			? 'Not sorted'
			: tx.action === 'budget'
				? (lineName(tx.budgetLineId) ?? 'Budget line')
				: tx.action === 'other_person'
					? `Paid for ${tx.label ?? 'someone else'}`
					: ACTION_LABELS[tx.action]
	);
	const source = $derived(
		tx.action == null ? '' : tx.byHand ? 'your choice' : (tx.ruleName ?? 'a rule')
	);
</script>

<div class="tx">
	<div class="row top">
		<span class="grow">
			<span class="d">{tx.description}</span>
			<span class="sub small"
				>{shortDate(tx.date)}{tx.accountName ? ` · ${tx.accountName}` : ''}</span
			>
		</span>
		<span class="num" class:gain={tx.amountCents > 0}
			>{formatMoney(tx.amountCents, { cents: true })}</span
		>
	</div>
	<div class="meta">
		<span class="badge" class:bad={tx.action == null}>{status}</span>
		{#if source}<span class="sub small">via {source}</span>{/if}
		<button class="link" type="button" aria-expanded={open} onclick={() => (open = !open)}
			>{open ? 'Close' : 'Change'}</button
		>
		{#if message}<span class="h-ok" role="status">{message}</span>{/if}
	</div>
	{#if open}
		<form
			method="POST"
			class="h-form edit"
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
		>
			<input type="hidden" name="id" value={tx.id} />
			<label class="h-label"
				>Count this as
				<select class="h-select" name="to" bind:value={to} required>
					<option value="">Choose…</option>
					<optgroup label="Budget line">
						{#each lines as l (l.id)}<option value="budget:{l.id}">{l.name}</option>{/each}
					</optgroup>
					<optgroup label="Kept out of living spend">
						{#each labels as l (l)}<option value="other_person:{l}">Paid for {l}</option>{/each}
						<option value="other_person:">Paid for someone new…</option>
						{#each actions.filter((a) => a.value !== 'other_person') as a (a.value)}
							<option value={a.value}>{a.label}</option>
						{/each}
					</optgroup>
				</select></label
			>
			{#if to === 'other_person:'}
				<label class="h-label"
					>Whose is it? <input class="h-input" name="newLabel" required /></label
				>
			{/if}
			<div class="h-actions">
				<button class="btn primary" formaction="?/assign">Just this one</button>
				<button class="btn" formaction="?/always">Always do this for “{tx.description}”</button>
				{#if tx.byHand}<button class="btn" formaction="?/clear" formnovalidate
						>Back to the rules</button
					>{/if}
			</div>
		</form>
	{/if}
</div>

<style>
	.tx {
		border-top: 1px solid var(--surface-2);
		padding: 4px 0 10px;
	}
	.tx:first-child {
		border-top: 0;
	}
	.top {
		border-top: 0;
		padding-bottom: 4px;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.d {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.small {
		font-size: 12px;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.link {
		background: none;
		border: 0;
		color: var(--link);
		font: 600 13px var(--font-body);
		min-height: 44px;
		padding: 0 8px;
		cursor: pointer;
	}
	.edit {
		padding: 8px 0 4px;
	}
	form {
		margin: 0;
	}
</style>
