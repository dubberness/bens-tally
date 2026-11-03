<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import { formatMoney } from '$lib/money';
	import { monthLabel, monthName, shortDate, weekdayOf } from '$lib/time';

	let { data } = $props();
	const v = $derived(data.view);
	const usd = (c: number) => formatMoney(c);
	const palette = [
		'var(--c-cash)',
		'var(--accent)',
		'var(--gain)',
		'var(--c-etf)',
		'var(--c-super)',
		'var(--c-home)'
	];
	const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	const payChecks = $derived(
		data.checks.filter((c) => c.key === 'budget:pay-split' || c.key.startsWith('budget:saver:'))
	);
	const otherChecks = $derived(data.checks.filter((c) => !payChecks.includes(c)));
	const planned = $derived(v.pay.splits.filter((s) => s.planCents != null && s.planCents > 0));
	const regular = $derived(v.pay.regular);
	const cadence = $derived(
		!regular
			? ''
			: regular.frequency === 'week'
				? `Every ${WEEKDAYS[regular.weekday]}`
				: regular.frequency === 'fortnight'
					? `Every second ${WEEKDAYS[regular.weekday]}`
					: 'Each month'
	);

	/** Bar for one line: fill is the actual, the tick is the plan. */
	function bar(actual: number, plan: number) {
		const max = Math.max(actual, plan, 1);
		return {
			fill: (100 * Math.max(actual, 0)) / max,
			tick: plan > 0 ? (100 * plan) / max : null,
			state: plan === 0 ? 'none' : actual > plan ? 'over' : 'ok'
		};
	}
	function detail(l: (typeof v.lines)[number]) {
		if (!l.count)
			return l.planCents
				? `Nothing${v.month === data.current ? ' yet' : ''} this month`
				: 'No transactions';
		const top = l.merchants
			.slice(0, 4)
			.map((m) => (m.count > 1 ? `${m.name} ×${m.count}` : m.name));
		const more = l.merchants.length - top.length;
		return top.join(', ') + (more > 0 ? ` and ${more} more` : '');
	}
	function gap(actual: number, plan: number) {
		if (!plan) return '';
		const d = actual - plan;
		if (Math.abs(d) < 50) return 'On plan';
		return d > 0 ? `${usd(d)} over` : `${usd(-d)} to spare`;
	}
	const others = $derived(
		v.keptLines.filter((l) => !v.leftOut.some((g) => g.key === l.keptAction))
	);
	const leftOutText = $derived(
		v.leftOut.length
			? `Leaves out ${v.leftOut.map((l) => `${l.title.toLowerCase()} ${usd(l.cents)}`).join(', ')}.`
			: ''
	);
	const listHref = (target: string) =>
		`/budget/list?for=${encodeURIComponent(target)}&m=${v.month}`;
</script>

<svelte:head><title>Budget · Ben's Tally</title></svelte:head>

