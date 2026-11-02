<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { formatMoney } from '$lib/money';
	import { shortDateTime } from '$lib/time';

	let { data, form } = $props();
	let busy = $state<string | null>(null);

	const running = $derived(data.progress !== null);
	const typeLabel: Record<string, string> = {
		TRANSACTIONAL: 'Spending',
		SAVER: 'Saver',
		HOME_LOAN: 'Home loan'
	};
	const day = (d: string) =>
		new Intl.DateTimeFormat('en-AU', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${d}T00:00:00Z`));

	// While a sync runs in the background, refresh every few seconds.
	$effect(() => {
		if (!running) return;
		const t = setInterval(() => void invalidateAll(), 3000);
		return () => clearInterval(t);
	});

	const submit = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = null;
		};
	};
</script>

<svelte:head><title>Up Bank · Ben's Tally</title></svelte:head>

<a class="back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp page-title">Up Bank</h1>

<div class="grid">
	<section class="card">
		<div class="head">
			<span class="lbl">Connection</span>
			{#if data.tokenSet}
				<span class="badge ok">Token set</span>
			{:else}
				<span class="badge bad">No token</span>
			{/if}
		</div>
		{#if !data.tokenSet}
			<p class="sub">
				Make a personal access token at api.up.com.au, then add it to the container as the
				<span class="num">UP_TOKEN</span> variable and restart it. The token is only ever used to read;
				the app can't move money.
			</p>
		{:else}
			<div class="facts">
				<div class="tile">
					<span class="sub small">Last sync</span>
					{#if running}
						<span class="fact">Running… {data.progress} read</span>
					{:else if data.lastSync}
						<span class="fact" class:loss={data.lastSync.ok === false}
							>{shortDateTime(data.lastSync.at)}{data.lastSync.ok === false
								? ' · failed'
								: ''}</span
						>
					{:else}
						<span class="fact">Never</span>
					{/if}
				</div>
				<div class="tile">
					<span class="sub small">History</span>
					<span class="fact">{data.backfillDone ? 'All loaded' : 'Not loaded yet'}</span>
				</div>
			</div>
			{#if data.lastSync?.message && !running}
				<p class="sub small msg" class:loss={data.lastSync.ok === false}>{data.lastSync.message}</p>
			{/if}
			{#if data.lastSync?.ok === false && data.lastOkAt}
				<p class="sub small">Last good sync {shortDateTime(data.lastOkAt)}.</p>
			{/if}
			<p class="sub small">
				Syncs every 15 minutes and once more at 11:59 pm on the last day of the month. The first
				sync reads the whole history, which takes a minute or two.
			</p>
			<div class="actions">
				<form method="POST" action="?/sync" use:enhance={submit('sync')}>
					<button class="btn primary" disabled={busy !== null || running}
						>{busy === 'sync' || running ? 'Syncing…' : 'Sync now'}</button
					>
				</form>
				<form method="POST" action="?/sync" use:enhance={submit('full')}>
					<input type="hidden" name="full" value="yes" />
					<button class="btn" disabled={busy !== null || running}>Re-read all history</button>
				</form>
			</div>
		{/if}
		{#if form?.message}
			<p
				class="sub small"
				class:loss={!(
					'started' in form ||
					'synced' in form ||
					'relinked' in form ||
					'read' in form
				)}
				role="status"
			>
				{form.message}
			</p>
		{/if}
	</section>

	<section class="card">
		<div class="head">
			<span class="lbl">Month-end readings</span>
			{#if data.monthEnd}<span class="sub small">{shortDateTime(data.monthEnd.at)}</span>{/if}
		</div>
		<p class="sub">
			At 11:59 pm on the last day of each month the app records the balance of every account that
			updates itself: Up savers, the ETFs and calculated accounts. Closing the month uses these.
		</p>
		{#if data.monthEnd?.message}
			<p class="sub small msg" class:loss={data.monthEnd.ok === false}>{data.monthEnd.message}</p>
		{/if}
		<form method="POST" action="?/monthEnd" use:enhance={submit('monthEnd')}>
			<button class="btn" disabled={busy !== null}
				>{busy === 'monthEnd' ? 'Reading…' : `Read ${data.lastEndedMonth} now`}</button
			>
		</form>
		<p class="sub small">Accounts that already have a balance for that day are left as they are.</p>
	</section>

	<section class="card wide">
		<div class="head">
			<span class="lbl">Accounts</span>
			<a class="sub small" href="/transactions">All transactions ›</a>
		</div>
		{#if data.upAccounts.length === 0}
			<p class="sub">No Up accounts yet. They appear after the first sync.</p>
		{/if}
		<div class="list">
			{#each data.upAccounts as u (u.id)}
				<div class="acct">
					<div class="acct-top">
						<div class="grow">
							<span class="name">{u.name}</span>
							<span class="sub small">
								{typeLabel[u.type] ?? u.type}{u.ownership === 'JOINT' ? ' · joint' : ''} ·
								<a href="/transactions?account={u.account?.id ?? ''}"
									>{u.count.toLocaleString('en-AU')} transactions</a
								>{u.earliest ? ` since ${day(u.earliest)}` : ''}
							</span>
						</div>
						<span class="num amt" class:loss={u.balanceCents < 0}
							>{formatMoney(u.balanceCents, { cents: true })}</span
						>
					</div>
					<form
						method="POST"
						action="?/relink"
						class="relink"
						use:enhance={submit(`relink-${u.id}`)}
					>
						<input type="hidden" name="up" value={u.id} />
						<label class="sub small" for="t-{u.id}">Counts as</label>
						<select id="t-{u.id}" name="target">
							{#each u.options as o (o.id)}
								<option value={o.id} selected={o.id === u.account?.id}>{o.name}</option>
							{/each}
							<option value="new">New account named “{u.name}”</option>
						</select>
						<button class="btn" disabled={busy !== null}>Save</button>
					</form>
				</div>
			{/each}
		</div>
	</section>
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
	.page-title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
	}
	.grid {
		display: grid;
		gap: 12px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.msg {
		overflow-wrap: anywhere;
	}
	.facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fact {
		font-weight: 600;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	form {
		margin: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.acct {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--surface-2);
	}
	.acct:first-child {
		border-top: 0;
	}
	.acct-top {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-weight: 600;
	}
	.amt {
		font-weight: 700;
		white-space: nowrap;
	}
	.relink {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	select {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		border-radius: var(--r-tile);
		border: 1px solid var(--border);
		background: var(--inset);
		color: var(--text);
		font: inherit;
		padding: 0 10px;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
</style>
