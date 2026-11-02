import { fail } from '@sveltejs/kit';
import { dismissCheck } from '$lib/server/checks';
import { homeData } from '$lib/server/history/home';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => homeData();

export const actions: Actions = {
	dismiss: async ({ request }) => {
		const f = await request.formData();
		const key = String(f.get('key') ?? '');
		const fingerprint = String(f.get('fingerprint') ?? '');
		if (!key) return fail(400, { message: 'Nothing to dismiss' });
		dismissCheck(key, fingerprint);
		return { dismissed: key };
	}
};
