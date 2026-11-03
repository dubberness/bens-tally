<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { shortDate, shortDateTime } from '$lib/time';

	let { data, form } = $props();

	type Incoming = {
		orderId: string | null;
		ticker: string;
		date: string;
		side: string;
		unitsE6: number;
		priceE4: number;
		valueCents: number;
		feeCents: number;
	};
	type IncomeLine = {
		ticker: string;
		distributionId: number | null;
		outcome: 'added' | 'same' | 'differs';
		fields: string[];
		incoming: { date: string; amountCents: number; reinvested: boolean };
	};
	type Result =
		| { kind: 'differs'; tradeId: number; incoming: Incoming; fields: string[]; decision?: string }
		| { kind: 'income'; date: string; lines: IncomeLine[]; decision?: string }
		| { kind: 'trade'; tradeId: number; outcome: string; decision?: string }
		| { kind: 'problem'; message: string; headers: string[]; row: string[]; decision?: string }
		| { kind: string; reason?: string; decision?: string };

	const units = (e6: number) =>
		(e6 / 1e6).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
	const money = (c: number) => formatMoney(c, { cents: true });
	const LABEL: Record<string, string> = {
		date: 'Date',
		units: 'Units',
		value: 'Value',
		fee: 'Fee',
		price: 'Price'
	};
	const show = (t: Omit<Incoming, 'ticker'>, f: string) =>
		f === 'date'
			? shortDate(t.date, { year: true })
			: f === 'units'
				? units(t.unitsE6)
				: f === 'value'
					? money(t.valueCents)
					: f === 'fee'
						? money(t.feeCents)
						: `$${(t.priceE4 / 1e4).toFixed(4)}`;
	const OUTCOME: Record<string, string> = {
		new: 'New',
		same: 'Already here',
		link: 'Gains its order ID',
		differs: 'Differs: to the Inbox'
	};
	const result = (r: unknown) => r as Result;
	const DIST_LABEL: Record<string, string> = {
		date: 'Paid on',
		amount: 'Amount',
		reinvested: 'Kept as'
	};
	const DIST_WORDS: Record<string, string> = {
		date: 'the date',
		amount: 'the amount',
		reinvested: 'whether it was reinvested'
	};
	/** "a", "a and b", "a, b and c". */
	const list = (xs: string[]) =>
		xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
	const showDist = (d: { date: string; amountCents: number; reinvested: boolean }, f: string) =>
		f === 'date'
			? shortDate(d.date, { year: true })
			: f === 'amount'
				? money(d.amountCents)
				: d.reinvested
					? 'Reinvested'
					: 'Cash';
	const theirs = (source: string) => (source === 'email' ? 'email' : 'file');
	/** What happened to an item that needed no decision. */
	const doneText = (item: { status: string; result: unknown }) => {
		const r = result(item.result);
		if (r?.decision) return r.decision;
		if (r?.kind === 'trade' && 'outcome' in r)
			return r.outcome === 'added'
				? 'Trade added'
				: r.outcome === 'link'
					? 'Matched a trade, which gained its order ID'
					: 'Already in the app';
		if (r?.kind === 'income' && 'lines' in r) {
			const added = r.lines.filter((l) => l.outcome === 'added').length;
			return added
				? `${added} distribution${added === 1 ? '' : 's'} added`
				: 'Distributions already in the app';
		}
		if (r && 'reason' in r && r.reason) return `Ignored: ${r.reason}`;
		return item.status;
	};
	const ago = (t: number | Date | null | undefined) => (t ? shortDateTime(new Date(t)) : 'never');
	let busy = $state(false);
	let remap = $state<HTMLButtonElement>();
	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
	const sample = (col: number) => {
		const p = form && 'preview' in form ? form.preview : null;
		return p && col >= 0 ? (p.sampleRow[col] ?? '') : '';
	};
</script>

<svelte:head><title>Inbox · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Inbox and CSV</h1>