<header class="head">
	<h1 class="disp page-title">Budget</h1>
	<div class="switch">
		{#if v.prev}
			<a class="icon" href="?m={v.prev}" aria-label="Previous month"
				><Icon name="back" size={18} /></a
			>
		{:else}
			<span class="icon off" aria-hidden="true"><Icon name="back" size={18} /></span>
		{/if}
		<span class="cur">{monthLabel(v.month)}</span>
		{#if v.next}
			<a class="icon" href="?m={v.next}" aria-label="Next month"><Icon name="next" size={18} /></a>
		{:else}
			<span class="icon off" aria-hidden="true"><Icon name="next" size={18} /></span>
		{/if}
	</div>
</header>

<div class="grid">
	{#if otherChecks.length}
		<section class="card a-checks" aria-label="Needs attention">
			<span class="lbl" style="color: var(--estimate)">Needs attention</span>
			{#each otherChecks as c (c.key)}
				<div class="row">
					<span class="grow">{c.message}</span>
					{#if c.fixHref}<a class="btn small" href={c.fixHref}>{c.fixLabel ?? 'Fix'}</a>{/if}
					<form method="POST" action="?/dismiss" use:enhance>
						<input type="hidden" name="key" value={c.key} />
						<input type="hidden" name="fingerprint" value={c.fingerprint} />
						<button class="x" aria-label="Dismiss: {c.message}">✕</button>
					</form>
				</div>
			{/each}
		</section>
	{/if}

	<div class="col">
		<section class="card a-pay">
			<span class="lbl">Pay day split</span>
			{#if regular}
				<p class="line">
					{cadence}
					<span class="num strong">{formatMoney(regular.regularCents, { cents: true })}</span>
					lands from {regular.source}.
				</p>
			{:else}
				<p class="line sub">
					No regular pay found yet. Make a rule that counts your pay as income and it shows here.
				</p>
			{/if}
			{#if planned.length}
				<div class="stack" role="img" aria-label="How the planned pay is split between savers">
					{#each planned as s, i (s.accountId)}
						<span
							style="width: {(100 * (s.planCents ?? 0)) /
								(v.pay.totalCents || 1)}%; background: {s.colour ?? palette[i % palette.length]}"
						></span>
					{/each}
				</div>
			{/if}
			<div class="tiles">
				{#each v.pay.splits as s, i (s.accountId)}
					<div class="tile">
						<span class="sub tname"
							><span class="dot" style="background: {s.colour ?? palette[i % palette.length]}"
							></span>{s.name}</span
						>
						<span class="num strong">{s.planCents == null ? '—' : usd(s.planCents)}</span>
						{#if s.accountId !== regular?.accountId}<span class="sub small"
								>really {usd(s.realCents)}</span
							>{:else}<span class="sub small">stays where pay lands</span>{/if}
					</div>
				{:else}
					<p class="sub">No pay split yet. Add one in the budget editor.</p>
				{/each}
			</div>
			{#if payChecks.length}
				<div class="alert" role="status">
					<strong>Your plan needs a refresh</strong>
					{#each payChecks as c (c.key)}<span class="sub">{c.message}</span>{/each}
					<form method="POST" action="/budget/edit?/matchReal" use:enhance>
						<button class="btn warm">Update the plan</button>
					</form>
				</div>
			{/if}
		</section>

		<section class="card a-spend">
			<span class="lbl">Living spend</span>
			<span class="disp num big">{usd(v.summary.spendingCents)}</span>
			<span class="sub"
				>{leftOutText}
				{#if v.planSet}Plan amounts come from your budget lines, last set in {monthName(
						v.planSet
					)}.{/if}</span
			>
			{#if v.summary.incomeCents > 0}
				<div class="mini">
					<span class="sub"
						>Income <span class="num strong">{usd(v.summary.incomeCents)}</span></span
					>
					{#if v.summary.savingsRate != null}
						<span class="sub"
							>Savings rate <span class="num strong"
								>{Math.round(v.summary.savingsRate * 100)}%</span
							></span
						>
					{/if}
				</div>
			{/if}
			<div class="lines">
				{#each v.lines as l (l.id)}
					{@const b = bar(l.actualCents, l.planCents)}
					<a class="cat" href={listHref(`line:${l.id}`)}>
						<span class="top">
							<span class="nm">{l.name}</span>
							<span class="num"
								><span class="strong">{usd(l.actualCents)}</span><span class="sub">
									{l.planCents ? `of ${usd(l.planCents)}` : 'no plan'}</span
								></span
							>
						</span>
						<span class="track" aria-hidden="true">
							<span class="fill {b.state}" style="width: {b.fill}%"></span>
							{#if b.tick != null}<span class="tick" style="left: calc({b.tick}% - 1px)"
								></span>{/if}
						</span>
						<span class="sub small"
							>{detail(l)}{gap(l.actualCents, l.planCents)
								? ` · ${gap(l.actualCents, l.planCents)}`
								: ''}</span
						>
					</a>
				{/each}
				{#if v.unassignedOut.cents > 0}
					<a class="cat" href={listHref('none')}>
						<span class="top">
							<span class="nm">Not sorted yet</span>
							<span class="num strong">{usd(v.unassignedOut.cents)}</span>
						</span>
						<span class="sub small"
							>{v.unassignedOut.count} transaction{v.unassignedOut.count === 1 ? '' : 's'}: {v.unassignedOut.merchants
								.slice(0, 4)
								.map((m) => m.name)
								.join(', ')}{v.unassignedOut.merchants.length > 4 ? '…' : ''}. Already counted
							above.</span
						>
					</a>
				{/if}
				{#if !v.lines.length}
					<p class="sub">
						No budget lines yet. Load the sheet in Manage, or add lines in the editor.
					</p>
				{/if}
			</div>
			<form method="POST" action="?/oneOffs" use:enhance class="oneoff">
				<input type="hidden" name="on" value={v.includeOneOffs ? '0' : '1'} />
				<button class="btn">{v.includeOneOffs ? 'Leave one-offs out' : 'Count one-offs in'}</button>
				<span class="sub small"
					>{v.includeOneOffs
						? 'One-offs are counted in the total.'
						: 'One-offs are left out of the total.'}</span
				>
			</form>
		</section>
	</div>
	<div class="col">
		{#if v.leftOut.length || v.keptLines.length}
			<section class="card a-out">
				<span class="lbl">Left out of living spend</span>
				{#each v.leftOut as g (g.key)}
					{@const target = g.key.startsWith('person:') ? g.key : `action:${g.key}`}
					{@const covered = v.keptLines.filter((l) => l.keptAction === g.key)}
					<a class="row out" href={listHref(target)}>
						<span class="grow">
							<span class="nm">{g.title}</span>
							<span class="sub small"
								>{g.merchants
									.slice(0, 4)
									.map((m) => m.name)
									.join(', ')}</span
							>
						</span>
						<span class="num strong">{usd(g.cents)}</span>
					</a>
					{#each covered as l (l.id)}
						<a class="row sub-line" href={listHref(`line:${l.id}`)}>
							<span class="grow">
								<span class="small">{l.name}</span>
								<span class="sub small"
									>{l.planCents ? `plan ${usd(l.planCents)} a month` : 'no plan'} · {usd(
										l.keptCents
									)} this month</span
								>
							</span>
						</a>
					{/each}
				{/each}
				{#if others.length}
					<span class="lbl plan-head">Plan lines for these</span>
					{#each others as l (l.id)}
						<a class="row sub-line" href={listHref(`line:${l.id}`)}>
							<span class="grow">
								<span class="small">{l.name}</span>
								<span class="sub small"
									>{l.planCents ? `plan ${usd(l.planCents)} a month` : 'no plan'} · {usd(
										l.keptCents + l.actualCents
									)} this month</span
								>
							</span>
						</a>
					{/each}
				{/if}
			</section>
		{/if}

		{#if v.yearly}
			<section class="card a-yearly">
				<div class="between">
					<span class="lbl">Yearly bills fund</span>
					<span class="num sub">{usd(v.yearly.inCents)} / month in</span>
				</div>
				<p class="line">
					Paid out <span class="num strong">{usd(v.yearly.paidCents)}</span> this month · balance
					<span class="num strong" class:loss={v.yearly.balanceCents < 0}
						>{usd(v.yearly.balanceCents)}</span
					>
				</p>
				{#if v.yearly.paid.length}
					<span class="sub"
						>{v.yearly.paid.map((m) => `${m.name} ${usd(m.cents)}`).join(' · ')}</span
					>
				{/if}
				{#if v.yearly.due.length}
					<span class="sub small"
						>Usually due this month: {v.yearly.due
							.map((d) => `${d.name} ${usd(d.yearlyCents)}`)
							.join(' · ')}</span
					>
				{/if}
				{#if v.yearly.since}<span class="sub small"
						>Counted from {monthLabel(v.yearly.since)}; change the opening balance in the editor.</span
					>{/if}
			</section>
		{/if}

		{#each v.people as p (p.label)}
			<a class="card person a-people" href={listHref(`person:${p.label}`)}>
				<div class="ico" aria-hidden="true">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"></path></svg
					>
				</div>
				<div class="pbody">
					<div class="between">
						<span class="strong">Paid for {p.label}</span>
						<span class="num strong">{usd(p.outCents)}</span>
					</div>
					<span class="sub"
						>{p.merchants
							.slice(0, 4)
							.map((m) => `${m.name} ${usd(m.cents)}`)
							.join(' · ')}. Kept out of your spending.{p.inCents
							? ` ${usd(p.inCents)} came back in.`
							: ''}</span
					>
				</div>
			</a>
		{/each}

		{#if v.unassigned.length}
			<section class="card a-un">
				<div class="between">
					<span class="lbl">Waiting for a line or a rule</span>
					<a class="sub" href={listHref('none')}>See all</a>
				</div>
				{#each v.unassigned.slice(0, 8) as t (t.id)}
					<div class="row">
						<span class="grow">
							<span class="nm">{t.description}</span>
							<span class="sub small">{shortDate(t.date)}</span>
						</span>
						<span class="num" class:gain={t.amountCents > 0}
							>{formatMoney(t.amountCents, { cents: true })}</span
						>
						<a
							class="btn small"
							href="/manage/rules/new?merchant={encodeURIComponent(t.description)}">Make a rule</a
						>
					</div>
				{/each}
			</section>
		{/if}
	</div>

	<div class="a-edit">
		<a class="btn primary" href="/budget/edit">Edit lines, pay split and yearly bills</a>
		<a class="btn" href="/manage/rules">Rules</a>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.page-title {
		margin: 0;
		font-size: 34px;
		letter-spacing: -0.02em;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.cur {
		font-weight: 600;
		min-width: 76px;
		text-align: center;
	}
	.icon {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--chip-text);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.icon.off {
		opacity: 0.35;
	}
	.grid {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			align-items: start;
		}
		.a-checks,
		.a-edit {
			grid-column: 1 / -1;
		}
	}
	.col {
		display: contents;
	}
	@media (min-width: 900px) {
		.col {
			display: flex;
			flex-direction: column;
			gap: 12px;
			min-width: 0;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	p {
		margin: 0;
	}
	form {
		margin: 0;
	}
	.strong {
		font-weight: 700;
	}
	.small {
		font-size: 12px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.nm {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.between {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.line {
		font-size: 15px;
	}
	.big {
		font-size: 40px;
		line-height: 1.05;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.stack {
		display: flex;
		height: 14px;
		border-radius: 999px;
		overflow: hidden;
		gap: 2px;
	}
	.stack span {
		display: block;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tname {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
	}
	.alert {
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		border-radius: 16px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--link);
	}
	.alert .sub {
		color: var(--warn-text);
	}
	.btn.warm {
		align-self: flex-start;
		background: transparent;
		border-color: var(--warn-border);
		color: var(--link);
	}
	.mini {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	.lines {
		display: flex;
		flex-direction: column;
		margin-top: 4px;
	}
	.cat {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 12px 0;
		border-top: 1px solid var(--surface-2);
		color: var(--text);
		text-decoration: none;
		min-height: 44px;
	}
	.cat:first-child {
		border-top: 0;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.track {
		position: relative;
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
	}
	.fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 999px;
	}
	.fill.ok {
		background: var(--gain);
	}
	.fill.over {
		background: var(--loss);
	}
	.fill.none {
		background: var(--text-3);
	}
	.tick {
		position: absolute;
		top: -3px;
		width: 2px;
		height: 14px;
		border-radius: 2px;
		background: var(--text);
	}
	.oneoff {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.out {
		color: var(--text);
		text-decoration: none;
		min-height: 52px;
	}
	.sub-line {
		color: var(--text);
		text-decoration: none;
		padding: 6px 0 6px 18px;
		min-height: 44px;
		border-top: 0;
		border-left: 2px solid var(--surface-2);
		margin-left: 4px;
	}
	.plan-head {
		margin-top: 8px;
	}
	.person {
		flex-direction: row;
		gap: 14px;
		align-items: flex-start;
		background: var(--info-bg);
		border-color: var(--info-border);
		color: var(--text);
		text-decoration: none;
	}
	.ico {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--info-soft);
		color: var(--c-cash);
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
	}
	.pbody {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}
	.btn.small {
		min-height: 44px;
		padding: 0 14px;
		font-size: 13px;
	}
	.x {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 0;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
	}
	.a-edit {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
