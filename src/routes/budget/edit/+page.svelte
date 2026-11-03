<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { monthLabel } from '$lib/time';

	let { data, form } = $props();
	const dollars = (c: number | null | undefined) => (c == null ? '' : String(c / 100));
	const usd = (c: number) => formatMoney(c);
	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const PERIODS = [
		{ value: 'week', label: 'a week' },
		{ value: 'month', label: 'a month' },
		{ value: 'year', label: 'a year' }
	];
	const periodText = (p: string) => PERIODS.find((x) => x.value === p)?.label ?? p;
	const accountName = (id: number | null) => data.accounts.find((a) => a.id === id)?.name ?? '';
	const here = (section: string) => form && 'section' in form && form.section === section;
	const keep =
		() =>
		({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });
	let confirmDelete = $state<number | null>(null);
</script>

<svelte:head><title>Edit budget · Ben's Tally</title></svelte:head>

<a class="h-back" href="/budget"><Icon name="back" size={18} /> Budget</a>
<h1 class="disp h-title">Edit budget</h1>

{#snippet status(section: string)}
	{#if here(section)}
		{#if form && 'error' in form && form.error}<span class="h-error" role="alert">{form.error}</span
			>{:else if form && 'saved' in form}<span class="h-ok" role="status">Saved</span>{/if}
	{/if}
{/snippet}

<div class="grid">
	<section class="card" id="actuals">
		<span class="lbl">Start from a month’s actuals</span>
		<p class="sub">
			Sets each line’s plan to what it really cost in a month, from {monthLabel(data.now)} on. Earlier
			months keep the plan they had. Savings, repayments and yearly bills are left alone.
		</p>
		<form method="POST" action="?/fromActuals" class="h-form" use:enhance={keep}>
			<label class="h-label"
				>Month to copy
				<input class="h-input" type="month" name="from" value={data.lastMonth} required /></label
			>
			<div class="h-actions">
				<button class="btn">Copy these actuals into the plan</button>
				{@render status('actuals')}
				{#if here('actuals') && form && 'changed' in form}<span class="sub"
						>{form.changed} line{form.changed === 1 ? '' : 's'} changed</span
					>{/if}
			</div>
		</form>
	</section>

	<section class="card" id="lines">
		<span class="lbl">Budget lines</span>
		<p class="sub">
			Changing an amount keeps the old one for earlier months. “Looks for” is the merchant text that
			counts transactions toward the line (more detail on the Rules page).
		</p>
		{#each data.lines as l, i (l.id)}
			<details class="item" open={here(`line:${l.id}`)}>
				<summary>
					<span class="grow"
						><span class="nm">{l.name}</span>
						<span class="sub small"
							>{usd(l.amountCents)}
							{periodText(l.period)} · {accountName(l.saverAccountId) || 'no saver'}{l.merchant
								? ` · looks for “${l.merchant}”`
								: ''}</span
						></span
					>
					<span class="badge">{data.groups.find((g) => g.value === l.group)?.label}</span>
				</summary>
				<form method="POST" action="?/saveLine" class="h-form body" use:enhance={keep}>
					<input type="hidden" name="id" value={l.id} />
					<label class="h-label"
						>Name <input class="h-input" name="name" value={l.name} required /></label
					>
					<label class="h-label"
						>Looks for <span class="sub">(merchant text, commas for several)</span>
						<input class="h-input" name="merchant" value={l.merchant} /></label
					>
					<div class="h-row2">
						<label class="h-label"
							>Amount
							<span class="h-money"
								><span class="cur">$</span><input
									name="amount"
									inputmode="decimal"
									value={dollars(l.amountCents)}
								/></span
							></label
						>
						<label class="h-label"
							>Per
							<select class="h-select" name="period">
								{#each PERIODS as p (p.value)}<option
										value={p.value}
										selected={p.value === l.period}>{p.label}</option
									>{/each}
							</select></label
						>
					</div>
					<label class="h-label"
						>Amount applies from
						<input class="h-input" type="month" name="from" value={data.now} /></label
					>
					<div class="h-row2">
						<label class="h-label"
							>Group
							<select class="h-select" name="group">
								{#each data.groups as g (g.value)}<option
										value={g.value}
										selected={g.value === l.group}>{g.label}</option
									>{/each}
							</select></label
						>
						<label class="h-label"
							>Paid from (Up saver)
							<select class="h-select" name="saver">
								<option value="">None</option>
								{#each data.accounts as a (a.id)}<option
										value={a.id}
										selected={a.id === l.saverAccountId}>{a.name}</option
									>{/each}
							</select></label
						>
					</div>
					<div class="h-row2">
						<label class="h-label"
							>First month <span class="sub">(optional)</span>
							<input class="h-input" type="month" name="startMonth" value={l.startMonth} /></label
						>
						<label class="h-label"
							>Last month <span class="sub">(optional)</span>
							<input class="h-input" type="month" name="endMonth" value={l.endMonth} /></label
						>
					</div>
					<label class="h-label"
						>Note <span class="sub">(optional)</span>
						<input class="h-input" name="note" value={l.note} /></label
					>
					{#if l.history.length > 1}
						<p class="sub small">
							Amount history: {l.history
								.map(
									(h) =>
										`${usd(h.amountCents)} ${periodText(h.period)} from ${monthLabel(h.fromMonth)}`
								)
								.join(' · ')}
						</p>
					{/if}
					<div class="h-actions">
						<button class="btn primary">Save</button>
						{@render status(`line:${l.id}`)}
					</div>
				</form>
				<div class="h-actions body tools">
					<form method="POST" action="?/moveLine" use:enhance>
						<input type="hidden" name="id" value={l.id} /><input
							type="hidden"
							name="dir"
							value="up"
						/>
						<button class="btn" disabled={i === 0} aria-label="Move {l.name} up">↑ Up</button>
					</form>
					<form method="POST" action="?/moveLine" use:enhance>
						<input type="hidden" name="id" value={l.id} /><input
							type="hidden"
							name="dir"
							value="down"
						/>
						<button
							class="btn"
							disabled={i === data.lines.length - 1}
							aria-label="Move {l.name} down">↓ Down</button
						>
					</form>
					{#if confirmDelete === l.id}
						<form method="POST" action="?/deleteLine" use:enhance>
							<input type="hidden" name="id" value={l.id} />
							<button class="btn danger">Delete “{l.name}” and its rules</button>
						</form>
						<button class="btn" type="button" onclick={() => (confirmDelete = null)}>Cancel</button>
					{:else}
						<button class="btn danger" type="button" onclick={() => (confirmDelete = l.id)}
							>Delete…</button
						>
					{/if}
				</div>
			</details>
		{:else}
			<p class="sub">No lines yet. Add the first below, or load the sheet from Manage.</p>
		{/each}
	</section>

	<section class="card" id="add-line">
		<span class="lbl">Add a line</span>
		<form method="POST" action="?/saveLine" class="h-form" use:enhance={keep}>
			<label class="h-label">Name <input class="h-input" name="name" required /></label>
			<label class="h-label"
				>Looks for <span class="sub">(merchant text, optional)</span>
				<input class="h-input" name="merchant" /></label
			>
			<div class="h-row2">
				<label class="h-label"
					>Amount
					<span class="h-money"
						><span class="cur">$</span><input name="amount" inputmode="decimal" /></span
					></label
				>
				<label class="h-label"
					>Per
					<select class="h-select" name="period">
						{#each PERIODS as p (p.value)}<option value={p.value} selected={p.value === 'month'}
								>{p.label}</option
							>{/each}
					</select></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Group
					<select class="h-select" name="group">
						{#each data.groups as g (g.value)}<option
								value={g.value}
								selected={g.value === 'living'}>{g.label}</option
							>{/each}
					</select></label
				>
				<label class="h-label"
					>Paid from (Up saver)
					<select class="h-select" name="saver">
						<option value="">None</option>
						{#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
					</select></label
				>
			</div>
			<input type="hidden" name="from" value={data.now} />
			<div class="h-actions">
				<button class="btn primary">Add line</button>
				{@render status('line:new')}
			</div>
		</form>
	</section>

	<section class="card" id="pay">
		<span class="lbl">Pay split</span>
		<p class="sub">
			The amount sent to each saver each pay.
			{#if data.pay}Your real pay is {formatMoney(data.pay.cents, { cents: true })} ({data.pay
					.source}); the split adds up to {formatMoney(data.splitTotal, { cents: true })}.{/if}
		</p>
		{#each data.splits as s (s.id)}
			<form method="POST" action="?/saveSplit" class="h-form split" use:enhance={keep}>
				<input type="hidden" name="id" value={s.id} />
				<div class="h-row2">
					<label class="h-label"
						><span class="sr-only">Saver</span>
						<select class="h-select" name="account" aria-label="Saver">
							{#each data.accounts as a (a.id)}<option value={a.id} selected={a.id === s.accountId}
									>{a.name}</option
								>{/each}
						</select></label
					>
					<label class="h-label"
						><span class="sr-only">Amount per pay</span>
						<span class="h-money"
							><span class="cur">$</span><input
								name="amount"
								aria-label="Amount per pay"
								inputmode="decimal"
								value={dollars(s.amountCents)}
							/></span
						></label
					>
				</div>
				<div class="h-actions">
					<button class="btn primary">Save</button>
					<button class="btn danger" formaction="?/deleteSplit" formnovalidate>Remove</button>
					<span class="sub small">really {formatMoney(s.realCents, { cents: true })}</span>
					{@render status(`split:${s.id}`)}
				</div>
			</form>
		{/each}
		<form method="POST" action="?/saveSplit" class="h-form split add" use:enhance={keep}>
			<span class="sub">Add a saver</span>
			<div class="h-row2">
				<select class="h-select" name="account" aria-label="Saver" required>
					<option value="">Choose a saver…</option>
					{#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
				</select>
				<span class="h-money"
					><span class="cur">$</span><input
						name="amount"
						aria-label="Amount per pay"
						inputmode="decimal"
						placeholder="0"
					/></span
				>
			</div>
			<div class="h-actions">
				<button class="btn">Add</button>
				{@render status('split:new')}
			</div>
		</form>
		<form method="POST" action="?/matchReal" class="h-actions">
			<button class="btn">Update the plan to the real transfers</button>
			<span class="sub small"
				>Sets each saver to what it really gets and the plan pay to your real pay.</span
			>
		</form>
	</section>

	<section class="card" id="bills">
		<span class="lbl">Yearly bills</span>
		<p class="sub">
			Bills paid once or twice a year. The monthly money for them goes into the yearly bills fund
			through the budget line chosen here.
		</p>
		{#each data.bills as b (b.id)}
			<details class="item" open={here(`bill:${b.id}`)}>
				<summary
					><span class="grow"
						><span class="nm">{b.name}</span>
						<span class="sub small"
							>{usd(b.yearlyCents)} a year{b.months.length
								? ` · ${b.months.map((m) => MONTHS[m - 1]).join(', ')}`
								: ' · months not set'}</span
						></span
					></summary
				>
				{@render billForm(b)}
			</details>
		{/each}
		<span class="sub">Add a bill</span>
		{@render billForm(null)}
	</section>

	<section class="card" id="settings">
		<span class="lbl">Budget settings</span>
		<form method="POST" action="?/saveSettings" class="h-form" use:enhance={keep}>
			<div class="h-row2">
				<label class="h-label"
					>Pay arrives
					<select class="h-select" name="frequency">
						<option value="week" selected={data.settings.payFrequency === 'week'}>Every week</option
						>
						<option value="fortnight" selected={data.settings.payFrequency === 'fortnight'}
							>Every fortnight</option
						>
						<option value="month" selected={data.settings.payFrequency === 'month'}
							>Every month</option
						>
					</select></label
				>
				<label class="h-label"
					>Pay the plan was written for
					<span class="h-money"
						><span class="cur">$</span><input
							name="planPay"
							inputmode="decimal"
							value={dollars(data.settings.planPay)}
						/></span
					></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Warn when plan and real differ by more than
					<span class="h-money"
						><span class="cur">$</span><input
							name="tolerance"
							inputmode="decimal"
							value={dollars(data.settings.tolerance)}
						/></span
					></label
				>
				<label class="h-label"
					>Months a merchant may go missing
					<input
						class="h-input"
						name="gap"
						type="number"
						min="1"
						max="12"
						value={data.settings.merchantGapMonths}
					/></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Yearly bills fund counts from
					<input
						class="h-input"
						type="month"
						name="fundStart"
						value={data.settings.yearlyFundStart ?? ''}
					/></label
				>
				<label class="h-label"
					>Fund balance at that month’s start
					<span class="h-money"
						><span class="cur">$</span><input
							name="opening"
							inputmode="decimal"
							value={dollars(data.settings.yearlyFundOpening)}
						/></span
					></label
				>
			</div>
			<div class="h-actions">
				<button class="btn primary">Save</button>
				{@render status('settings')}
			</div>
		</form>
	</section>
</div>

{#snippet billForm(b: (typeof data.bills)[number] | null)}
	<form method="POST" action="?/saveBill" class="h-form body" use:enhance={keep}>
		{#if b}<input type="hidden" name="id" value={b.id} />{/if}
		<label class="h-label"
			>Name <input class="h-input" name="name" value={b?.name ?? ''} required /></label
		>
		<div class="h-row2">
			<label class="h-label"
				>Cost a year
				<span class="h-money"
					><span class="cur">$</span><input
						name="yearly"
						inputmode="decimal"
						value={dollars(b?.yearlyCents)}
						required
					/></span
				></label
			>
			<label class="h-label"
				>Draws from line
				<select class="h-select" name="line">
					<option value="">None</option>
					{#each data.lines as l (l.id)}<option value={l.id} selected={l.id === b?.budgetLineId}
							>{l.name}</option
						>{/each}
				</select></label
			>
		</div>
		<fieldset class="months">
			<legend class="sub">Usually paid in</legend>
			{#each MONTHS as m, i (m)}
				<label class="mchip"
					><input
						type="checkbox"
						name="months"
						value={i + 1}
						checked={b?.months.includes(i + 1) ?? false}
					/><span>{m}</span></label
				>
			{/each}
		</fieldset>
		<div class="h-actions">
			<button class="btn primary">{b ? 'Save' : 'Add bill'}</button>
			{#if b}<button class="btn danger" formaction="?/deleteBill" formnovalidate>Delete</button
				>{/if}
			{@render status(`bill:${b?.id ?? 'new'}`)}
		</div>
	</form>
{/snippet}

<style>
	.grid {
		display: grid;
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
	form {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.nm {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.item {
		border-top: 1px solid var(--surface-2);
		padding: 4px 0;
	}
	.item:first-of-type {
		border-top: 0;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.body {
		padding: 6px 0 10px;
	}
	.tools {
		border-top: 1px dashed var(--surface-2);
		padding-top: 10px;
	}
	.split {
		border-top: 1px solid var(--surface-2);
		padding-top: 10px;
	}
	.split.add {
		border-top: 1px dashed var(--border);
	}
	.months {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.months legend {
		padding: 0 0 4px;
	}
	.mchip {
		position: relative;
	}
	.mchip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		cursor: pointer;
	}
	.mchip span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		min-height: 44px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--inset);
		color: var(--chip-text);
		font: 600 13px var(--font-body);
	}
	.mchip input:checked + span {
		background: var(--text);
		color: var(--ground);
		border-color: var(--text);
	}
	.mchip input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
