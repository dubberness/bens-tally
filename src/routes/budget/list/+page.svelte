<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import TxRow from '$lib/components/budget/TxRow.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { monthName } from '$lib/time';

	let { data, form } = $props();
</script>

<svelte:head><title>{data.title} · Budget · Ben's Tally</title></svelte:head>

<a class="h-back" href="/budget?m={data.month}"><Icon name="back" size={18} /> Budget</a>
<h1 class="disp h-title">{data.title}</h1>

<section class="card">
	<p class="sub">
		{monthName(data.month)} · {data.count} transaction{data.count === 1 ? '' : 's'} · net
		<span class="num">{formatMoney(data.total, { cents: true })}</span>. Change one to move it to
		another line or keep it out of your spending; “always do this” makes a rule for that merchant.
	</p>
	{#each data.rows as tx (tx.id)}
		<TxRow
			{tx}
			lines={data.lines}
			labels={data.labels}
			actions={data.actions}
			message={form && 'id' in form && form.id === tx.id
				? form.error
					? undefined
					: 'rule' in form
						? 'Rule made'
						: 'Saved'
				: undefined}
		/>
		{#if form && 'id' in form && form.id === tx.id && 'error' in form && form.error}
			<p class="h-error" role="alert">{form.error}</p>
		{/if}
	{:else}
		<p class="sub">Nothing here this month.</p>
	{/each}
	{#if data.more}<p class="sub">And {data.more} more not shown.</p>{/if}
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 720px;
	}
	p {
		margin: 0;
	}
</style>
