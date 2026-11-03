import { beforeEach, describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import { SEED_PARAMS } from '$lib/plan/params';
import { setSetting } from '../settings';
import { PREFS } from '../history/prefs';
import {
	baseScenario,
	createScenario,
	deleteScenario,
	getScenario,
	listScenarios,
	makeBase,
	renameScenario,
	saveScenario
} from './scenarios';
import { planContext } from './context';

const params = { ...SEED_PARAMS, returnPct: 6, accessAge: 62 };

describe('scenarios', () => {
	beforeEach(() => {
		db.delete(schema.scenarios).run();
	});

	it('shows an unsaved starting scenario until the first save', () => {
		const list = listScenarios();
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ id: 0, isDefault: true, params: SEED_PARAMS });
		expect(db.select().from(schema.scenarios).all()).toHaveLength(0);
	});

	it('saving the unsaved scenario makes the base', () => {
		const r = saveScenario(0, params);
		expect(r.ok).toBe(true);
		const base = baseScenario();
		expect(base.isDefault).toBe(true);
		expect(base.params.returnPct).toBe(6);
		expect(listScenarios()).toHaveLength(1);
	});

	it('saves what-ifs next to the base and keeps the base first', () => {
		saveScenario(0, params);
		const r = createScenario('Retire early', { ...params, spendingCents: 200_000 });
		expect(r.ok).toBe(true);
		const list = listScenarios();
		expect(list.map((s) => s.name)).toEqual(['Base', 'Retire early']);
		expect(list[1].isDefault).toBe(false);
		expect(list[1].params.spendingCents).toBe(200_000);
	});

	it('updates a scenario in place', () => {
		saveScenario(0, params);
		const id = (createScenario('Low return', params) as { id: number }).id;
		saveScenario(id, { ...params, returnPct: 3 });
		expect(getScenario(id)?.params.returnPct).toBe(3);
		expect(baseScenario().params.returnPct).toBe(6);
	});

	it('refuses empty and repeated names, and bad assumptions', () => {
		saveScenario(0, params);
		expect(createScenario('  ', params)).toMatchObject({ ok: false });
		expect(createScenario('base', params)).toMatchObject({ ok: false });
		expect(createScenario('Ok', { ...params, withdrawalPct: 0 })).toMatchObject({ ok: false });
		expect(saveScenario(0, { ...params, accessAge: 5 })).toMatchObject({ ok: false });
	});

	it('renames, moves the base and deletes', () => {
		saveScenario(0, params);
		const a = (createScenario('A', params) as { id: number }).id;
		expect(renameScenario(a, 'Renamed')).toMatchObject({ ok: true });
		expect(renameScenario(a, 'Base')).toMatchObject({ ok: false });
		expect(getScenario(a)?.name).toBe('Renamed');

		const base = baseScenario().id;
		expect(deleteScenario(base)).toMatchObject({ ok: false });
		makeBase(a);
		expect(baseScenario().id).toBe(a);
		expect(listScenarios().filter((s) => s.isDefault)).toHaveLength(1);
		expect(deleteScenario(base)).toMatchObject({ ok: true });
		expect(listScenarios().map((s) => s.id)).toEqual([a]);
	});
});

describe('plan context', () => {
	it('reads the Settings birth date and leaves averages empty without transactions', () => {
		setSetting(PREFS.birthDate.key, '1995-05-05');
		const c = planContext('2030-01-01');
		expect(c.settingsBirthDate).toBe('1995-05-05');
		expect(c.measuredSpending).toBeNull();
		expect(c.measuredInvesting).toBeNull();
		expect(c.accounts).toEqual([]);
	});
});
