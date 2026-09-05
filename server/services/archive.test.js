import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

// Le service lit les pièces jointes sur le disque. On lui substitue un disque
// en mémoire : un test ne doit rien écrire ni lire dans `server/data/`.
const disque = new Map();
vi.mock('fs', () => ({
  default: {
    existsSync: (p) => disque.has(String(p).split('/').pop()),
    readFileSync: (p) => disque.get(String(p).split('/').pop()),
  },
}));

const { buildArchive, archiveFilename, ARCHIVE_FORMAT } = await import('./archive.js');

const IMG = 'a1b2c3d4e5f6a1b2c3d4e5f6.png';
const IMG2 = 'ffffffffffffffffffffffff.jpg';

const fichier = (obj) => ({ buffer: Buffer.from(JSON.stringify(obj)), encrypted: false });
const ouvrir = (buf) => unzipSync(new Uint8Array(buf));
const manifeste = (buf) => JSON.parse(strFromU8(ouvrir(buf)['manifest.json']));

beforeEach(() => {
  disque.clear();
  disque.set(IMG, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  disque.set(IMG2, Buffer.from([0xff, 0xd8, 0xff]));
});

describe('contenu de l’archive', () => {
  it('contient le manifeste et le graphe', () => {
    const { buffer } = buildArchive({ caseId: 'c1', file: fichier({ entities: [] }), uploads: [] });
    expect(Object.keys(ouvrir(buffer)).sort()).toEqual(['case.json', 'manifest.json']);
  });

  it('embarque les pièces jointes sous le nom que référence le graphe', () => {
    // C'est tout l'objet de l'archive : une photo est stockée dans le graphe
    // sous forme d'URL `/api/uploads/<nom>`, un import doit pouvoir recoller.
    const { buffer } = buildArchive({
      caseId: 'c1', file: fichier({}), uploads: [{ id: IMG, ext: 'png', size: 4 }],
    });
    expect(ouvrir(buffer)[`uploads/${IMG}`]).toBeDefined();
  });

  it('restitue le graphe octet pour octet', () => {
    const data = { entities: [{ id: 'e1', label: 'Dupont & Fils <SARL>' }] };
    const { buffer } = buildArchive({ caseId: 'c1', file: fichier(data), uploads: [] });
    expect(JSON.parse(strFromU8(ouvrir(buffer)['case.json']))).toEqual(data);
  });

  it('inscrit le titre et l’inventaire au manifeste', () => {
    const { buffer } = buildArchive({
      caseId: 'c1', meta: { title: 'Affaire X', description: 'd' },
      file: fichier({}), uploads: [{ id: IMG, ext: 'png', size: 4 }, { id: IMG2, ext: 'jpg', size: 3 }],
    });
    const m = manifeste(buffer);
    expect(m.format).toBe(ARCHIVE_FORMAT);
    expect(m.case.title).toBe('Affaire X');
    expect(m.uploads.map(u => u.name).sort()).toEqual([IMG, IMG2].sort());
  });
});

describe('pièces jointes défaillantes', () => {
  it('signale un fichier absent du disque au lieu d’échouer', () => {
    // Une ligne `Upload` sans fichier existe : c'est le résidu que
    // `scripts/purge-residues.js` traque. L'archive doit rester exportable.
    const { buffer } = buildArchive({
      caseId: 'c1', file: fichier({}), uploads: [{ id: IMG, ext: 'png' }, { id: IMG2, ext: 'jpg' }],
    });
    disque.delete(IMG2);
    const refait = buildArchive({
      caseId: 'c1', file: fichier({}), uploads: [{ id: IMG, ext: 'png' }, { id: IMG2, ext: 'jpg' }],
    });
    expect(manifeste(buffer).missingUploads).toEqual([]);
    expect(manifeste(refait.buffer).missingUploads).toEqual([IMG2]);
    expect(manifeste(refait.buffer).uploads).toHaveLength(1);
  });

  it('écarte un nom de fichier hors format', () => {
    // Défense en profondeur : un nom venu de la base ne doit pas pouvoir
    // désigner un chemin arbitraire, ni finir tel quel dans l'archive.
    const { buffer } = buildArchive({
      caseId: 'c1', file: fichier({}), uploads: [{ id: '../../etc/passwd', ext: 'png' }],
    });
    expect(Object.keys(ouvrir(buffer)).some(n => n.includes('..'))).toBe(false);
    expect(manifeste(buffer).missingUploads).toEqual(['../../etc/passwd']);
  });
});

describe('enquête chiffrée', () => {
  it('refuse d’archiver', () => {
    // Le graphe est chiffré mais les pièces jointes ne le sont pas : l'archive
    // serait une « enquête chiffrée » aux photos lisibles.
    expect(() => buildArchive({
      caseId: 'c1', file: { buffer: Buffer.from('x'), encrypted: true }, uploads: [],
    })).toThrow('ENCRYPTED_UNSUPPORTED');
  });

  it('refuse aussi une enquête sans fichier', () => {
    expect(() => buildArchive({ caseId: 'c1', file: null })).toThrow('NO_CASE_FILE');
  });
});

describe('nom du fichier téléchargé', () => {
  it('neutralise les caractères de chemin du titre', () => {
    expect(archiveFilename('../../etc/passwd')).toBe('etc_passwd.omcase');
  });

  it('retombe sur un nom par défaut si le titre ne laisse rien', () => {
    expect(archiveFilename('///')).toBe('enquete.omcase');
    expect(archiveFilename('')).toBe('enquete.omcase');
  });
});
