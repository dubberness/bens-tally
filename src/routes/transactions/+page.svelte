<script lang="ts">
	import { page } from '$app/state';
	import { formatMoney } from '$lib/money';
	import { monthLabel } from '$lib/time';

	let { data } = $props();

	const today = new Date();
	const dayLabel = (d: string) =>
		new Intl.DateTimeFormat('en-AU', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: d.slice(0, 4) === String(today.getFullYear()) ? undefined : 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${d}T00:00:00Z`));
	const slug = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
	const actionLabel: Record<string, string> = {
		budget: 'Budget',
		other_person: 'Someone else',
		transfer: 'Transfer',
		income: 'Income',
		one_off: 'One-off',
		investing: 'Investing',
		repayment: 'Repayment'
	};

	// Rows grouped under a heading per day, newest first.
	const days = $derived.by(() => {
		const out: { date: string; rows: typeof data.rows }[] = [];
		for (const r of data.rows) {
			if (out.at(-1)?.date !== r.date) out.push({ date: r.date, rows: [] });
			out.at(-1)!.rows.push(r);
		}
		return out;
	});

	const pageHref = (n: number) => {
		const u = new URL(page.url);
		if (n <= 1) u.searchParams.delete('page');
		else u.searchParams.set('page', String(n));
		return u.pathname + u.search;
	};
	const filtered = $derived(!!(data.filters.q || data.filters.accountId || data.filters.month));
</script>

<svelte:head><title>Transactions · Ben's Tally</title></svelte:head>

<h1 class="disp page-title">Transactions</h1>

<form class="card filters" method="GET" role="search">
	<label class="search">
		<span class="sr-only">Search</span>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
			><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path></svg
		>
		<input
			type="search"
			name="q"
			value={data.filters.q}
			placeholder="Merchant, category, tag or amount"
		/>
	</label>
	<div class="selects">
		<label>
			<span class="sr-only">Account</span>
			<select name="account">
				<option value="">All accounts</option>
				{#each data.accounts as a (a.id)}
					<option value={a.id} selected={a.id === data.filters.accountId}>{a.name}</option>
				{/each}
			</select>
		</label>
		<label>
			<span class="sr-only">Month</span>
			<select name="month">
				<option value="">Any month</option>
				{#each data.months as m (m)}
					<option value={m} selected={m === data.filters.month}>{monthLabel(m)}</option>
				{/each}
			</select>
		</label>
		<button class="btn primary">Show</button>
	</div>
</form>

<p class="sub count">
	{data.total.toLocaleString('en-AU')}
	{data.total === 1 ? 'transaction' : 'transactions'}{filtered ? ' match' : ''}
	{#if filtered}· <a href="/transactions">Clear</a>{/if}
</p>

{#if data.rows.length === 0}
	<section class="card">
		<p class="sub">
			{filtered ? 'Nothing matches.' : 'No transactions yet. They arrive with the first Up sync.'}
		</p>
	</section>
{:else}
	<div class="days">
		{#each days as d (d.date)}
			<section class="card day">
				<h2 class="lbl">{dayLabel(d.date)}</h2>
				<ul>
					{#each d.rows as t (t.id)}
						<li class="row tx">
							<div class="grow">
								<span class="desc">
									{t.description}
									{#if t.status === 'HELD'}<span class="badge held">Pending</span>{/if}
								</span>
								<span class="sub small meta">
									{[
										t.accountName,
										t.transferAccountName ? `to/from ${t.transferAccountName}` : null,
										t.category ? slug(t.category) : null,
										t.foreign
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
								{#if t.message || t.tags.length || t.assignment}
									<span class="chips">
										{#if t.assignment}
											<span class="badge line"
												>{t.assignment.budgetLineName ??
													actionLabel[t.assignment.action] ??
													t.assignment.action}</span
											>
										{/if}
										{#each t.tags as tag (tag)}<span class="badge">#{tag}</span>{/each}
										{#if t.message}<span class="sub small">“{t.message}”</span>{/if}
									</span>
								{/if}
							</div>
							<div class="amount">
								<span class="num amt" class:gain={t.amountCents > 0}
									>{formatMoney(t.amountCents, { cents: true, sign: t.amountCents > 0 })}</span
								>
								{#if t.roundUpCents}
									<span class="sub small num"
										>{formatMoney(t.roundUpCents, { cents: true })} round-up</span
									>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>

	{#if data.pages > 1}
		<nav class="pager" aria-label="Pages">
			{#if data.page > 1}
				<a class="btn" href={pageHref(data.page - 1)} rel="prev">Newer</a>
			{:else}
				<span></span>
			{/if}
			<span class="sub num">Page {data.page} of {data.pages}</span>
			{#if data.page < data.pages}
				<a class="btn" href={pageHref(data.page + 1)} rel="next">Older</a>
			{:else}
				<span></span>
			{/if}
		</nav>
	{/if}
{/if}

<style>
	.page-title {
		font-size: 34px;
		font-weight: 750;
		letter-spacing: -0.02em;
		margin: 4px 0 14px;
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--r-tile);
		background: var(--inset);
		border: 1px solid var(--border);
		color: var(--text-3);
	}
	.search input {
		flex: 1;
		min-width: 0;
		min-height: 42px;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		outline: none;
	}
	.search:focus-within {
		border-color: var(--accent);
	}
	.selects {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 8px;
	}
	.selects label {
		min-width: 0;
		display: flex;
	}
	select {
		width: 100%;
		min-width: 0;
		min-height: 44px;
		border-radius: var(--r-tile);
		border: 1px solid var(--border);
		background: var(--inset);
		color: var(--text);
		font: inherit;
		padding: 0 8px;
	}
	.count {
		margin: 12px 4px 8px;
	}
	.days {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.day {
		padding-top: 14px;
		padding-bottom: 6px;
	}
	.day h2 {
		display: block;
		margin-bottom: 2px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tx {
		align-items: flex-start;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.desc {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.held {
		color: var(--estimate);
		margin-left: 4px;
		vertical-align: 1px;
	}
	.meta {
		overflow-wrap: anywhere;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.line {
		color: var(--link);
	}
	.amount {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		text-align: right;
	}
	.amt {
		font-weight: 700;
		white-space: nowrap;
	}
	.small {
		font-size: 12px;
	}
	p {
		margin: 0;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 14px 0 4px;
	}
	@media (max-width: 420px) {
		.selects {
			grid-template-columns: 1fr 1fr;
		}
		.selects .btn {
			grid-column: 1 / -1;
		}
	}
	@media (min-width: 900px) {
		/* A list of one-line rows reads badly when it runs the full width of a wide screen. */
		.page-title,
		.filters,
		.count,
		.days,
		.pager {
			max-width: 820px;
		}
		.filters {
			flex-direction: row;
			align-items: center;
		}
		.search {
			flex: 1;
		}
		.selects {
			grid-template-columns: 200px 160px auto;
		}
	}
</style>
