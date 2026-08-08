/**
 * Panel entry point.
 *
 * Kept deliberately thin: it mounts React and nothing else. All start-up work
 * that can fail (filesystem, persistence, host queries) happens inside the app
 * so it can be surfaced in the UI rather than dying before anything renders.
 */
import { mountApp } from './app/bootstrap';

mountApp();
