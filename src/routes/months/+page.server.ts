import { monthsData } from '$lib/server/history/months';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => monthsData();
