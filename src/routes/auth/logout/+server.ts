import { redirect } from '@sveltejs/kit';
import { endSession } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	endSession(cookies);
	redirect(303, '/signin?signedout=1');
};
