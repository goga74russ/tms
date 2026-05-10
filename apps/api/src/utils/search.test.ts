import { describe, it, expect } from 'vitest';
import { escapeLikePattern, containsLikePattern } from './search.js';

describe('escapeLikePattern', () => {
    it('returns plain text unchanged', () => {
        expect(escapeLikePattern('hello')).toBe('hello');
        expect(escapeLikePattern('')).toBe('');
    });

    it('escapes SQL LIKE wildcards % and _', () => {
        expect(escapeLikePattern('50%')).toBe('50\\%');
        expect(escapeLikePattern('a_b')).toBe('a\\_b');
        expect(escapeLikePattern('%_%')).toBe('\\%\\_\\%');
    });

    it('escapes backslashes', () => {
        expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    });

    it('handles unicode and mixed content', () => {
        expect(escapeLikePattern('Привет_мир%')).toBe('Привет\\_мир\\%');
    });
});

describe('containsLikePattern', () => {
    it('wraps escaped value with %', () => {
        expect(containsLikePattern('foo')).toBe('%foo%');
    });

    it('escapes wildcards inside the value', () => {
        expect(containsLikePattern('100%')).toBe('%100\\%%');
        expect(containsLikePattern('a_b')).toBe('%a\\_b%');
    });

    it('handles empty string', () => {
        expect(containsLikePattern('')).toBe('%%');
    });
});
