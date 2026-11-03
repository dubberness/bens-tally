<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';

	let { data, form } = $props();
	const a = $derived(data.account);
	let calcKind = $state('');
	let kind = $state('');
	$effect.pre(() => {
		calcKind = data.calc?.kind ?? '';
		kind = data.account.kind;
	});
	const p = $derived((data.calc?.params ?? {}) as Record<string, number | string | null>);
	const money = (c: unknown) => (typeof c === 'number' ? (c / 100).toFixed(2) : '');
	const pct = (bp: unknown) => (typeof bp === 'number' ? String(bp / 100) : '');
	const SOURCE_LABEL: Record<string, string> = {
		manual: 'You type it',
		calculated: 'A calculation',
		up: 'Up',
		betashares: 'Betashares'
	};
</script>

<svelte:head><title>{a.name} · Accounts · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage/accounts"><Icon name="back" size={18} /> Accounts</a>
<div class="head">
	<h1 class="disp h-title">{a.name}</h1>
	<a class="btn" href="/accounts/{a.id}">Open account →</a>
</div>

<div class="grid">
	<section class="card">
		<span class="lbl">Details</span>
		<form
			method="POST"
			action="?/save"
			class="h-form"
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
		>
			<label class="h-label"
				>Name <input class="h-input" name="name" value={a.name} required /></label
			>
			<div class="h-row2">
				<label class="h-label"
					>Kind
					<select class="h-select" name="kind" bind:value={kind}>
						{#each data.kinds as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
					</select></label
				>
				<label class="h-label"
					>Owned or owed
					<select class="h-select" name="side">
						<option value="asset" selected={a.side === 'asset'}>Owned</option>
						<option value="liability" selected={a.side === 'liability'}>Owed</option>
					</select></label
				>
				<label class="h-label"
					>Value comes from
					<select class="h-select" name="source">
						{#each data.sources as s (s)}<option value={s} selected={a.source === s}
								>{SOURCE_LABEL[s]}</option
							>{/each}
					</select></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Close the month position
					<input
						class="h-input"
						name="closeOrder"
						inputmode="numeric"
						value={a.closeOrder ?? ''}
						placeholder="Not listed"
					/>
					<span class="sub small">Lower comes first; blank keeps it off that screen.</span></label
				>
				<label class="h-label"
					>Remind after (days)
					<input
						class="h-input"
						name="updateEveryDays"
						inputmode="numeric"
						value={a.updateEveryDays ?? ''}
						placeholder="Never"
					/>
					<span class="sub small"
						>A check appears when a typed account goes this long without a new entry.</span
					></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Opened on <input
						class="h-input"
						type="date"
						name="openedOn"
						value={a.openedOn ?? ''}
					/></label
				>
				<label class="h-label"
					>Icon <input
						class="h-input"
						name="icon"
						value={a.icon ?? ''}
						placeholder="Optional, one word"
					/></label
				>
			</div>
			<div class="colour">
				<label class="h-check"
					><input type="checkbox" name="useColour" checked={!!a.colour} /> Own colour</label
				>
				<input type="color" name="colour" value={a.colour || '#7fb2ff'} aria-label="Colour" />
			</div>
			<label class="h-check"
				><input type="checkbox" name="investable" checked={a.investable} /> Investable (counts in Home’s
				Investable view)</label
			>
			<label class="h-label"
				>Note <textarea class="h-textarea" name="note" rows="2">{a.note ?? ''}</textarea></label
			>
			<div class="h-actions">
				<button class="btn primary">Save</button>
				{#if form?.saved}<span class="h-ok" role="status">Saved</span>{/if}
				{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
			</div>
		</form>
	</section>

	<div class="col">
		<section class="card">
			<span class="lbl">Calculation</span>
			<p class="sub small">
				A calculated account works out its own value. A share follows another account (a lender’s
				part of the home); an amortised loan follows its repayment schedule. Loan terms on a typed
				loan only give Close the month an expected balance. A newer entry typed by hand always wins.
			</p>
			<form
				method="POST"
				action="?/calc"
				class="h-form"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
			>
				<label class="h-label"
					>Kind
					<select class="h-select" name="calcKind" bind:value={calcKind}>
						<option value="">None</option>
						<option value="share_of">Share of another account</option>
						<option value="amortised">Amortised loan</option>
						<option value="loan_terms">Loan terms (expected balance only)</option>
					</select></label
				>
				{#if calcKind === 'share_of'}
					<div class="h-row2">
						<label class="h-label"
							>Of
							<select class="h-select" name="target">
								{#each data.others as o (o.id)}<option value={o.id} selected={p.accountId === o.id}
										>{o.name}</option
									>{/each}
							</select></label
						>
						<label class="h-label"
							>Share (%) <input
								class="h-input"
								name="share"
								inputmode="decimal"
								value={pct(p.shareBp)}
								required
							/></label
						>
					</div>
				{:else if calcKind === 'amortised'}
					<div class="h-row2">
						<label class="h-label"
							>Amount borrowed
							<span class="h-money"
								><span class="cur">$</span><input
									name="principal"
									inputmode="decimal"
									value={money(p.principalCents)}
									required
								/></span
							></label
						>
						<label class="h-label"
							>Rate (% a year) <input
								class="h-input"
								name="rate"
								inputmode="decimal"
								value={pct(p.annualRateBp)}
								required
							/></label
						>
						<label class="h-label"
							>Repayment a month
							<span class="h-money"
								><span class="cur">$</span><input
									name="repayment"
									inputmode="decimal"
									value={money(p.repaymentCents)}
									required
								/></span
							></label
						>
						<label class="h-label"
							>First repayment <input
								class="h-input"
								type="date"
								name="firstPayment"
								value={p.firstPaymentDate ?? ''}
								required
							/></label
						>
						<label class="h-label"
							>Number of repayments <input
								class="h-input"
								name="payments"
								inputmode="numeric"
								value={p.payments ?? ''}
								placeholder="Until paid off"
							/></label
						>
					</div>
				{:else if calcKind === 'loan_terms'}
					<div class="h-row2">
						<label class="h-label"
							>Rate (% a year) <input
								class="h-input"
								name="rate"
								inputmode="decimal"
								value={pct(p.annualRateBp)}
								required
							/></label
						>
						<label class="h-label"
							>Repayment a month
							<span class="h-money"
								><span class="cur">$</span><input
									name="repayment"
									inputmode="decimal"
									value={money(p.repaymentCents)}
									required
								/></span
							></label
						>
						<label class="h-label"
							>Repayment day <input
								class="h-input"
								name="paymentDay"
								inputmode="numeric"
								value={p.paymentDay ?? ''}
								placeholder="Month end"
							/></label
						>
					</div>
				{/if}
				<div class="h-actions">
					<button class="btn primary">Save calculation</button>
					{#if form?.calcSaved}<span class="h-ok" role="status">Saved</span>{/if}
					{#if form?.calcError}<span class="h-error" role="alert">{form.calcError}</span>{/if}
				</div>
				{#if calcKind && calcKind !== 'loan_terms' && a.source !== 'calculated'}
					<p class="sub small">Set “Value comes from” to “A calculation” for it to take effect.</p>
				{/if}
			</form>
		</section>

		<section class="card">
			<span class="lbl">{a.closedOn ? `Closed on ${a.closedOn}` : 'Close'}</span>
			{#if a.closedOn}
				<form method="POST" action="?/reopen" use:enhance><button class="btn">Reopen</button></form>
			{:else}
				<form method="POST" action="?/close" class="h-form inline" use:enhance>
					<label class="h-label grow"
						>Stops counting from <input
							class="h-input"
							type="date"
							name="on"
							value={data.today}
							required
						/></label
					>
					<button class="btn danger">Close account</button>
				</form>
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
		gap: 10px;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.colour {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	input[type='color'] {
		width: 48px;
		height: 44px;
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		background: var(--inset);
		padding: 4px;
	}
	form {
		margin: 0;
	}
	.inline {
		flex-direction: row;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 180px;
	}
</style>
