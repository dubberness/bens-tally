<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { formatMoney, formatMoneyShort } from '$lib/money';
	import { monthLabel } from '$lib/time';
	import { runPlan } from '$lib/plan/model';
	import {
		canonical,
		defaultClass,
		resolve,
		weeklyFromMonthly,
		type AccountClass,
		type PlanContext,
		type PlanParams
	} from '$lib/plan/params';
	import PlanChart from './PlanChart.svelte';
	import '$lib/components/history/form.css';

	interface Scenario {
		id: number;
		name: string;
		isDefault: boolean;
		params: PlanParams;
	}
	let {
		scenario,
		ctx,
		form
	}: {
		scenario: Scenario;
		ctx: PlanContext;
		form?: { section?: string; error?: string; saved?: boolean } | null;
	} = $props();

	const saved = $derived(scenario.params);
	const dollars = (cents: number | null) => (cents === null ? null : Math.round(cents / 100));

	/** The form's values for a set of assumptions. Sliders and the full editor share them. */
	function draft(p: PlanParams) {
		const res = resolve(p, ctx);
		return {
			spending: dollars(res.spendingCents),
			spendingFollow: p.spendingCents === null,
			investing: dollars(res.investingCents),
			investingFollow: p.investingCents === null,
			returnPct: p.returnPct,
			inflationPct: p.inflationPct,
			salary: dollars(p.salaryCents) as number | null,
			superRatePct: p.superRatePct,
			superTaxPct: p.superTaxPct,
			withdrawalPct: p.withdrawalPct,
			accessAge: p.accessAge,
			birthDate: p.birthDate ?? '',
			mortgageGoneYear: p.mortgageGoneYear as number | null,
			counted: Object.fromEntries(
				ctx.accounts.map((a) => [a.id, p.counted[String(a.id)] ?? defaultClass(a)])
			) as Record<number, AccountClass>
		};
	}
	const start = untrack(() => resolve(scenario.params, ctx));
	const d = $state(untrack(() => draft(scenario.params)));
	let allOpen = $state(start.inputs === null);

	const n = (v: number | null | undefined) =>
		typeof v === 'number' && Number.isFinite(v) ? v : null;

	const params = $derived<PlanParams>({
		spendingCents: d.spendingFollow ? null : Math.round((n(d.spending) ?? 0) * 100),
		investingCents: d.investingFollow ? null : Math.round((n(d.investing) ?? 0) * 100),
		returnPct: n(d.returnPct) ?? 0,
		inflationPct: n(d.inflationPct) ?? 0,
		salaryCents: n(d.salary) === null ? null : Math.round(n(d.salary)! * 100),
		superRatePct: n(d.superRatePct) ?? 0,
		superTaxPct: n(d.superTaxPct) ?? 0,
		withdrawalPct: n(d.withdrawalPct) || 4,
		accessAge: Math.round(n(d.accessAge) ?? 60),
		birthDate: /^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) ? d.birthDate : null,
		counted: Object.fromEntries(
			ctx.accounts
				.filter((a) => d.counted[a.id] !== defaultClass(a))
				.map((a) => [String(a.id), d.counted[a.id]])
		),
		mortgageGoneYear: n(d.mortgageGoneYear)
	});

	const r = $derived(resolve(params, ctx));
	const result = $derived(r.inputs ? runPlan(r.inputs) : null);
	const dirty = $derived(canonical(params) !== canonical(saved));
	const usd = (c: number) => formatMoney(c);
	const P = $derived(params.accessAge);

	// Slider ranges are set from where the sliders start, so a big or small figure still fits.
	const ceil = (v: number, step: number) => Math.max(step, Math.ceil(v / step) * step);
	const spendMax = ceil(Math.max((start.spendingCents ?? 0) / 100, 1000) * 2, 500);
	const investMax = ceil(Math.max((start.investingCents ?? 0) / 100, 50) * 2, 50);

	const measuredSpend = $derived(dollars(ctx.measuredSpending?.cents ?? null));
	const measuredInvest = $derived(
		ctx.measuredInvesting ? dollars(weeklyFromMonthly(ctx.measuredInvesting.cents)) : null
	);
	const spendSource = $derived(
		ctx.measuredSpending
			? `Up average over ${ctx.measuredSpending.months} month${ctx.measuredSpending.months === 1 ? '' : 's'} (${monthLabel(ctx.measuredSpending.from)} to ${monthLabel(ctx.measuredSpending.to)}), ${ctx.spendingIncludesOneOffs ? 'with' : 'without'} one-offs, repayments and investing`
			: ''
	);

	function useMeasured(which: 'spending' | 'investing') {
		if (which === 'spending') {
			d.spending = measuredSpend;
			d.spendingFollow = true;
		} else {
			d.investing = measuredInvest;
			d.investingFollow = true;
		}
	}
	function reset() {
		Object.assign(d, draft(saved));
	}

	const free = $derived(result?.freeAge ?? null);
	const when = $derived.by(() => {
		if (!result) return '';
		if (free === null) return 'Try spending less or investing more';
		return result.yearsAway === 0
			? `Now, in ${result.freeYear}`
			: `In ${result.freeYear}, ${result.yearsAway} year${result.yearsAway === 1 ? '' : 's'} from now`;
	});
	const heroSub = $derived(
		free === null
			? `Your investments outside super can't yet carry you to ${P} on these numbers.`
			: free >= P
				? `Super opens at ${P}, and on these numbers it can carry you from there.`
				: `That's when your investments outside super can carry you to ${P}, and super takes over from there.`
	);
	const realPct = $derived((r.realReturn * 100).toFixed(1));
	const superYear = $derived(r.inputs ? Math.round(r.inputs.superYear) : 0);

	const groups = $derived([
		{ cls: 'outside' as const, title: 'Outside super', cents: r.outsideCents },
		{ cls: 'super' as const, title: 'Super', cents: r.superCents }
	]);
	const notCounted = $derived(r.accounts.filter((a) => a.cls === 'none'));
	const CLASS_LABEL: Record<AccountClass, string> = {
		outside: 'Outside super',
		super: 'Super',
		none: 'Not counted'
	};
