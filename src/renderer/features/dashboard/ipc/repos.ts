export function checkRepoAiCoverage(repos: { id: string; path: string }[]): Promise<Record<string, boolean>> {
  return window.electronAPI.repos.checkAiCoverage(repos)
}
