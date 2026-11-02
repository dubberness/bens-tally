<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney, parseMoney } from '$lib/money';
	import { monthEnd, monthName, shortDate } from '$lib/time';
	import { owed, signed, tone } from '$lib/components/history/fmt';

	let { data, form } = $props();

	// Typed values and home choices, keyed by account id.
	let typed = $state<Record<number, string>>({});
	let keep = $state<Record<number, boolean>>({});
	let note = $state('');
	let sure = $state(false);
	let busy = $state(false);
	$effect.pre(() => {
		note = data.note ?? '';
		for (const it of data.items) {
			if (it.type === 'manual' && it.enteredCents != null && typed[it.ids[0]] === undefined)
				typed[it.ids[0]] = (it.enteredCents / 100).toFixed(2);
		}
	});

	const name = $derived(data.month ? monthName(data.month, { year: false }) : '');
	const signedOf = (side: string, c: number) => (side === 'liability' ? -c : c);
	const typedCents = (id: number) => {
		const s = typed[id];
		return s && s.trim() ? parseMoney(s) : null;
	};

	const calc = $derived.by(() => {
		let total = data.others;
		let done = 0;
		let guessed = false;
		const warn: Record<number, string> = {};
		for (const it of data.items) {
			const id = it.ids[0];
			if (it.type === 'auto') {
				total += signedOf(it.side, it.valueCents ?? 0);
				done++;
			} else if (it.type === 'estimate') {
				const upd = keep[id] === false;
				const v = upd ? typedCents(id) : it.valueCents;
				total += signedOf(it.side, v ?? it.valueCents ?? 0);
				if (!upd || v != null) done++;
				else guessed = true;
			} else {
				const v = typedCents(id);
				const ref = it.expectedCents ?? it.lastMonthCents ?? it.currentCents;
				if (v != null) {
					done++;
					total += signedOf(it.side, Math.abs(v));
					if (ref && Math.abs(Math.abs(v) - ref) / Math.abs(ref) > data.sureBp / 10_000) {
						const off = Math.round((Math.abs(Math.abs(v) - ref) / Math.abs(ref)) * 100);
						warn[id] =
							`That’s ${off}% from ${it.expectedCents != null ? 'what the schedule expects' : it.lastMonthCents != null ? 'last month' : 'the latest entry'} (${formatMoney(ref)}). Sure?`;
					}
				} else {
					guessed = true;
					total += signedOf(it.side, ref ?? 0);
				}
			}
		}
		return { total, done, guessed, warn, needsSure: Object.keys(warn).length > 0 };
	});
	const delta = $derived(data.prevNetWorth != null ? calc.total - data.prevNetWorth : null);
	const ready = $derived(calc.done === data.items.length && (!calc.needsSure || sure));
</script>

<svelte:head><title>Close the month · Ben's Tally</title></svelte:head>

<a class="h-back" href="/"><Icon name="back" size={18} /> Home</a>