</script>

<div class="grid">
	<div class="col left">
		<section class="hero" aria-label="Result">
			<span class="lbl">Work becomes optional at</span>
			{#if !result}
				<span class="disp age small-age">Needs {r.missing.join(' and ')}</span>
				<span class="sub">
					Add {r.missing.join(' and ')} in All assumptions{r.missing.includes('your birth date')
						? ' (or in Manage › Settings)'
						: ''}.
				</span>
			{:else}
				<span class="disp age num">{free === null ? `Not before ${P}` : free}</span>
				<span class="when num">{when}</span>
				<span class="sub">{heroSub}</span>
			{/if}
		</section>

		{#if result}
			<section class="card chart-card" aria-label="Money by year">
				<PlanChart
					series={result.series}
					accessAge={P}
					freeAge={free}
					mortgageGoneYear={params.mortgageGoneYear}
				/>
			</section>
		{/if}

		<section class="card steps" aria-label="How the bridge works">
			<span class="lbl">How the bridge works</span>
			<div class="step">
				<span class="n" style="background: var(--c-etf)">1</span>
				<span
					><strong>Build.</strong> Keep investing outside super until {free === null || !result
						? `super takes over at ${P}`
						: `you are ${free}`}.</span
				>
			</div>
			<div class="step">
				<span class="n" style="background: var(--accent)">2</span>
				<span
					><strong>Bridge.</strong> Live off those investments until {P}, while super keeps growing
					untouched.</span
				>
			</div>
			<div class="step">
				<span class="n" style="background: var(--c-super)">3</span>
				<span><strong>Super.</strong> At {P} you can reach your super, and it takes over.</span>
			</div>
			{#if result?.atFree && free !== null && free < P}
				<p class="sub">
					At {free} the bridge needs {usd(Math.round(result.atFree.bridge * 100))} outside super to pay
					{usd(Math.round((r.inputs?.spendYear ?? 0) * 100))} a year until {P}{#if result.atFree.shortfall > 0},
						plus {usd(Math.round(result.atFree.shortfall * 100))} to top up super so it can pay {usd(
							Math.round((r.inputs?.spendYear ?? 0) * 100)
						)} a year at a
						{params.withdrawalPct}% withdrawal rate{/if}. You'd have {usd(
						Math.round(result.atFree.outside * 100)
					)}.
				</p>
			{/if}
		</section>

		<section class="card counted" aria-label="What's counted">
			<span class="lbl">What's counted</span>
			{#each groups as g (g.cls)}
				<div class="grp">
					<div class="between">
						<span class="gname">{g.title}</span>
						<span class="num strong">{usd(g.cents)}</span>
					</div>
					<span class="sub small">
						{r.accounts
							.filter((a) => a.cls === g.cls)
							.map((a) => a.name)
							.join(', ') || 'No accounts'}
					</span>
				</div>
			{/each}
			<p class="text">
				Your home and the debts against it are left out together, so they neither add to nor take
				from the result.{notCounted.length
					? ` Also not counted: ${notCounted.map((a) => a.name).join(', ')}.`
					: ''}
			</p>
			<p class="sub small">
				Rough first pass in today's dollars, using a {realPct}% return after inflation.
				{params.salaryCents !== null
					? `Super gets ${params.superRatePct}% of a ${usd(params.salaryCents)} salary less ${params.superTaxPct}% tax (${usd(superYear * 100)} a year) until you stop work.`
					: 'No salary is entered, so no super contributions are added.'}
				Age Pension isn't counted, and the mortgage years aren't modelled.
			</p>
		</section>
	</div>

	<div class="col right">
		<form
			id="plan-form"
			method="POST"
			action="?/save"
			use:enhance
			class="stack"
			aria-label="Assumptions"
		>
			<input type="hidden" name="id" value={scenario.id} />

			<section class="card sliders">
				<div class="field">
					<div class="between">
						<label for="spend-range">Living costs</label>
						<span class="num strong">{formatMoney((n(d.spending) ?? 0) * 100)} / month</span>
					</div>
					<input
						id="spend-range"
						type="range"
						min="0"
						max={spendMax}
						step="50"
						value={d.spending ?? 0}
						oninput={(e) => {
							d.spending = e.currentTarget.valueAsNumber;
							d.spendingFollow = false;
						}}
					/>
					<span class="sub small">
						{d.spendingFollow && ctx.measuredSpending
							? 'Starts at your real average from Up, without the mortgage.'
							: 'Your own figure.'}
					</span>
				</div>
				<div class="field">
					<div class="between">
						<label for="invest-range">Investing</label>
						<span class="num strong">{formatMoney((n(d.investing) ?? 0) * 100)} / week</span>
					</div>
					<input
						id="invest-range"
						type="range"
						min="0"
						max={investMax}
						step="10"
						value={d.investing ?? 0}
						oninput={(e) => {
							d.investing = e.currentTarget.valueAsNumber;
							d.investingFollow = false;
						}}
					/>
					<span class="sub small">
						{d.investingFollow && ctx.measuredInvesting
							? 'Starts at what you really invested lately.'
							: 'Your own figure.'}
					</span>
				</div>
				<div class="field">
					<div class="between">
						<label for="return-range">Return</label>
						<span class="num strong">{(n(d.returnPct) ?? 0).toFixed(1)}% a year</span>
					</div>
					<input
						id="return-range"
						type="range"
						min="0"
						max="15"
						step="0.5"
						value={d.returnPct}
						oninput={(e) => (d.returnPct = e.currentTarget.valueAsNumber)}
					/>
					<span class="sub small">{realPct}% after {n(d.inflationPct) ?? 0}% inflation.</span>
				</div>
			</section>

			<details class="card all" bind:open={allOpen}>
				<summary>All assumptions</summary>
				<div class="h-form">
					<div class="h-row2">
						<label class="h-label">
							Living costs per month
							<span class="h-money"
								><span class="cur">$</span><input
									name="spending"
									type="number"
									min="0"
									step="any"
									inputmode="decimal"
									bind:value={d.spending}
									oninput={() => (d.spendingFollow = false)}
								/></span
							>
							{#if d.spendingFollow}<input type="hidden" name="spendingFollow" value="on" />{/if}
							<span class="sub">
								{#if d.spendingFollow && ctx.measuredSpending}From {spendSource}.
								{:else if measuredSpend !== null}
									<button type="button" class="link" onclick={() => useMeasured('spending')}
										>Use the Up average again ({usd((measuredSpend ?? 0) * 100)})</button
									>
								{:else}Nothing measured yet; type your own.{/if}
							</span>
						</label>
						<label class="h-label">
							Investing per week
							<span class="h-money"
								><span class="cur">$</span><input
									name="investing"
									type="number"
									min="0"
									step="any"
									inputmode="decimal"
									bind:value={d.investing}
									oninput={() => (d.investingFollow = false)}
								/></span
							>
							{#if d.investingFollow}<input type="hidden" name="investingFollow" value="on" />{/if}
							<span class="sub">
								{#if d.investingFollow && ctx.measuredInvesting}From your investing over the last {ctx
										.measuredInvesting.months} months.
								{:else if measuredInvest !== null}
									<button type="button" class="link" onclick={() => useMeasured('investing')}
										>Use the measured amount again ({usd((measuredInvest ?? 0) * 100)})</button
									>
								{:else}Nothing measured yet; type your own.{/if}
							</span>
						</label>
					</div>

					<div class="h-row2">
						<label class="h-label"
							>Market return, % a year
							<input
								class="h-input"
								name="returnPct"
								type="number"
								step="any"
								inputmode="decimal"
								bind:value={d.returnPct}
							/>
						</label>
						<label class="h-label"
							>Inflation, % a year
							<input
								class="h-input"
								name="inflationPct"
								type="number"
								step="any"
								inputmode="decimal"
								bind:value={d.inflationPct}
							/>
							<span class="sub">The model uses the return left after this.</span>
						</label>
					</div>

					<div class="h-row2">
						<label class="h-label"
							>Salary a year, before tax
							<span class="h-money"
								><span class="cur">$</span><input
									name="salary"
									type="number"
									min="0"
									step="any"
									inputmode="decimal"
									bind:value={d.salary}
								/></span
							>
							<span class="sub">Leave blank to leave super contributions out.</span>
						</label>
						<label class="h-label"
							>Super rate, % of salary
							<input
								class="h-input"
								name="superRatePct"
								type="number"
								step="any"
								inputmode="decimal"
								bind:value={d.superRatePct}
							/>
						</label>
						<label class="h-label"
							>Contributions tax, %
							<input
								class="h-input"
								name="superTaxPct"
								type="number"
								step="any"
								inputmode="decimal"
								bind:value={d.superTaxPct}
							/>
						</label>
					</div>

					<div class="h-row2">
						<label class="h-label"
							>Safe withdrawal rate, %
							<input
								class="h-input"
								name="withdrawalPct"
								type="number"
								step="any"
								min="0.1"
								inputmode="decimal"
								bind:value={d.withdrawalPct}
							/>
							<span class="sub">Super must reach a year's costs ÷ this rate by the access age.</span
							>
						</label>
						<label class="h-label"
							>Super access age
							<input
								class="h-input"
								name="accessAge"
								type="number"
								step="1"
								min="30"
								inputmode="numeric"
								bind:value={d.accessAge}
							/>
							<span class="sub">The age you can reach your super.</span>
						</label>
					</div>

					<div class="h-row2">
						<label class="h-label"
							>Birth date
							<input class="h-input" name="birthDate" type="date" bind:value={d.birthDate} />
							<span class="sub">
								{#if d.birthDate}This scenario's own birth date.
								{:else if ctx.settingsBirthDate}Blank uses the one in Manage › Settings.
								{:else}Blank uses the one in Manage › Settings, which isn't set yet.{/if}
							</span>
						</label>
						<label class="h-label"
							>Mortgage gone in (year)
							<input
								class="h-input"
								name="mortgageGoneYear"
								type="number"
								step="1"
								inputmode="numeric"
								placeholder="Optional"
								bind:value={d.mortgageGoneYear}
							/>
							<span class="sub">Only marks the chart; it doesn't change the result.</span>
						</label>
					</div>

					<fieldset class="accts">
						<legend class="lbl">Which accounts count</legend>
						<p class="sub">
							Outside super is what pays for the bridge. The home and loans are left out unless you
							move an account here.
						</p>
						{#each ctx.accounts as a (a.id)}
							<div class="acct">
								<label for="count-{a.id}" class="aname">
									<span>{a.name}</span>
									<span class="sub small num">{usd(a.valueCents)}</span>
								</label>
								<select
									id="count-{a.id}"
									name="count_{a.id}"
									class="h-select"
									bind:value={d.counted[a.id]}
								>
									{#each ['outside', 'super', 'none'] as c (c)}
										<option value={c}
											>{CLASS_LABEL[c as AccountClass]}{defaultClass(a) === c
												? ' (usual)'
												: ''}</option
										>
									{/each}
								</select>
							</div>
						{/each}
						{#if !ctx.accounts.length}<p class="sub">No accounts yet.</p>{/if}
					</fieldset>
				</div>
			</details>

			{#if r.notes.length}
				<div class="notes">
					{#each r.notes as note (note)}<p class="sub small">{note}</p>{/each}
				</div>
			{/if}

			<section class="card save">
				<span class="lbl">Save</span>
				{#if dirty}
					<p class="sub" role="status">You have changes that aren't saved.</p>
				{/if}
				<div class="h-actions">
					<button class="btn primary" disabled={!dirty && scenario.id !== 0}>
						Save to “{scenario.name}”
					</button>
					{#if dirty}<button type="button" class="btn" onclick={reset}>Undo changes</button>{/if}
				</div>
				{#if form?.section === 'save'}
					{#if form.error}<p class="h-error" role="alert">{form.error}</p>
					{:else if form.saved && !dirty}<p class="h-ok" role="status">Saved</p>{/if}
				{/if}
				<div class="saveas">
					<label class="h-label"
						>Or keep these as a new what-if
						<input
							class="h-input"
							name="newName"
							maxlength="60"
							placeholder="Name, such as “Spend less”"
							autocomplete="off"
						/>
					</label>
					<button class="btn" formaction="?/saveAs">Save as what-if</button>
					{#if form?.section === 'saveAs' && form.error}<p class="h-error" role="alert">
							{form.error}
						</p>{/if}
				</div>
			</section>
		</form>

		{#if scenario.id !== 0}
			<section class="card manage">
				<span class="lbl">This scenario</span>
				<form method="POST" action="?/rename" use:enhance class="h-actions rename">
					<input type="hidden" name="id" value={scenario.id} />
					<label class="sr-only" for="rename">Name</label>
					<input
						id="rename"
						class="h-input grow"
						name="name"
						value={scenario.name}
						maxlength="60"
						autocomplete="off"
					/>
					<button class="btn">Rename</button>
				</form>
				{#if form?.section === 'rename' && form.error}<p class="h-error" role="alert">
						{form.error}
					</p>{/if}
				<div class="h-actions">
					{#if scenario.isDefault}
						<span class="badge ok">Base scenario</span>
						<span class="sub small">Shown first and when you open Plan.</span>
					{:else}
						<form method="POST" action="?/makeBase" use:enhance>
							<input type="hidden" name="id" value={scenario.id} />
							<button class="btn">Make this the base</button>
						</form>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(`Delete “${scenario.name}”?`)) cancel();
							}}
						>
							<input type="hidden" name="id" value={scenario.id} />
							<button class="btn danger">Delete</button>
						</form>
					{/if}
				</div>
				{#if form?.section === 'base' && form.error}<p class="h-error" role="alert">
						{form.error}
					</p>{/if}
				{#if form?.section === 'delete' && form.error}<p class="h-error" role="alert">
						{form.error}
					</p>{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.grid {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
	}
	/* On a phone the result and its sliders come first, the explanations after. */
	.col {
		display: contents;
	}
	.hero {
		order: 1;
	}
	.chart-card {
		order: 2;
	}
	#plan-form {
		order: 3;
	}
	.steps {
		order: 4;
	}
	.counted {
		order: 5;
	}
	.manage {
		order: 6;
	}
	@media (min-width: 900px) {
		.col {
			display: flex;
			flex-direction: column;
			gap: 12px;
			min-width: 0;
		}
		.hero,
		.chart-card,
		#plan-form,
		.steps,
		.counted,
		.manage {
			order: 0;
		}
		.grid {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 4px 0;
	}
	.age {
		font-size: 56px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
		color: var(--accent);
		padding-top: 4px;
	}
	.small-age {
		font-size: 26px;
		line-height: 1.15;
	}
	.when {
		font-size: 15px;
		font-weight: 600;
	}
	.chart-card {
		padding: 16px 14px 14px;
	}
	.steps,
	.counted,
	.sliders,
	.save,
	.manage {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.step {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		font-size: 15px;
	}
	.n {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 13px var(--font-body);
		flex: none;
		color: #111113;
	}
	p {
		margin: 0;
	}
	.text {
		font-size: 14px;
		line-height: 1.5;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 700;
	}
	.between {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.gname {
		font-weight: 600;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field label {
		font-weight: 600;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		height: 28px;
		margin: 0;
	}
	.all > summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.all[open] > summary {
		margin-bottom: 8px;
	}
	.link {
		all: unset;
		cursor: pointer;
		color: var(--link);
		text-decoration: underline;
		font-size: 13px;
	}
	.link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.accts {
		border: 0;
		padding: 0;
		margin: 6px 0 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.acct {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(130px, 170px);
		gap: 10px;
		align-items: center;
	}
	.aname {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 14px;
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 6px;
	}
	.saveas {
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-top: 1px solid var(--surface-2);
		padding-top: 14px;
		align-items: flex-start;
	}
	.saveas .h-label {
		width: 100%;
	}
	.rename {
		flex-wrap: nowrap;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
</style>
