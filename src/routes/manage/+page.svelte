<script lang="ts">
	import { enhance } from '$app/forms';
	import { shortDateTime } from '$lib/time';
	import { manageSections } from '$lib/manage-sections';

	let { data, form } = $props();
	let busy = $state<string | null>(null);

	const size = (b: number) =>
		b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
</script>

<svelte:head><title>Manage · Ben's Tally</title></svelte:head>

<h1 class="disp page-title">Manage</h1>

<nav class="card sections" aria-label="Manage sections">
	{#each manageSections as s (s.href)}
		<a class="row section" href={s.href}>
			<span class="grow">
				<span class="name">{s.label}</span>
				<span class="sub small">{s.sub}</span>
			</span>
			<span class="chev" aria-hidden="true">›</span>
		</a>
	{/each}
</nav>

<div class="grid">
	<section class="card">
		<span class="lbl">Scheduled jobs</span>
		<div class="list">
			{#each data.jobs as j (j.id)}
				<div class="row">
					<div class="grow">
						<span class="name">{j.label}</span>
						<span class="sub small">
							{j.when} ·
							{#if !j.last}never run{:else if j.last.running}running…{:else}last {shortDateTime(
									j.last.at
								)}{/if}
						</span>
						{#if j.last?.message}<span class="sub small msg" class:loss={j.last.ok === false}
								>{j.last.message}</span
							>{/if}
					</div>
					<form
						method="POST"
						action="?/run"
						use:enhance={() => {
							busy = j.id;
							return async ({ update }) => {
								await update();
								busy = null;
							};
						}}
					>
						<input type="hidden" name="job" value={j.id} />
						<button class="btn" disabled={busy !== null}
							>{busy === j.id ? 'Running…' : 'Run now'}</button
						>
					</form>
				</div>
			{/each}
		</div>
		{#if form?.message}
			<p class="sub small" class:gain={!!form.ran} class:loss={!form.ran} role="status">
				{form.message}
			</p>
		{/if}
	</section>

	<section class="card">
		<div class="head">
			<span class="lbl">Backups</span>
			<span class="sub small">Keeps {data.keep.daily} daily and {data.keep.monthly} monthly</span>
		</div>
		<div class="list">
			{#each data.backups as b (b.kind + b.name)}
				<div class="row">
					<div class="grow">
						<span class="name num">{b.name}</span>
						<span class="sub small">{shortDateTime(b.modified)} · {size(b.bytes)}</span>
					</div>
					<span class="badge">{b.kind}</span>
				</div>
			{:else}
				<p class="sub">No backups yet. The first one runs at 2:30 am, or use Run now.</p>
			{/each}
		</div>
		<a class="small link" href="/api/copy" download>Download a copy of everything now ›</a>
	</section>

	<section class="card">
		<span class="lbl">Export everything</span>
		<p class="sub">
			All your records, to keep or to open in a spreadsheet. Sign-in cookies and the sign-in owner
			are left out.
		</p>
		<div class="exports">
			<a class="btn" href="/manage/export/everything.json" download>JSON, one file</a>
			<a class="btn" href="/manage/export/everything.zip" download>CSV, one file per table (zip)</a>
		</div>
	</section>

	<section class="card">
		<span class="lbl">Claude access</span>
		{#if !data.api.read && !data.api.write}
			<p class="sub">
				Off. Give the container an API_READ_TOKEN (look only) or API_WRITE_TOKEN (can also change
				things through these same screens) and Claude can open the app from your home network. The
				tokens don't work through tally.benpost.com.
			</p>
		{:else}
			<p class="sub">
				{data.api.write ? 'Can look and make changes' : 'Can look, not change'} · home network only. Changes
				go through the same screens and edit history as yours.
			</p>
			{#if data.api.recent.length}
				<div class="list">
					{#each data.api.recent as c (c.at + c.path)}
						<div class="row">
							<div class="grow">
								<span class="name small">{c.method} {c.path}</span>
								<span class="sub small">{shortDateTime(new Date(c.at))} · {c.status}</span>
							</div>
							{#if c.method !== 'GET' && c.method !== 'HEAD'}<span class="badge">change</span>{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="sub small">No requests since the app last started.</p>
			{/if}
		{/if}
		{#if data.api.tooShort}
			<p class="sub small">A token is shorter than 32 characters, so it's ignored.</p>
		{/if}
	</section>

	<section class="card">
		<span class="lbl">Sign-in</span>
		<div class="list">
			<div class="row">
				<div class="grow">
					<span class="name">{data.owner?.name ?? 'Owner'}</span>
					<span class="sub small">
						{#if data.ownerFromEnv}
							Allowed by the container's OIDC_ALLOWED_SUBJECTS setting.
						{:else if data.owner}
							{data.owner.email ?? ''} · owner since {shortDateTime(
								new Date(data.owner.claimedAt)
							)}. Only this Pocket-ID account can sign in.
						{/if}
					</span>
				</div>
			</div>
		</div>
		<form method="POST" action="/auth/logout">
			<button class="btn">Sign out</button>
		</form>
	</section>

	<section class="card">
		<span class="lbl">About</span>
		<p class="sub">
			Ben's Tally, version <span class="num">{data.version.slice(0, 7)}</span>.
		</p>
	</section>
</div>

<style>
	.exports {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.link {
		display: inline-block;
		margin-top: 10px;
		font-weight: 600;
		text-decoration: none;
	}
	.page-title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 4px 0 14px;
	}
	.grid {
		display: grid;
		gap: 12px;
	}
	.sections {
		margin-bottom: 12px;
		padding-top: 6px;
		padding-bottom: 6px;
	}
	.section {
		color: inherit;
		text-decoration: none;
		min-height: 44px;
	}
	.chev {
		color: var(--text-3);
		font-size: 20px;
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
		gap: 8px;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.grow {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.name {
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.msg {
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
	}
	form {
		margin: 0;
	}
	@media (min-width: 900px) {
		.sections {
			display: grid;
			grid-template-columns: 1fr 1fr 1fr;
			column-gap: 18px;
		}
		.grid {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>