{#if form?.locked}
	<header class="intro">
		<span class="lbl" style="color: var(--accent)">Monthly snapshot</span>
		<h1 class="disp hero-title">{monthName(form.locked, { year: false })} is locked</h1>
	</header>
	<section class="card done-card">
		<div class="locked-msg">
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><rect x="5" y="10.5" width="14" height="10" rx="2" /><path
					d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
				/></svg
			>
			<span
				>{monthName(form.locked, { year: false })} is locked. {form.count} months on record.</span
			>
		</div>
		<a class="more" href="/months/{form.locked}">See it in Months →</a>
	</section>
{:else if !data.month}
	<header class="intro">
		<span class="lbl" style="color: var(--accent)">Monthly snapshot</span>
		<h1 class="disp hero-title">Close the month</h1>
		<p class="sub lead">
			{data.prevMonth
				? `${monthName(data.prevMonth)} is the latest locked month. The next one opens here on its last day.`
				: 'Nothing to close yet. Add accounts or bring in the sheet first.'}
		</p>
	</header>
	<section class="card how">
		<span class="lbl">How it works</span>
		<ol>
			<li>On the last day of the month a banner appears on Home.</li>
			<li>Up balances, Betashares holdings and calculated accounts fill themselves in.</li>
			<li>You type the rest (super, the mortgage) and keep or update the home value.</li>
			<li>
				Add a note, check the net worth, and lock it. Later fixes are kept in the month’s history.
			</li>
		</ol>
		<a class="more" href="/manage/accounts#close">Choose which accounts appear →</a>
	</section>
{:else}
	<header class="intro">
		<span class="lbl" style="color: var(--accent)">Monthly snapshot</span>
		<h1 class="disp hero-title">Close {name}</h1>
		<p class="sub lead">
			Your snapshot for {shortDate(monthEnd(data.month), { year: true })}.
			{data.items.filter((i) => i.type === 'auto').length} of the {data.items.length} numbers came in
			on their own.
		</p>
		<div class="progress" role="img" aria-label="{calc.done} of {data.items.length} numbers in">
			{#each data.items as it, i (it.name + i)}
				<div class="seg" class:on={i < calc.done}></div>
			{/each}
		</div>
	</header>

	<form
		method="POST"
		action="?/lock"
		class="h-form grid"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="month" value={data.month} />
		<div class="col">
			<section class="card steps">
				{#each data.items as it, i (it.name + i)}
					{@const id = it.ids[0]}
					{@const isDone =
						it.type === 'auto' ||
						(it.type === 'estimate' && keep[id] !== false) ||
						(it.type === 'estimate' && typedCents(id) != null) ||
						(it.type === 'manual' && typedCents(id) != null)}
					<div class="step">
						{#if isDone}
							<span class="ok" aria-hidden="true"
								><svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
								></span
							>
						{:else}
							<span class="todo" aria-hidden="true">{i + 1}</span>
						{/if}
						<div class="body">
							{#if it.type === 'auto'}
								<div class="top">
									<span class="strong">{it.name}</span><span class="num strong"
										>{it.valueCents == null ? '—' : owed(it.valueCents, it.side)}</span
									>
								</div>
								<span class="sub">{it.detail}</span>
							{:else if it.type === 'manual'}
								<label for="v_{id}" class="strong">{it.name}</label>
								<span class="sub"
									>{it.expectedCents != null
										? `The repayment schedule expects about ${formatMoney(it.expectedCents)}.`
										: ''}
									{it.lastMonthCents != null
										? `Last month: ${formatMoney(it.lastMonthCents)}.`
										: it.currentCents != null && it.currentAsOf
											? `Latest: ${formatMoney(it.currentCents)} on ${shortDate(it.currentAsOf)}.`
											: ''}
									{it.note}</span
								>
								<div class="h-money field">
									<span class="cur">$</span><input
										id="v_{id}"
										name="v_{id}"
										inputmode="decimal"
										autocomplete="off"
										bind:value={typed[id]}
										placeholder={formatMoney(
											it.expectedCents ?? it.lastMonthCents ?? it.currentCents ?? 0
										).slice(1)}
									/>
								</div>
								{#if calc.warn[id]}<p class="warn" role="status">{calc.warn[id]}</p>{/if}
							{:else}
								<span class="strong">{it.name}</span>
								<span class="sub"
									>Still an estimate. {it.detail !== 'Property' ? it.detail : ''}</span
								>
								<input
									type="hidden"
									name="keep_{id}"
									value={keep[id] === false ? 'update' : 'keep'}
								/>
								<div class="chips">
									<button
										type="button"
										class="h-chip"
										aria-pressed={keep[id] !== false}
										onclick={() => (keep[id] = true)}>Keep {formatMoney(it.valueCents ?? 0)}</button
									>
									<button
										type="button"
										class="h-chip"
										aria-pressed={keep[id] === false}
										onclick={() => (keep[id] = false)}>Update</button
									>
								</div>
								{#if keep[id] === false}
									<div class="h-money field">
										<span class="cur">$</span><input
											name="v_{id}"
											inputmode="decimal"
											aria-label="New {it.name} value"
											bind:value={typed[id]}
										/>
									</div>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
				<a class="more small-link" href="/manage/accounts#close"
					>Change which accounts appear here</a
				>
			</section>
		</div>

		<div class="col">
			<section class="card">
				<label for="note" class="lbl">What happened in {name}?</label>
				<textarea
					id="note"
					name="note"
					rows="3"
					class="h-textarea"
					bind:value={note}
					placeholder="Big purchases, a pay change, anything you’ll want to remember in a year"
				></textarea>
				<span class="sub small">Shows up on this month in Months.</span>
			</section>

			<section class="card preview">
				<div class="top">
					<span class="lbl">{name} net worth</span>
					{#if delta != null && data.prevMonth}
						<span class="num strong {tone(delta)}"
							>{signed(delta)} vs {monthName(data.prevMonth, { year: false })}</span
						>
					{/if}
				</div>
				<span class="disp num nw">{calc.guessed ? '≈ ' : ''}{formatMoney(calc.total)}</span>
				{#if calc.needsSure}
					<label class="h-check"
						><input type="checkbox" name="sure" bind:checked={sure} /> Yes, those numbers are right</label
					>
				{/if}
				<button class="lock" disabled={!ready || busy}>{busy ? 'Locking…' : `Lock ${name}`}</button>
				{#if form?.error}<p class="h-error" role="alert">{form.error}</p>{/if}
				<span class="sub small center"
					>You can still fix a number later. Every edit is kept in the month’s history.</span
				>
			</section>
		</div>
	</form>
{/if}

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 4px 0 18px;
	}
	.hero-title {
		font-size: 38px;
		line-height: 1.05;
		font-weight: 750;
		letter-spacing: -0.02em;
	}
	.lead {
		font-size: 15px;
		margin: 0;
		max-width: 60ch;
	}
	.progress {
		display: flex;
		gap: 4px;
		max-width: 520px;
	}
	.progress .seg {
		flex: 1;
		height: 6px;
		border-radius: 999px;
		background: #2a2a30;
	}
	.progress .seg.on {
		background: var(--gain);
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
			grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
			align-items: start;
			column-gap: 20px;
		}
		.grid > .col:last-child {
			position: sticky;
			top: 20px;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.steps {
		padding-top: 6px;
		padding-bottom: 6px;
		gap: 0;
	}
	.step {
		display: flex;
		gap: 12px;
		padding: 14px 0;
		border-top: 1px solid var(--surface-2);
	}
	.step:first-child {
		border-top: 0;
	}
	.ok,
	.todo {
		width: 26px;
		height: 26px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
	}
	.ok {
		background: #163a2c;
		color: var(--gain);
	}
	.todo {
		background: #3a2414;
		color: var(--accent);
		font-size: 13px;
		font-weight: 700;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.strong {
		font-weight: 600;
	}
	.field {
		margin-top: 8px;
	}
	.chips {
		display: flex;
		gap: 8px;
		margin-top: 8px;
		flex-wrap: wrap;
	}
	.warn {
		margin: 6px 0 0;
		color: var(--estimate);
		font-size: 13px;
	}
	.small {
		font-size: 12px;
	}
	.center {
		text-align: center;
	}
	.preview {
		gap: 14px;
		border-color: #3a2a1c;
	}
	.nw {
		font-size: 44px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.lock {
		border: 0;
		border-radius: 16px;
		min-height: 54px;
		background: var(--accent);
		color: var(--accent-ink);
		font: 700 16px var(--font-body);
		cursor: pointer;
	}
	.lock:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.more {
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.small-link {
		font-size: 13px;
		border-top: 1px solid var(--surface-2);
	}
	.done-card {
		max-width: 560px;
	}
	.locked-msg {
		display: flex;
		gap: 10px;
		align-items: center;
		background: #163a2c;
		color: var(--gain);
		border-radius: 16px;
		padding: 14px;
		font-weight: 600;
	}
	.how ol {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--text-2);
	}
	.how {
		max-width: 640px;
	}
</style>
