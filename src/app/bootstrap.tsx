/**
 * React mounting for UXP.
 *
 * UXP's DOM is a subset of the browser DOM. React 18's `createRoot` works on
 * current UXP builds, but older ones only support the legacy `ReactDOM.render`
 * path. We try the modern API and fall back, so a UXP version difference
 * degrades to "renders anyway" instead of "blank panel".
 */
import { StrictMode, type ReactElement } from 'react';
import { App } from './App';
import { logger } from '../utils/logger';

type LegacyReactDom = {
  render?: (element: ReactElement, container: Element) => void;
};

export function mountApp(): void {
  const container = document.getElementById('root');

  if (!container) {
    // Nothing to render into: surface it loudly, since the panel will be blank.
    logger.error('bootstrap', 'No #root element found in index.html');
    return;
  }

  // StrictMode double-invokes effects in development only; our services are
  // written to tolerate that (all subscriptions are cleaned up).
  const tree = (
    <StrictMode>
      <App />
    </StrictMode>
  );

  try {
    const { createRoot } = require('react-dom/client') as {
      createRoot: (c: Element) => { render: (n: ReactElement) => void };
    };
    createRoot(container).render(tree);
    logger.info('bootstrap', 'Mounted with React 18 createRoot');
  } catch (error) {
    logger.warn('bootstrap', 'createRoot unavailable, falling back to legacy render', error);
    const legacy = require('react-dom') as LegacyReactDom;
    if (typeof legacy.render === 'function') {
      legacy.render(tree, container);
      logger.info('bootstrap', 'Mounted with legacy ReactDOM.render');
    } else {
      logger.error('bootstrap', 'No usable ReactDOM mounting API available');
    }
  }
}
