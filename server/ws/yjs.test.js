import { describe, it, expect } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { isWriteMessage } from './yjs.js';

/**
 * Le filtre de lecture seule du socket Yjs.
 *
 * C'est le SEUL endroit où le rôle VIEWER s'applique en collaboratif : ce n'est
 * pas `/save` qui porte les modifications mais le CRDT, et c'est un autre
 * client (le save-leader) qui les persiste. Un VIEWER qui passerait ce filtre
 * écrirait donc dans le graphe en contournant son propre 403 - sans que rien,
 * côté HTTP, ne s'en aperçoive.
 *
 * Les messages sont construits avec les VRAIS encodeurs de y-protocols, pas
 * avec des octets écrits à la main : un test qui invente son propre format
 * cesserait de dire quoi que ce soit le jour où le protocole évolue.
 */

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

function messageSync(remplir) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  remplir(enc);
  return encoding.toUint8Array(enc);
}

describe('filtre lecture seule du socket Yjs', () => {
  it('laisse passer SYNC_STEP1 - le lecteur demande l’état', () => {
    // Sans cela un VIEWER verrait un graphe vide : step 1 est une DEMANDE.
    const doc = new Y.Doc();
    const msg = messageSync(enc => syncProtocol.writeSyncStep1(enc, doc));
    expect(isWriteMessage(msg)).toBe(false);
  });

  it('refuse SYNC_STEP2 - application d’un état au document partagé', () => {
    const doc = new Y.Doc();
    doc.getMap('entities').set('a', 'x');
    const msg = messageSync(enc => syncProtocol.writeSyncStep2(enc, doc));
    expect(isWriteMessage(msg)).toBe(true);
  });

  it('refuse SYNC_UPDATE - la voie normale d’une modification', () => {
    const doc = new Y.Doc();
    doc.getMap('entities').set('a', 'x');
    const update = Y.encodeStateAsUpdate(doc);
    const msg = messageSync(enc => syncProtocol.writeUpdate(enc, update));
    expect(isWriteMessage(msg)).toBe(true);
  });

  it('laisse passer l’awareness - curseur et présence d’un lecteur', () => {
    // Un VIEWER doit rester visible des autres : l'awareness ne touche pas au
    // document. La bloquer rendrait les lecteurs invisibles en salle.
    const doc = new Y.Doc();
    const aw = new awarenessProtocol.Awareness(doc);
    aw.setLocalState({ user: { name: 'Lecteur' } });
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(aw, [doc.clientID]));
    expect(isWriteMessage(encoding.toUint8Array(enc))).toBe(false);
  });

  it('refuse par défaut un type de message inconnu', () => {
    // Refuser par défaut : une extension future du protocole ne doit pas ouvrir
    // silencieusement une voie d'écriture aux lecteurs.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 42);
    expect(isWriteMessage(encoding.toUint8Array(enc))).toBe(true);
  });

  it('refuse un message illisible plutôt que de le laisser passer', () => {
    expect(isWriteMessage(new Uint8Array([]))).toBe(true);
    expect(isWriteMessage(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toBe(true);
  });

  it('accepte un Buffer Node comme un Uint8Array', () => {
    // `ws` remet les trames binaires en Buffer : si le décodage échouait sur ce
    // type, TOUT deviendrait « message illisible », donc refusé - un VIEWER ne
    // recevrait même plus l'état initial.
    const doc = new Y.Doc();
    const msg = messageSync(enc => syncProtocol.writeSyncStep1(enc, doc));
    expect(isWriteMessage(Buffer.from(msg))).toBe(false);
  });
});
