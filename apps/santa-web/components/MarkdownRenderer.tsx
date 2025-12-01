import { readFile } from 'fs/promises'
import { join } from 'path'

type MarkdownRendererProps = {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Simple markdown to HTML conversion
  const htmlContent = content
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br />')

  return (
    <div
      className="prose prose-lg dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: `<p>${htmlContent}</p>` }}
    />
  )
}

export async function loadMarkdownFile(filename: string): Promise<string> {
  try {
    const filePath = join(process.cwd(), 'content', filename)
    const content = await readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error(`Failed to load markdown file: ${filename}`, error)
    return `# Error\n\nFailed to load content from ${filename}`
  }
}