<div class="grid">
	<div class="col">
		<section class="card">
			<div class="head">
				<span class="lbl">To look at</span>
				<span class="sub small">{data.review.length || 'Nothing'}</span>
			</div>
			{#each data.review as item (item.id)}
				{@const r = result(item.result)}
				<div class="item">
					<div class="item-head">
						<span class="sub small"
							>{item.subject ?? item.source} · {shortDateTime(item.receivedAt)}</span
						>
						{#if item.source === 'email'}<a class="small link" href="/manage/inbox/{item.id}"
								>Show the email ›</a
							>{/if}
					</div>
					{#if r?.kind === 'differs' && 'incoming' in r}
						{@const mine = data.trades[r.tradeId]}
						<p>
							<span class="strong"
								>{r.incoming.side === 'buy' ? 'Buy' : 'Sell'}
								{units(r.incoming.unitsE6)}
								{r.incoming.ticker}</span
							>
							{#if r.incoming.orderId}<span class="sub small">· order {r.incoming.orderId}</span
								>{/if}
						</p>
						{#if mine}
							<p class="sub small">
								Looks like a trade the app has, but {list(
									r.fields.map((f) => LABEL[f].toLowerCase())
								)}
								{r.fields.length === 1 ? 'differs' : 'differ'}.
							</p>
							<table class="cmp num">
								<thead
									><tr><th></th><th>In the app</th><th>In the {theirs(item.source)}</th></tr></thead
								>
								<tbody>
									{#each ['date', 'units', 'price', 'value', 'fee'] as f (f)}
										<tr class:diff={r.fields.includes(f)}>
											<th>{LABEL[f]}</th>
											<td>{show(mine, f)}</td>
											<td>{show(r.incoming, f)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<p class="sub small">The app's copy of this trade was deleted since.</p>
						{/if}
						<form method="POST" action="?/resolve" class="choices" use:enhance={submitting}>
							<input type="hidden" name="id" value={item.id} />
							{#if mine}
								<button class="btn primary" name="action" value="use-file" disabled={busy}
									>Use the {theirs(item.source)}'s</button
								>
								<button class="btn" name="action" value="keep" disabled={busy}
									>Keep the app's</button
								>
							{/if}
							{#if !mine || mine.orderId !== r.incoming.orderId}
								<button class={mine ? 'alt' : 'btn'} name="action" value="add" disabled={busy}
									>{mine ? "It's a different trade: add it" : 'Add it'}</button
								>
							{/if}
							{#if mine}<a class="small link" href="/invest/trades/{mine.id}">Open the app's ›</a
								>{/if}
						</form>
					{:else if r?.kind === 'income' && 'lines' in r}
						<p class="strong">Distributions paid {shortDate(r.date, { year: true })}</p>
						{#each r.lines.filter((l) => l.outcome === 'differs') as l (l.ticker)}
							{@const mine = l.distributionId != null ? data.distributions[l.distributionId] : null}
							<p class="sub small">
								{#if mine}
									{l.ticker}: the app has this one, but {list(l.fields.map((f) => DIST_WORDS[f]))}
									{l.fields.length === 1 ? 'differs' : 'differ'}.
								{:else}
									{l.ticker}: the app's copy was deleted since; using the email's adds it again.
								{/if}
							</p>
							{#if mine}
								<table class="cmp num">
									<thead><tr><th>{l.ticker}</th><th>In the app</th><th>In the email</th></tr></thead
									>
									<tbody>
										{#each ['date', 'amount', 'reinvested'] as f (f)}
											<tr class:diff={l.fields.includes(f)}>
												<th>{DIST_LABEL[f]}</th>
												<td>{showDist(mine, f)}</td>
												<td>{showDist(l.incoming, f)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
						{/each}
						{#if r.lines.some((l) => l.outcome !== 'differs')}
							<p class="sub small">
								The rest ({r.lines
									.filter((l) => l.outcome !== 'differs')
									.map((l) => l.ticker)
									.join(', ')}) went in already or match the app.
							</p>
						{/if}
						<form method="POST" action="?/resolve" class="choices" use:enhance={submitting}>
							<input type="hidden" name="id" value={item.id} />
							<button class="btn primary" name="action" value="use-file" disabled={busy}
								>Use the email's</button
							>
							<button class="btn" name="action" value="keep" disabled={busy}>Keep the app's</button>
						</form>
					{:else if r?.kind === 'problem' && 'row' in r}
						<p class="strong">{r.message}.</p>
						<dl class="raw small">
							{#each r.row as cell, i (i)}
								{#if cell}<dt>{r.headers[i] ?? `Column ${i + 1}`}</dt>
									<dd>{cell}</dd>{/if}
							{/each}
						</dl>
						<form method="POST" action="?/resolve" class="choices" use:enhance={submitting}>
							<input type="hidden" name="id" value={item.id} />
							<button class="btn" name="action" value="ignore" disabled={busy}>Ignore</button>
							<a class="small link" href="/invest/trades/new">Add it by hand ›</a>
						</form>
					{:else}
						<p>
							{r && 'reason' in r && r.reason
								? r.reason
								: 'Not something the app knows how to read.'}
						</p>
						<form method="POST" action="?/resolve" class="choices" use:enhance={submitting}>
							<input type="hidden" name="id" value={item.id} />
							<button class="btn" name="action" value="ignore" disabled={busy}>Ignore</button>
						</form>
					{/if}
					{#if form && 'itemError' in form && form.itemId === item.id}
						<p class="h-error" role="alert">{form.itemError}</p>
					{/if}
				</div>
			{:else}
				<p class="sub">
					Nothing to look at. Imports that don't match what the app has, or that it can't read, wait
					here for you.
				</p>
			{/each}
		</section>

		{#if data.done.length}
			<section class="card">
				<details>
					<summary class="row">
						<span class="lbl grow">Done</span>
						<span class="sub small">{data.done.length} recent</span>
					</summary>
					{#each data.done as item (item.id)}
						<div class="row line">
							<span class="grow names">
								{#if item.source === 'email'}
									<a class="small plain" href="/manage/inbox/{item.id}">{item.subject ?? 'Email'}</a
									>
								{:else}
									<span class="small">{item.subject ?? item.source}</span>
								{/if}
								<span class="sub small">{doneText(item)} · {shortDateTime(item.receivedAt)}</span>
							</span>
							{#if item.status === 'ignored'}
								<form method="POST" action="?/resolve" use:enhance={submitting}>
									<input type="hidden" name="id" value={item.id} />
									<button class="btn small-btn" name="action" value="reopen" disabled={busy}
										>Look again</button
									>
								</form>
							{/if}
						</div>
					{/each}
				</details>
			</section>
		{/if}
	</div>

	<div class="col">
		<section class="card">
			<div class="head">
				<span class="lbl">Betashares emails</span>
				{#if data.email.configured}
					<form method="POST" action="?/check" use:enhance={submitting}>
						<button class="btn small-btn" disabled={busy}>Check now</button>
					</form>
				{/if}
			</div>
			{#if !data.email.configured}
				<p class="sub small">
					Not set up yet. Once the mail Worker is running, give the container its WORKER_URL and
					WORKER_TOKEN; order and income emails then arrive here every 15 minutes.
				</p>
			{:else}
				<dl class="status small">
					<dt>Last checked</dt>
					<dd>
						{ago(data.email.lastRun?.startedAt)}{data.email.lastRun?.ok === false
							? ' (failed)'
							: ''}
					</dd>
					<dt>Last email</dt>
					<dd>{ago(data.email.lastEmailAt)}</dd>
					{#if data.email.worker}
						<dt>Waiting at the Worker</dt>
						<dd>{data.email.worker.pending}</dd>
						<dt>Refused, last 30 days</dt>
						<dd>{data.email.worker.rejected}</dd>
					{/if}
				</dl>
				{#if data.email.lastRun?.message}
					<p class="sub small" class:loss={data.email.lastRun.ok === false}>
						{data.email.lastRun.message}
					</p>
				{/if}
				{#if data.email.worker?.refused.length}
					<details>
						<summary class="sub small">Refused mail</summary>
						{#each data.email.worker.refused as m, i (i)}
							<div class="row line">
								<span class="grow names">
									<span class="small">{m.subject ?? '(no subject)'}</span>
									<span class="sub small"
										>{m.sender ?? 'unknown sender'} · {ago(m.at)} · {m.reason}</span
									>
								</span>
							</div>
						{/each}
					</details>
				{/if}
			{/if}
			{#if form && 'checked' in form}<p class="small" class:h-ok={form.ok} class:h-error={!form.ok}>
					{form.checked}
				</p>{/if}
		</section>

		<section class="card">
			<span class="lbl">Betashares CSV</span>
			{#if form && 'preview' in form && form.preview}
				{@const p = form.preview}
				<p class="sub small">
					{form.fileName}: {p.rows.length + p.problems.length} trades{p.skipped
						? `, ${p.skipped} cancelled or unfilled left out`
						: ''}. Check the columns, then apply.
				</p>
				<form method="POST" action="?/apply" class="h-form" use:enhance={submitting}>
					<input type="hidden" name="text" value={form.text} />
					<input type="hidden" name="fileName" value={form.fileName} />
					<div class="mapping">
						{#each data.fields as f (f.key)}
							<label class="h-label"
								>{f.label}{f.required ? '' : ' (optional)'}
								<select
									class="h-select"
									name="map_{f.key}"
									value={p.mapping[f.key]}
									onchange={(e) => e.currentTarget.form?.requestSubmit(remap)}
								>
									<option value={-1}>Not in the file</option>
									{#each p.headers as h, i (i)}<option value={i}>{h || `Column ${i + 1}`}</option
										>{/each}
								</select>
								{#if sample(p.mapping[f.key])}<span class="sub small"
										>e.g. {sample(p.mapping[f.key])}</span
									>{/if}
							</label>
						{/each}
					</div>
					<ul class="counts">
						<li><span class="strong num">{p.counts.new}</span> new</li>
						<li><span class="strong num">{p.counts.same}</span> already in the app</li>
						<li><span class="strong num">{p.counts.link}</span> match and gain an order ID</li>
						<li><span class="strong num">{p.counts.differs}</span> differ and go to the Inbox</li>
						{#if p.counts.problems}<li>
								<span class="strong num">{p.counts.problems}</span> can't be read and go to the Inbox
							</li>{/if}
					</ul>
					{#if p.newFunds.length}
						<p class="sub small">
							New funds: {p.newFunds.join(', ')}. They're added with no target; set one in Manage ›
							Funds.
						</p>
					{/if}
					<details>
						<summary class="sub small">Every row</summary>
						{#each p.rows as r (r.line)}
							<div class="row line">
								<span class="grow names">
									<span class="small strong"
										>{r.side === 'buy' ? 'Buy' : 'Sell'} {units(r.unitsE6)} {r.ticker}</span
									>
									<span class="sub small num"
										>{shortDate(r.date, { year: true })} · {money(r.valueCents)}{r.orderId
											? ` · ${r.orderId}`
											: ''}</span
									>
								</span>
								<span class="badge" class:ok={r.outcome === 'new'}>{OUTCOME[r.outcome]}</span>
							</div>
						{/each}
						{#each p.problems as r (r.line)}
							<div class="row line">
								<span class="grow sub small">Line {r.line}: {r.message}</span>
								<span class="badge">To the Inbox</span>
							</div>
						{/each}
					</details>
					<div class="h-actions">
						<button class="btn primary" disabled={busy}>Apply</button>
						<button class="btn" formaction="?/remap" bind:this={remap} disabled={busy}
							>Check again</button
						>
						<a class="small link" href="/manage/inbox">Cancel</a>
					</div>
				</form>
			{:else}
				{#if form && 'applied' in form && form.applied}
					{@const a = form.applied}
					<p class="h-ok" role="status">
						Done: {a.added} added, {a.linked} gained an order ID, {a.same} already here{a.review
							? `, ${a.review} to look at in the Inbox`
							: ''}{a.alreadyInInbox ? `, ${a.alreadyInInbox} already in the Inbox` : ''}.
					</p>
				{/if}
				<p class="sub small">
					Download your trade history from Betashares as CSV and upload it here. Trades the app
					already has, from the sheet or emails, are matched by order ID, or by fund, date and
					units, and left alone. You'll see what each row would do before anything changes.
				</p>
				<form
					method="POST"
					action="?/upload"
					enctype="multipart/form-data"
					class="h-form"
					use:enhance={submitting}
				>
					<input class="file" type="file" name="file" accept=".csv,text/csv" required />
					<div class="h-actions">
						<button class="btn primary" disabled={busy}>{busy ? 'Reading…' : 'Upload'}</button>
					</div>
				</form>
			{/if}
			{#if form && 'csvError' in form}<p class="h-error" role="alert">{form.csvError}</p>{/if}
		</section>
	</div>
</div>

<style>
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
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 600;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.link {
		font-weight: 600;
		text-decoration: none;
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--border);
	}
	.item:first-of-type {
		border-top: 0;
		padding-top: 0;
	}
	.cmp {
		border-collapse: collapse;
		font-size: 13px;
		width: 100%;
	}
	.cmp th,
	.cmp td {
		text-align: right;
		padding: 4px 0 4px 8px;
		font-weight: 400;
	}
	.cmp thead th {
		color: var(--text-3);
		font-size: 12px;
	}
	.cmp tbody th {
		text-align: left;
		color: var(--text-2);
		padding-left: 0;
	}
	.cmp tr.diff td {
		color: var(--text);
		font-weight: 600;
	}
	.cmp tr:not(.diff) td {
		color: var(--text-3);
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.raw {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 12px;
		margin: 0;
	}
	.raw dt {
		color: var(--text-3);
	}
	.raw dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	details summary {
		cursor: pointer;
		list-style: none;
	}
	details summary::-webkit-details-marker {
		display: none;
	}
	.small-btn {
		min-height: 36px;
		font-size: 13px;
	}
	.mapping {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 12px;
	}
	.counts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
	}
	.item-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: baseline;
	}
	.item-head .link {
		flex: none;
	}
	.plain {
		color: var(--text);
		text-decoration: none;
	}
	.status {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}
	.status dt {
		color: var(--text-2);
	}
	.status dd {
		margin: 0;
		text-align: right;
	}
	.badge.ok {
		color: var(--gain);
	}
	.file {
		color: var(--text-2);
		font: inherit;
		max-width: 100%;
	}
	.file::file-selector-button {
		background: var(--surface-2);
		color: var(--text);
		border: 0;
		border-radius: 999px;
		padding: 10px 16px;
		margin-right: 10px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.alt {
		background: none;
		border: 0;
		padding: 0;
		min-height: 44px;
		color: var(--text-2);
		font: inherit;
		font-size: 13px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
