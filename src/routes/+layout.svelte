<script lang="ts">
	import '@fontsource-variable/inter';
	import '@fontsource-variable/bricolage-grotesque';
	import '../app.css';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';

	let { data, children } = $props();

	const tabs = [
		{ href: '/', label: 'Home', icon: 'home' },
		{ href: '/months', label: 'Months', icon: 'months' },
		{ href: '/budget', label: 'Budget', icon: 'budget' },
		{ href: '/invest', label: 'Invest', icon: 'invest' },
		{ href: '/plan', label: 'Plan', icon: 'plan' }
	] as const;

	const path = $derived(page.url.pathname);
	const bare = $derived(path === '/signin');
	const isOn = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
</script>

{#if bare}
	{@render children()}
{:else}
	<div class="shell">
		<aside class="side" aria-label="Main">
			<a href="/" class="side-brand"><Wordmark size={20} /></a>
			<nav>
				{#each tabs as t (t.href)}
					<a
						href={t.href}
						class="side-link"
						class:on={isOn(t.href)}
						aria-current={isOn(t.href) ? 'page' : undefined}
					>
						<Icon name={t.icon} />{t.label}
					</a>
				{/each}
				<a
					href="/manage"
					class="side-link"
					class:on={path.startsWith('/manage')}
					aria-current={path.startsWith('/manage') ? 'page' : undefined}
				>
					<Icon name="settings" />Manage
				</a>
			</nav>
		</aside>

		<div class="main">
			<header class="top">
				<div class="top-text">
					<Wordmark size={22} />
					<span class="sub">{data.today}</span>
				</div>
				<a href="/manage" class="icon-btn" aria-label="Manage and settings"
					><Icon name="settings" size={20} /></a
				>
			</header>

			<main>{@render children()}</main>
		</div>

		<nav class="tabs" aria-label="Main">
			{#each tabs as t (t.href)}
				<a
					href={t.href}
					class="tab"
					class:on={isOn(t.href)}
					aria-current={isOn(t.href) ? 'page' : undefined}
				>
					<Icon name={t.icon} />{t.label}
				</a>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.shell {
		min-height: 100dvh;
	}
	.main {
		max-width: 1180px;
		margin: 0 auto;
		padding-bottom: calc(92px + env(safe-area-inset-bottom));
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: calc(18px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) 6px
			calc(20px + env(safe-area-inset-left));
	}
	.top-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.top-text .sub {
		font-size: 12px;
	}
	.icon-btn {
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
	.icon-btn:hover {
		color: var(--text);
	}
	main {
		padding: 14px calc(var(--gutter) + env(safe-area-inset-right)) 0
			calc(var(--gutter) + env(safe-area-inset-left));
	}

	.tabs {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: space-around;
		padding: 8px calc(6px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom))
			calc(6px + env(safe-area-inset-left));
		background: var(--nav);
		border-top: 1px solid var(--border);
		z-index: 10;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-3);
		text-decoration: none;
		min-width: 60px;
		min-height: 48px;
	}
	.tab:hover {
		color: var(--text);
	}
	.tab.on {
		color: var(--accent);
	}

	.side {
		display: none;
	}

	@media (min-width: 900px) {
		.shell {
			display: grid;
			grid-template-columns: 232px 1fr;
		}
		.tabs,
		.top .icon-btn,
		.top :global(.wordmark) {
			display: none;
		}
		.top-text .sub {
			font-size: 13px;
		}
		.main {
			width: 100%;
			padding-bottom: 48px;
		}
		.top {
			padding: 28px 32px 4px;
		}
		main {
			padding: 14px 32px 0;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 22px;
			position: sticky;
			top: 0;
			height: 100dvh;
			padding: 26px 16px;
			background: var(--nav);
			border-right: 1px solid var(--border);
		}
		.side-brand {
			text-decoration: none;
			padding: 0 10px;
		}
		.side nav {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.side-link {
			display: flex;
			align-items: center;
			gap: 12px;
			min-height: 44px;
			padding: 0 12px;
			border-radius: 12px;
			color: var(--text-2);
			font-weight: 600;
			text-decoration: none;
		}
		.side-link:hover {
			color: var(--text);
			background: var(--surface);
		}
		.side-link.on {
			color: var(--accent);
			background: var(--surface);
		}
		.side-link:last-child {
			margin-top: 12px;
		}
	}
</style>
