import { unzipSync, strFromU8 } from 'fflate';

/**
 * A small reader for .xlsx files that returns each cell's cached value (what the
 * sheet last showed), not its formula. Dates come back as Excel serial numbers;
 * use serialToDate on cells you know hold dates.
 */
export type Cell = string | number | boolean | null;

export interface Sheet {
	name: string;
	/** Value at an A1 reference, or null. */
	cell(ref: string): Cell;
	/** Value at a 1-based row and column, or null. */
	at(row: number, col: number): Cell;
	/** Highest row and column holding anything. */
	maxRow: number;
	maxCol: number;
	/** Rows from..to (1-based, inclusive) as arrays indexed from column 1 (index 0 unused). */
	rows(from?: number, to?: number): Cell[][];
}

export interface Workbook {
	names: string[];
	sheet(name: string): Sheet;
	has(name: string): boolean;
}

const decode = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&amp;/g, '&');

const attr = (tag: string, name: string) => {
	const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
	return m ? decode(m[1]) : null;
};

/** 'AB12' → [12, 28] */
export function parseRef(ref: string): [number, number] {
	const m = ref.match(/^([A-Z]+)(\d+)$/);
	if (!m) throw new Error(`Bad cell reference ${ref}`);
	let col = 0;
	for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
	return [Number(m[2]), col];
}

/** 28 → 'AB' */
export function colName(col: number): string {
	let s = '';
	for (let n = col; n > 0; n = Math.floor((n - 1) / 26))
		s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
}

/** Excel serial (1900 date system) → 'YYYY-MM-DD'. Time of day is dropped. */
export function serialToDate(serial: number): string {
	const ms = Math.round((serial - 25569) * 86400000);
	return new Date(ms).toISOString().slice(0, 10);
}

function sharedStrings(xml: string | undefined): string[] {
	if (!xml) return [];
	const out: string[] = [];
	for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
		// Rich text has several <t> runs; phonetic hints (<rPh>) are skipped.
		const body = si[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '');
		out.push([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(''));
	}
	return out;
}

function parseSheet(name: string, xml: string, strings: string[]): Sheet {
	const cells = new Map<number, Map<number, Cell>>();
	let maxRow = 0;
	let maxCol = 0;
	for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
		const tag = m[1];
		const body = m[2] ?? '';
		const ref = attr(tag, 'r');
		if (!ref) continue;
		const type = attr(tag, 't');
		const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
		let value: Cell = null;
		if (type === 'inlineStr') {
			value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join('');
		} else if (v === undefined) {
			continue;
		} else if (type === 's') {
			value = strings[Number(v)] ?? null;
		} else if (type === 'str') {
			value = decode(v);
		} else if (type === 'b') {
			value = v === '1';
		} else if (type === 'e') {
			value = null; // #N/A, #REF! and friends
		} else {
			value = Number(v);
		}
		if (value === '' || value === null) continue;
		const [r, c] = parseRef(ref);
		let row = cells.get(r);
		if (!row) cells.set(r, (row = new Map()));
		row.set(c, value);
		if (r > maxRow) maxRow = r;
		if (c > maxCol) maxCol = c;
	}
	const at = (r: number, c: number) => cells.get(r)?.get(c) ?? null;
	return {
		name,
		maxRow,
		maxCol,
		at,
		cell: (ref) => at(...parseRef(ref)),
		rows(from = 1, to = maxRow) {
			const out: Cell[][] = [];
			for (let r = from; r <= to; r++) {
				const row: Cell[] = new Array(maxCol + 1).fill(null);
				for (const [c, v] of cells.get(r) ?? []) row[c] = v;
				out.push(row);
			}
			return out;
		}
	};
}

export function readWorkbook(data: Uint8Array): Workbook {
	const files = unzipSync(data);
	const text = (p: string) => (files[p] ? strFromU8(files[p]) : undefined);
	const wb = text('xl/workbook.xml');
	const rels = text('xl/_rels/workbook.xml.rels');
	if (!wb || !rels) throw new Error('Not an .xlsx file');
	const strings = sharedStrings(text('xl/sharedStrings.xml'));

	const targets = new Map<string, string>();
	for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
		const id = attr(m[1], 'Id');
		const target = attr(m[1], 'Target');
		if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
	}
	const paths = new Map<string, string>();
	for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
		const name = attr(m[1], 'name');
		const rid = attr(m[1], 'r:id');
		const path = rid ? targets.get(rid) : undefined;
		if (name && path) paths.set(name, path);
	}

	const cache = new Map<string, Sheet>();
	return {
		names: [...paths.keys()],
		has: (name) => paths.has(name),
		sheet(name) {
			const hit = cache.get(name);
			if (hit) return hit;
			const path = paths.get(name);
			const xml = path ? text(path) : undefined;
			if (!xml) throw new Error(`The workbook has no "${name}" tab`);
			const sheet = parseSheet(name, xml, strings);
			cache.set(name, sheet);
			return sheet;
		}
	};
}
