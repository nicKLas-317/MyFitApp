import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSession } from '../../session/ops';
import { openAppDb, Repository } from '../db';
import { PendingWrites } from '../pending';

let n = 0;
const freshRepo = async () => new Repository(await openAppDb(`test-durability-${++n}`));

afterEach(() => vi.restoreAllMocks());

describe('Fiabilité de l’enregistrement (§12)', () => {
  it('118. Une séance est écrite sans délai : transaction stricte, requête émise et validée avant toute attente', async () => {
    const repo = await freshRepo();
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const commit = vi.spyOn(IDBTransaction.prototype, 'commit');
    const session = startSession(Date.UTC(2026, 9, 14, 16), 's1');

    const written = repo.putSession(session);
    // Appel synchrone : la transaction est déjà ouverte et sa validation demandée, avant le moindre await.
    expect(transaction).toHaveBeenCalledWith('sessions', 'readwrite', { durability: 'strict' });
    expect(commit).toHaveBeenCalledTimes(1);
    await written;
    expect(await repo.loadSessions()).toEqual([session]);

    // Toutes les écritures suivent la même règle.
    commit.mockClear();
    await repo.setMeta('k', 1);
    await repo.deleteSession('s1');
    await repo.applyImport({ sessions: [session], exercises: [] });
    expect(commit).toHaveBeenCalledTimes(3);
    repo.close();
  });

  it('119. Écritures non confirmées : relancées dans leur dernière version au passage en arrière-plan, oubliées une fois confirmées', () => {
    const w = new PendingWrites<{ id: string; v: number }>();
    const a1 = { id: 'a', v: 1 };
    const a2 = { id: 'a', v: 2 };
    const b1 = { id: 'b', v: 1 };
    w.begin(a1);
    w.begin(a2);
    w.begin(b1);
    // L'ancienne version confirmée ne libère pas la plus récente, toujours en cours.
    w.confirm(a1);
    expect(w.toRetry()).toEqual([a2, b1]);
    w.fail(b1);
    expect(w.hasFailures()).toBe(true);
    expect(w.toRetry(true)).toEqual([b1]);
    w.confirm(a2);
    w.confirm(b1);
    expect([w.toRetry(), w.hasFailures()]).toEqual([[], false]);
    w.begin(a1);
    w.forget('a');
    expect(w.toRetry()).toEqual([]);
  });
});
