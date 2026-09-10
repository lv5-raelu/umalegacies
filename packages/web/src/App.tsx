import { useEffect, useState } from 'react';
import styles from './App.module.css';
import { ApiError, fetchMasterMeta, type MasterMeta } from './api/client';

type State =
  | { status: 'loading' }
  | { status: 'ok'; meta: MasterMeta }
  | { status: 'error'; error: ApiError };

/**
 * M0 has no features. This screen exists to prove one thing end to end: the
 * web app reaches the API, the API opened master.mdb, passed its boot checks,
 * and can name which extraction it is serving.
 */
export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchMasterMeta()
      .then((meta) => {
        if (!cancelled) setState({ status: 'ok', meta });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError('UNKNOWN_ERROR', String(error)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Uma Legacies</h1>
      <p className={styles.subtitle}>
        M0 scaffold. No features yet — this checks the API is up and its master
        data passed boot validation.
      </p>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Master data</h2>
        {state.status === 'loading' && <p>Checking…</p>}

        {state.status === 'error' && (
          <div className={styles.error}>
            <p>{state.error.message}</p>
            <p className={styles.errorCode}>{state.error.code}</p>
          </div>
        )}

        {state.status === 'ok' && (
          <>
            <div className={styles.hash}>{state.meta.masterHash}</div>
            <dl className={styles.rows}>
              {Object.entries(state.meta.tables).map(([table, count]) => (
                <div key={table} style={{ display: 'contents' }}>
                  <dt className={styles.rowName}>{table}</dt>
                  <dd className={styles.rowCount}>{count.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
