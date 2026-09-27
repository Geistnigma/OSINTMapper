import { describe, it, expect } from 'vitest';
import {
  contentMatchesExt,
  parseDataUri,
  ALLOWED_EXTS,
  UPLOAD_ID_RE,
} from './uploads.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n');

describe('contentMatchesExt', () => {
  it('accepte png/jpg/pdf authentiques', () => {
    expect(contentMatchesExt(png, 'png')).toBe(true);
    expect(contentMatchesExt(jpg, 'jpg')).toBe(true);
    expect(contentMatchesExt(pdf, 'pdf')).toBe(true);
  });

  it('refuse un binaire annoncé comme pdf', () => {
    expect(contentMatchesExt(Buffer.from('MZ\x90\x00fake-exe'), 'pdf')).toBe(false);
  });

  it('refuse HTML / shebang déguisés en texte', () => {
    expect(contentMatchesExt(Buffer.from('<script>alert(1)</script>'), 'txt')).toBe(false);
    expect(contentMatchesExt(Buffer.from('#!/bin/bash\nrm -rf /'), 'txt')).toBe(false);
    expect(contentMatchesExt(Buffer.from('hello world\n'), 'txt')).toBe(true);
  });

  it('valide du JSON réel seulement', () => {
    expect(contentMatchesExt(Buffer.from('{"a":1}'), 'json')).toBe(true);
    expect(contentMatchesExt(Buffer.from('not json'), 'json')).toBe(false);
  });

  it('refuse un zip générique annoncé comme ods', () => {
    // PK local header + nom "readme" → pas ODF
    const zip = Buffer.alloc(40, 0);
    zip[0] = 0x50; zip[1] = 0x4b; zip[2] = 0x03; zip[3] = 0x04;
    zip.writeUInt16LE(6, 26); // name len
    zip.write('readme', 30);
    expect(contentMatchesExt(zip, 'ods')).toBe(false);
  });
});

describe('parseDataUri', () => {
  it('accepte une image png en data-URI', () => {
    const data = `data:image/png;base64,${png.toString('base64')}`;
    const out = parseDataUri(data);
    expect(out.ext).toBe('png');
    expect(out.kind).toBe('image');
  });

  it('accepte un pdf', () => {
    const data = `data:application/pdf;base64,${pdf.toString('base64')}`;
    const out = parseDataUri(data);
    expect(out.ext).toBe('pdf');
    expect(out.kind).toBe('file');
  });

  it('refuse svg / javascript / html', () => {
    for (const mime of ['image/svg+xml', 'application/javascript', 'text/html']) {
      const data = `data:${mime};base64,${Buffer.from('x').toString('base64')}`;
      expect(() => parseDataUri(data)).toThrow();
    }
  });
});

describe('UPLOAD_ID_RE', () => {
  it('autorise les nouvelles extensions allowlistées', () => {
    expect(UPLOAD_ID_RE.test('a1b2c3d4e5f6a1b2c3d4e5f6.pdf')).toBe(true);
    expect(UPLOAD_ID_RE.test('a1b2c3d4e5f6a1b2c3d4e5f6.json')).toBe(true);
    expect(UPLOAD_ID_RE.test('a1b2c3d4e5f6a1b2c3d4e5f6.exe')).toBe(false);
    expect(UPLOAD_ID_RE.test('../etc/passwd')).toBe(false);
  });

  it('reste aligné sur ALLOWED_EXTS', () => {
    for (const ext of ALLOWED_EXTS) {
      expect(UPLOAD_ID_RE.test(`aaaaaaaaaaaaaaaaaaaaaaaa.${ext}`)).toBe(true);
    }
  });
});
