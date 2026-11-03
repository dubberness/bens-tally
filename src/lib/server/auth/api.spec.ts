import { describe, expect, it } from 'vitest';
import { apiAccess, viaTunnel } from './api';

const read = 'r'.repeat(40);
const write = 'w'.repeat(40);

describe('token access', () => {
	it('tells read and write tokens apart and refuses anything else', () => {
		expect(apiAccess(read, { read, write })).toBe('read');
		expect(apiAccess(write, { read, write })).toBe('write');
		expect(apiAccess('nope', { read, write })).toBeNull();
		expect(apiAccess('', { read: '', write: '' })).toBeNull();
	});

	it('ignores tokens too short to be safe', () => {
		expect(apiAccess('short', { read: 'short', write: '' })).toBeNull();
	});

	it('spots requests that came through Cloudflare', () => {
		expect(viaTunnel(new Headers({ 'cf-connecting-ip': '1.2.3.4' }))).toBe(true);
		expect(viaTunnel(new Headers({ 'cf-ray': 'x' }))).toBe(true);
		expect(viaTunnel(new Headers({ host: 'tally' }))).toBe(false);
	});
});
