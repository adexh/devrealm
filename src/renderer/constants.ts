export { STALE_REPO_MS } from '../shared/constants'

// Fuse.js match tolerance used by the app's fuzzy search boxes.
export const FUZZY_SEARCH_THRESHOLD = 0.35

/**
 * Scope for shells that belong to no workspace. Not a real workspace id, so it
 * never collides with one from the store. Lives here because more than one
 * feature launches shells.
 */
export const HOME_WORKSPACE_ID = '__home__'
export const HOME_WORKSPACE_NAME = 'Home'
