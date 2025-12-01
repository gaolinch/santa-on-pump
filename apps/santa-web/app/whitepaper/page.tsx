import { buildMetadata } from '@/lib/seo'
import { readFile } from 'fs/promises'
import { join } from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const metadata = buildMetadata({
  title: 'Whitepaper',
  description: 'Santa — The On-Chain Advent Calendar Whitepaper',
  path: '/whitepaper',
})

export default async function WhitepaperPage() {
  let content = ''
  try {
    const filePath = join(process.cwd(), 'content', 'whitepaper.md')
    content = await readFile(filePath, 'utf-8')
  } catch (error) {
    content = '# Whitepaper\n\nContent coming soon...'
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="prose prose-lg dark:prose-invert max-w-none prose-table:border-collapse prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-700 prose-th:bg-festive-green-50 dark:prose-th:bg-festive-green-900/20 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:font-semibold prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-700 prose-td:px-4 prose-td:py-3 prose-table:w-full prose-table:my-6 prose-img:max-w-[120px] prose-img:mx-auto prose-img:my-4 prose-h1:text-[2.125rem]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

