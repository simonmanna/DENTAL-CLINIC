import { describe, expect, it } from 'vitest';
import { resolveUploadUrl } from './uploads';

describe('resolveUploadUrl', () => {
  it('signs an uploaded file path', () => {
    expect(resolveUploadUrl('/uploads/imaging/a/scan.png', 'tok')).toBe(
      '/api/files/uploads/imaging/a/scan.png?t=tok',
    );
  });

  it('returns nothing for an uploaded path with no token yet', () => {
    expect(resolveUploadUrl('/uploads/imaging/a/scan.png', null)).toBe('');
  });

  it('passes absolute URLs through untouched', () => {
    expect(resolveUploadUrl('https://cdn.example.com/x.png', 'tok')).toBe(
      'https://cdn.example.com/x.png',
    );
  });

  it('leaves non-upload paths alone', () => {
    expect(resolveUploadUrl('/assets/logo.svg', 'tok')).toBe('/assets/logo.svg');
  });

  it('handles an empty value', () => {
    expect(resolveUploadUrl(undefined, 'tok')).toBe('');
    expect(resolveUploadUrl('', 'tok')).toBe('');
  });

  it('encodes path segments and the token', () => {
    expect(resolveUploadUrl('/uploads/imaging/a b/s c.png', 'a+b/c')).toBe(
      '/api/files/uploads/imaging/a%20b/s%20c.png?t=a%2Bb%2Fc',
    );
  });
});
