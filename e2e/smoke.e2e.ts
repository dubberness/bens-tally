import { expect, test, type Page } from '@playwright/test';
import { addMonths, localMonth } from '../src/lib/time';

/*
 * Opens every main screen and the key sub-screens, phone and desktop, dark and light, and
 * fails on a server error, a console error, a failed request or a page that scrolls sideways.
 * The household is the made-up one from e2e/seed.spec.ts. The app's theme is "follow the
 * phone", so each run just tells the browser which scheme to report.
 */

const lastMonth = addMonths(localMonth(), -1);

const PAGES = [
	'/',
	'/months',
	'/months/close',
	`/months/${lastMonth}`,
	'/budget',
	'/budget/edit',
	'/budget/list',
	'/invest',
	'/invest/activity',
	'/invest/tax',
	'/invest/trades/1',
	'/invest/distributions/1',
	'/plan',
	'/transactions',
	'/accounts/1',
	'/manage',
	'/manage/accounts',
	'/manage/accounts/1',
	'/manage/events',
	'/manage/up',
	'/manage/instruments',
	'/manage/instruments/1',
	'/manage/tax',
	'/manage/inbox',
	'/manage/inbox/1',
	'/manage/rules',
	'/manage/rules/1',
	'/manage/settings',
	'/manage/import'
];

const SIZES = [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'desktop', width: 1280, height: 800 }
];
const SCHEMES = ['dark', 'light'] as const;

/** Collects everything that would make a page "broken" while it loads and settles. */
function watch(page: Page) {
	const problems: string[] = [];
	page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
	});
	page.on('requestfailed', (r) =>
		problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`)
	);
	page.on('response', (r) => {
		if (r.status() >= 400) problems.push(`${r.status()} for ${r.url()}`);
	});
	return problems;
}

for (const size of SIZES) {
	for (const scheme of SCHEMES) {
		test.describe(`${size.name}, ${scheme}`, () => {
			test.use({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });

			for (const path of PAGES) {
				test(path, async ({ page }) => {
					const problems = watch(page);
					const res = await page.goto(path, { waitUntil: 'networkidle' });
					expect(res?.status(), `status of ${path}`).toBe(200);

					await expect(page.locator('h1').first()).toBeVisible();
					await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
					// The scheme the browser reports is the one the page uses.
					const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
					expect(ground).toBe(scheme === 'dark' ? 'rgb(17, 17, 19)' : 'rgb(243, 239, 232)');
					// Nothing pushes the page wider than the screen.
					const overflow = await page.evaluate(
						() => document.documentElement.scrollWidth - document.documentElement.clientWidth
					);
					expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
					expect(problems).toEqual([]);
				});
			}
		});
	}
}

test.describe('sign-in screen', () => {
	// No token: this is what a visitor who isn't signed in sees.
	test.use({ extraHTTPHeaders: {} });

	for (const scheme of SCHEMES) {
		test(`shows in ${scheme}`, async ({ browser }) => {
			const context = await browser.newContext({ colorScheme: scheme, extraHTTPHeaders: {} });
			const page = await context.newPage();
			const problems = watch(page);
			await page.goto('/', { waitUntil: 'networkidle' });
			await expect(page).toHaveURL(/\/signin/);
			await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
			expect(problems.filter((p) => !p.startsWith('401 for'))).toEqual([]);
			await context.close();
		});
	}

	test('keeps the app itself closed', async ({ request }) => {
		const res = await request.get('/budget', { maxRedirects: 0, headers: {} });
		expect(res.status()).toBe(303);
		const api = await request.get('/manage/export/everything.json', { maxRedirects: 0 });
		expect(api.status()).toBe(303);
	});
});

test.describe('install and downloads', () => {
	test('the manifest, icons and head tags are in place', async ({ page, request }) => {
		await page.goto('/');
		const manifest = await (await request.get('/manifest.webmanifest')).json();
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		for (const icon of manifest.icons)
			expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
		expect((await request.get('/icon-180.png')).ok()).toBe(true);
		await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
		await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);
		await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
			'content',
			/viewport-fit=cover/
		);
		// Following the phone gives one theme-color per scheme.
		await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
	});

	test('the exports download', async ({ request }) => {
		const json = await request.get('/manage/export/everything.json');
		expect(json.status()).toBe(200);
		const doc = await json.json();
		expect(Object.keys(doc.tables)).toContain('accounts');
		expect(Object.keys(doc.tables)).not.toContain('sessions');

		const zip = await request.get('/manage/export/everything.zip');
		expect(zip.status()).toBe(200);
		expect(zip.headers()['content-type']).toBe('application/zip');
		const bytes = await zip.body();
		expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304'); // "PK" local header

		const months = await request.get('/months/export.csv');
		expect(months.status()).toBe(200);
		expect(await months.text()).toMatch(/^month,status,net_worth/);

		const tax = await request.get(`/invest/tax/${localMonth().slice(0, 4)}.csv`);
		expect(tax.status()).toBe(200);
		expect(await tax.text()).toContain('Sale date,Fund');
	});
});

test.describe('invest performance', () => {
	test('shows the change since the previous close and a value chart that follows its range', async ({
		page
	}) => {
		await page.goto('/invest');
		await expect(
			page.getByText(/(▲|▼) \$[\d,]+ · [\d.]+% (today|[A-Z][a-z]+)/).first()
		).toBeVisible();
		const chart = page.locator('.chartbox');
		await expect(chart.locator('svg path')).not.toHaveCount(0);
		for (const range of ['1W', '1M', '1Y', 'All']) {
			await chart.getByRole('button', { name: range, exact: true }).click();
			await expect(chart.getByRole('button', { name: range, exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
		}
		await expect(chart.getByText('Market change', { exact: true })).toBeVisible();
		await expect(chart.getByText('Money in')).toBeVisible();
	});
});

test.describe('theme setting', () => {
	test('Light, Dark and Follow the phone each take effect', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/manage/settings');
		const choose = async (label: string) => {
			await page.getByLabel('Theme').selectOption({ label });
			await page.getByRole('button', { name: 'Save settings' }).click();
			await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
		};
		const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

		await choose('Light');
		expect(await ground()).toBe('rgb(243, 239, 232)'); // switched at once, even with the phone in dark
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
		expect(await ground()).toBe('rgb(243, 239, 232)');

		await choose('Dark');
		await page.emulateMedia({ colorScheme: 'light' });
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		expect(await ground()).toBe('rgb(17, 17, 19)');

		await choose('Follow the phone'); // leave it as the other tests expect
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
	});
});
