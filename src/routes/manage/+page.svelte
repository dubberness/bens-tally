<script lang="ts">
	import { enhance } from '$app/forms';
	import { shortDateTime } from '$lib/time';

	let { data, form } = $props();
	let busy = $state<string | null>(null);

	const size = (b: number) =>
		b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
</script>

<svelte:head><title>Manage · Ben's Tally</title></svelte:head>

<h1 class="disp page-title">Manage</h1>

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
			Ben's Tally, version <span class="num">{data.version.slice(0, 7)}</span>. Accounts, budget
			lines, rules and plan settings will all be edited here as they arrive.
		</p>
	</section>
</div>

<style>
	.page-title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 4px 0 14px;
	}
	.grid {
		display: grid;
		gap: 12px;
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
		.grid {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>
