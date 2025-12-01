import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <Image
                src="/santa-logo.png"
                alt="Santa Logo"
                width={32}
                height={32}
                className="object-contain rounded-full"
              />
              <h3 className="text-lg font-bold text-white font-space-grotesk">
                Santa
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Community-Driven and Social On-Chain Advent Calendar.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-4">Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/whitepaper"
                  className="text-gray-600 dark:text-gray-400 hover:text-festive-green-600 dark:hover:text-festive-green-400"
                >
                  Whitepaper
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-4">Social</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://x.com/santaonpumpfun"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 dark:text-gray-400 hover:text-festive-green-600 dark:hover:text-festive-green-400"
                >
                  X (Twitter)
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/gaolinch/santa-on-pump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 dark:text-gray-400 hover:text-festive-green-600 dark:hover:text-festive-green-400"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Santa. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

