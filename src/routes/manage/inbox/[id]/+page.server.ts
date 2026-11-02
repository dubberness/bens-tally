import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { parseMail } from '$lib/betashares/mime';
import { parseBetashares } from '$lib/betashares/parse';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** The email's words without its tracking links and runs of blank lines. */
const readable = (text: string) =>
	text
		.replace(/<?https?:\/\/\S+?>?(?=[\s)]|$)/g, '')
		.replace(/\s*\(\s*\)/g, '')
		.split('\n')
		.map((l) => l.trimEnd())
		.filter((l) => !/^[-=_*\s]{8,}$/.test(l))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

export const load: PageServerLoad = ({ params }) => {
	const item = db
		.select()
		.from(schema.importItems)
		.where(eq(schema.importItems.id, Number(params.id)))
		.get();
	if (!item) error(404, 'No such import');
	if (item.source === 'email' && item.raw) {
		const mail = parseMail(item.raw);
		return {
			item: { ...item, raw: null },
			mail: {
				from: mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from,
				date: mail.date?.getTime() ?? null,
				subject: mail.subject,
				text: readable(mail.text)
			},
			// Read again now, so a parser fix shows here before anything is re-applied.
			parsed: parseBetashares({ subject: mail.subject, text: mail.text }),
			csv: null
		};
	}
	const csv = item.raw ? (JSON.parse(item.raw) as { headers: string[]; row: string[] }) : null;
	return { item: { ...item, raw: null }, mail: null, parsed: null, csv };
};
