import core from './core';
import ingest from './ingest';
import movies from './movies';
import music from './music';
import ops from './ops';
import people from './people';
import series from './series';

// Admin screens keep their translations apart from the main catalog.
export const adminEsMX: Record<string, string> = { ...core, ...people, ...movies, ...series, ...ingest, ...ops, ...music };
