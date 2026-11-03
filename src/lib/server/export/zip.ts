import { crc32 } from 'node:zlib';

/*
 * A tiny zip writer: files stored as they are (no compression), which every unzip tool
 * opens. Enough for a handful of CSVs; it stops at 4 GB per file and 65,535 files.
 */

export interface ZipFile {
	name: string;
	data: Uint8Array | string;
}

const u16 = (n: number) => Buffer.from([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) => Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24]);

/** The MS-DOS date and time fields a zip entry carries (local time, two-second steps). */
export function dosDateTime(at: Date): { date: number; time: number } {
	const year = Math.max(at.getFullYear(), 1980);
	return {
		date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
		time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1)
	};
}

export function zipStore(files: ZipFile[], at = new Date()): Buffer {
	const { date, time } = dosDateTime(at);
	const body: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const f of files) {
		const name = Buffer.from(f.name, 'utf8');
		const data = typeof f.data === 'string' ? Buffer.from(f.data, 'utf8') : Buffer.from(f.data);
		const crc = crc32(data);
		const shared = [
			u16(20), // version needed
			u16(0x0800), // flags: the name is UTF-8
			u16(0), // method: stored
			u16(time),
			u16(date),
			u32(crc),
			u32(data.length), // compressed size
			u32(data.length), // uncompressed size
			u16(name.length),
			u16(0) // extra field length
		];
		const local = Buffer.concat([u32(0x04034b50), ...shared, name]);
		body.push(local, data);
		central.push(
			Buffer.concat([
				u32(0x02014b50),
				u16(20), // version made by
				...shared,
				u16(0), // comment length
				u16(0), // disk number
				u16(0), // internal attributes
				u32(0), // external attributes
				u32(offset),
				name
			])
		);
		offset += local.length + data.length;
	}
	const dir = Buffer.concat(central);
	const end = Buffer.concat([
		u32(0x06054b50),
		u16(0),
		u16(0),
		u16(files.length),
		u16(files.length),
		u32(dir.length),
		u32(offset),
		u16(0)
	]);
	return Buffer.concat([...body, dir, end]);
}
