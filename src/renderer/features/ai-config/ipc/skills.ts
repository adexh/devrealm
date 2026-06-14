export async function skillFileExists(workspacePath: string, relativePath: string): Promise<boolean> {
  try {
    await window.electronAPI.markdown.readFile({ workspacePath, relativePath })
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) return false
    throw error
  }
}
