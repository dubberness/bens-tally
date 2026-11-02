import { fail } from '@sveltejs/kit';
import { jobs, lastRun, runJob } from '$lib/server/jobs/scheduler';
import { listBackups, KEEP_DAILY, KEEP_MONTHLY } from '$lib/server/jobs/backup';
import { getSetting } from '$lib/server/settings';
import type { Owner } from '$lib/server/auth/oidc';
import { buildSha, oidc } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const owner = getSetting<Owner>('owner');
	return {
		version: buildSha,
		owner: owner ? { name: owner.name, email: owner.email, claimedAt: owner.claimedAt } : null,
		ownerFromEnv: oidc.allowedSubjects.length > 0,
		jobs: jobs.map((j) => {
			const last = lastRun(j.id);
			return {
				id: j.id,
				label: j.label,
				when: j.when,
				last: last
					? {
							at: last.startedAt.getTime(),
							ok: last.ok,
							message: last.message,
							running: last.finishedAt == null
						}
					: null
			};
		}),
		backups: listBackups(),
		keep: { daily: KEEP_DAILY, monthly: KEEP_MONTHLY }
	};
};

export const actions: Actions = {
	run: async ({ request }) => {
		const id = String((await request.formData()).get('job') ?? '');
		const job = jobs.find((j) => j.id === id);
		if (!job) return fail(400, { message: 'Unknown job' });
		const result = await runJob(job);
		return result.ok
			? { ran: job.label, message: result.message }
			: fail(500, { message: result.message });
	}
};
