import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BodyRepository, openBodyDb } from './db';
import { EMPTY_BODY, sortWeighIns, type BodyImportPlan, type BodyTracking, type WeighIn } from './model';

/**
 * État du suivi corporel (§20), isolé du reste de l'application : si sa base est indisponible,
 * seule la rubrique « Mon poids » l'indique ; les séances restent utilisables.
 */
interface BodyValue {
  status: 'loading' | 'ready' | 'error';
  data: BodyTracking;
  saveWeighIn(w: WeighIn, replacedDate?: string): Promise<boolean>;
  deleteWeighIn(date: string): Promise<boolean>;
  setHeight(heightCm: number | null): Promise<boolean>;
  applyImport(plan: BodyImportPlan): Promise<boolean>;
  /** Données à jour pour l'export, lues directement en base. */
  snapshot(): Promise<BodyTracking | null>;
}

const BodyContext = createContext<BodyValue | null>(null);

export function useBody(): BodyValue {
  const value = useContext(BodyContext);
  if (!value) throw new Error('useBody hors de BodyProvider');
  return value;
}

export function BodyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BodyValue['status']>('loading');
  const [data, setData] = useState<BodyTracking>(EMPTY_BODY);
  const repo = useRef<BodyRepository | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = new BodyRepository(await openBodyDb());
        const loaded = await r.load();
        if (cancelled) return r.close();
        repo.current = r;
        setData(loaded);
        setStatus('ready');
      } catch (error) {
        console.error('[MyFitApp] suivi corporel indisponible', error);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async (action: (r: BodyRepository) => Promise<void>, update: (d: BodyTracking) => BodyTracking) => {
    if (!repo.current) return false;
    try {
      await action(repo.current);
      setData(update);
      return true;
    } catch (error) {
      console.error('[MyFitApp] échec d’enregistrement du suivi corporel', error);
      return false;
    }
  }, []);

  const value: BodyValue = {
    status,
    data,
    saveWeighIn: (w, replacedDate) =>
      run(
        (r) => r.putWeighIn(w, replacedDate),
        (d) => ({ ...d, weighIns: sortWeighIns([...d.weighIns.filter((x) => x.date !== w.date && x.date !== replacedDate), w]) }),
      ),
    deleteWeighIn: (date) => run((r) => r.deleteWeighIn(date), (d) => ({ ...d, weighIns: d.weighIns.filter((x) => x.date !== date) })),
    setHeight: (heightCm) => run((r) => r.setHeight(heightCm), (d) => ({ ...d, heightCm })),
    applyImport: (plan) =>
      run(
        (r) => r.applyImport(plan),
        (d) => {
          const kept = plan.replace ? [] : d.weighIns.filter((x) => !plan.weighIns.some((w) => w.date === x.date));
          return { heightCm: plan.heightCm === undefined ? d.heightCm : plan.heightCm, weighIns: sortWeighIns([...kept, ...plan.weighIns]) };
        },
      ),
    snapshot: async () => {
      if (!repo.current) return null;
      try {
        return await repo.current.load();
      } catch {
        return null;
      }
    },
  };

  return <BodyContext.Provider value={value}>{children}</BodyContext.Provider>;
}
