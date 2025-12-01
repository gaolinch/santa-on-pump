import { buildMetadata } from '@/lib/seo'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const metadata = buildMetadata({
  title: 'Team',
  description: 'Meet the Santa team',
  path: '/team',
})

export default async function TeamPage() {
  let content = ''
  try {
    const filePath = join(process.cwd(), 'content', 'team.mdx')
    content = await readFile(filePath, 'utf-8')
  } catch (error) {
    content = `# Team

## Core Team

The Santa project is built by a dedicated team of blockchain enthusiasts and developers committed to transparency and community engagement.

### Founders

The founding team manages the initial phase with open reporting and transparency.

### Multisig

All treasury operations are secured by a multi-signature wallet for enhanced security.

---

*Team information will be updated soon.*
`
  }

  // Simple markdown rendering
  const htmlContent = content
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br />')

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <div
          className="prose prose-lg dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: `<p>${htmlContent}</p>` }}
        />
      </div>
    </div>
  )
}

