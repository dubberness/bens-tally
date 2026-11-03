import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { SEED_PARAMS, normaliseParams, paramProblem, type PlanParams } from '$lib/plan/params';

export interface Scenario {
	/** 0 is the unsaved starting scenario shown until the first save. */
	id: number;
	name: string;
	isDefault: boolean;
	params: PlanParams;
}

const toScenario = (r: typeof schema.scenarios.$inferSelect): Scenario => ({
	id: r.id,
	name: r.name,
	isDefault: r.isDefault,
	params: normaliseParams(r.params)
});

export const STARTING_NAME = 'Base';

/** Every scenario, the base one first. Before anything is saved, an unsaved starting one. */
export function listScenarios(): Scenario[] {
	const rows = db.select().from(schema.scenarios).orderBy(asc(schema.scenarios.id)).all();
	if (!rows.length)
		return [{ id: 0, name: STARTING_NAME, isDefault: true, params: { ...SEED_PARAMS } }];
	const all = rows.map(toScenario);
	return [...all.filter((s) => s.isDefault), ...all.filter((s) => !s.isDefault)];
}

export const baseScenario = (): Scenario => listScenarios()[0];

export function getScenario(id: number): Scenario | undefined {
	return listScenarios().find((s) => s.id === id);
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 60);

function nameProblem(name: string, exceptId?: number): string | null {
	if (!name) return 'Give the what-if a name';
	const clash = listScenarios().find(
		(s) => s.id !== 0 && s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase()
	);
	return clash ? `There is already a scenario called “${clash.name}”` : null;
}

export type Saved = { ok: true; id: number } | { ok: false; error: string };

/** Make a new scenario. The first one ever saved is the base. */
export function createScenario(name: string, params: PlanParams): Saved {
	const n = cleanName(name);
	const bad = paramProblem(params) ?? nameProblem(n);
	if (bad) return { ok: false, error: bad };
	const now = new Date();
	const first = !db.select().from(schema.scenarios).limit(1).get();
	const row = db
		.insert(schema.scenarios)
		.values({ name: n, isDefault: first, params, createdAt: now, updatedAt: now })
		.returning({ id: schema.scenarios.id })
		.get();
	return { ok: true, id: row.id };
}

/** Save the assumptions into a scenario; id 0 (never saved) becomes the base. */
export function saveScenario(id: number, params: PlanParams): Saved {
	const bad = paramProblem(params);
	if (bad) return { ok: false, error: bad };
	if (id === 0) return createScenario(STARTING_NAME, params);
	const found = db.select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).get();
	if (!found) return { ok: false, error: 'That scenario no longer exists' };
	db.update(schema.scenarios)
		.set({ params, updatedAt: new Date() })
		.where(eq(schema.scenarios.id, id))
		.run();
	return { ok: true, id };
}

export function renameScenario(id: number, name: string): Saved {
	const n = cleanName(name);
	const bad = nameProblem(n, id);
	if (bad) return { ok: false, error: bad };
	if (id === 0) return { ok: false, error: 'Save the assumptions first, then rename' };
	db.update(schema.scenarios)
		.set({ name: n, updatedAt: new Date() })
		.where(eq(schema.scenarios.id, id))
		.run();
	return { ok: true, id };
}

export function makeBase(id: number): Saved {
	if (!db.select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).get())
		return { ok: false, error: 'That scenario no longer exists' };
	db.transaction((tx) => {
		tx.update(schema.scenarios).set({ isDefault: false }).run();
		tx.update(schema.scenarios).set({ isDefault: true }).where(eq(schema.scenarios.id, id)).run();
	});
	return { ok: true, id };
}

/** The base scenario can't be deleted; make another the base first. */
export function deleteScenario(id: number): Saved {
	const found = db.select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).get();
	if (!found) return { ok: false, error: 'That scenario no longer exists' };
	if (found.isDefault)
		return { ok: false, error: 'Make another scenario the base before deleting this one' };
	db.delete(schema.scenarios).where(eq(schema.scenarios.id, id)).run();
	return { ok: true, id: baseScenario().id };
}
