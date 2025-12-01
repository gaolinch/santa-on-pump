'use client';

import { useState, useEffect, useRef } from 'react';
import { buildMetadata } from '@/lib/seo';

type Transaction = {
  signature: string;
  sub_tx?: number; // Optional sub-transaction index
  blockTime: string;
  fromWallet: string;
  toWallet: string | null;
  amount: string;
  kind: 'buy' | 'sell' | 'transfer';
  fee: string;
  status: string;
  slot: number;
};

export default function TerminalPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial transactions
  useEffect(() => {
    const fetchInitialTransactions = async () => {
      try {
        setIsLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/transactions/recent?limit=50`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }

        const data = await response.json();
        console.log('📦 Received initial transactions:', data.transactions.length);
        console.log('📊 Sample transaction:', data.transactions[0]);
        
        // Transactions come from API in DESC order (newest first)
        // Deduplicate by signature + sub_tx combination
        const uniqueTransactions = Array.from(
          new Map(data.transactions.map((tx: Transaction) => [
            `${tx.signature}-${tx.sub_tx ?? 0}`, 
            tx
          ])).values()
        ) as Transaction[];
        console.log('✅ Unique transactions after dedup:', uniqueTransactions.length);
        setTransactions(uniqueTransactions);
        setError(null);
      } catch (err) {
        console.error('Error fetching transactions:', err);
        setError('Failed to connect to blockchain. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialTransactions();
  }, []);

  // Connect to SSE stream for real-time transactions
  useEffect(() => {
    if (transactions.length === 0) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const lastSignature = transactions[0]?.signature; // Get newest transaction (first in array)
    
    console.log('🔌 Connecting to SSE stream...');
    const eventSource = new EventSource(
      `${apiUrl}/transactions/stream?since=${lastSignature}`
    );

    eventSource.onopen = () => {
      console.log('✅ SSE connection established');
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('🔗 SSE stream connected:', data.message);
        } else if (data.type === 'transactions' && data.transactions.length > 0) {
          console.log('📥 Received', data.transactions.length, 'transactions via SSE');
          
          setTransactions((prev) => {
            // Filter out any transactions that already exist (prevent duplicates)
            // Use signature + sub_tx as unique key
            const existingKeys = new Set(prev.map(tx => `${tx.signature}-${tx.sub_tx ?? 0}`));
            const newTransactions = data.transactions.filter(
              (tx: Transaction) => !existingKeys.has(`${tx.signature}-${tx.sub_tx ?? 0}`)
            );
            
            console.log('✨ New transactions after filtering:', newTransactions.length);
            
            // Only update if we have truly new transactions
            if (newTransactions.length === 0) {
              console.log('⏭️ No new transactions, skipping update');
              return prev;
            }
            
            console.log('🎯 Adding', newTransactions.length, 'new transactions to top');
            
            // New transactions come in DESC order already, add them at the top
            const combined = [...newTransactions, ...prev];
            // Deduplicate the combined array using Map (keeps first occurrence)
            // Use signature + sub_tx as unique key
            const uniqueTransactions = Array.from(
              new Map(combined.map(tx => [
                `${tx.signature}-${tx.sub_tx ?? 0}`, 
                tx
              ])).values()
            );
            // Keep only first 100 transactions for performance (newest)
            return uniqueTransactions.slice(0, 100);
          });
          setError(null);
        } else if (data.type === 'error') {
          console.error('❌ SSE error:', data.message);
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      eventSource.close();
      setError('Connection lost. Reconnecting...');
      
      // Reconnect after 5 seconds
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        window.location.reload();
      }, 5000);
    };

    return () => {
      console.log('🔌 Closing SSE connection');
      eventSource.close();
    };
  }, [transactions.length > 0]); // Only reconnect when we have initial transactions

  // Track previous transaction count to detect new transactions
  const prevCountRef = useRef(transactions.length);
  
  // Auto-scroll to top when new transactions arrive
  useEffect(() => {
    // Only scroll if we actually have new transactions (count increased)
    if (scrollRef.current && transactions.length > prevCountRef.current) {
      scrollRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
    prevCountRef.current = transactions.length;
  }, [transactions.length]);

  const formatWallet = (wallet: string | null) => {
    if (!wallet) return 'N/A';
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount) / 1e9; // Assuming 9 decimals for SOL/SPL tokens
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const formatTime = (blockTime: string) => {
    const date = new Date(blockTime);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case 'buy':
        return 'text-green-400';
      case 'sell':
        return 'text-red-400';
      case 'transfer':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getKindSymbol = (kind: string) => {
    switch (kind) {
      case 'buy':
        return '↑';
      case 'sell':
        return '↓';
      case 'transfer':
        return '→';
      default:
        return '•';
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 font-space-grotesk">
          Live Terminal
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Real-time transaction feed from the Solana blockchain. New transactions appear at the top.
        </p>
        {!error && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span>Connected to Solana</span>
          </div>
        )}
      </div>

      {/* Terminal Window */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-black rounded-lg shadow-2xl border-2 border-green-500/30 overflow-hidden">
          {/* Terminal Header */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3 flex items-center gap-2 border-b border-green-500/30">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="ml-4 text-green-400 font-mono text-sm">
              santa@blockchain:~/transactions$
            </div>
            <div className="ml-auto text-xs text-gray-500 font-mono">
              {transactions.length} transactions loaded
            </div>
          </div>

          {/* Terminal Body */}
          <div 
            ref={scrollRef}
            className="bg-black text-green-400 font-mono text-sm p-6 h-[600px] overflow-y-auto custom-scrollbar"
          >
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
                  <div className="text-green-400">Connecting to blockchain...</div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-red-400 mb-2">⚠ Error</div>
                  <div className="text-gray-400 text-xs">{error}</div>
                </div>
              </div>
            )}

            {!isLoading && !error && transactions.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  No transactions yet. Waiting for blockchain activity...
                </div>
              </div>
            )}

            {!isLoading && !error && transactions.map((tx) => (
              <div 
                key={`${tx.signature}-${tx.sub_tx ?? 0}`} 
                className="mb-2 hover:bg-green-900/10 p-2 rounded transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Timestamp */}
                  <span className="text-gray-500 text-xs shrink-0 w-20">
                    {formatTime(tx.blockTime)}
                  </span>

                  {/* Kind indicator */}
                  <span className={`${getKindColor(tx.kind)} font-bold text-lg shrink-0 w-6`}>
                    {getKindSymbol(tx.kind)}
                  </span>

                  {/* Transaction details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${getKindColor(tx.kind)} uppercase font-semibold`}>
                        {tx.kind}
                      </span>
                      {tx.sub_tx !== undefined && tx.sub_tx !== null && (
                        <span className="text-purple-400 text-xs px-1.5 py-0.5 bg-purple-900/30 rounded">
                          #{tx.sub_tx}
                        </span>
                      )}
                      <span className="text-gray-600">|</span>
                      <span className="text-yellow-400">
                        {formatAmount(tx.amount)} SANTA
                      </span>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-400 text-xs">
                        From: <span className="text-cyan-400">{formatWallet(tx.fromWallet)}</span>
                      </span>
                      {tx.toWallet && (
                        <>
                          <span className="text-gray-600">→</span>
                          <span className="text-gray-400 text-xs">
                            To: <span className="text-cyan-400">{formatWallet(tx.toWallet)}</span>
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      <a 
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-green-400 transition-colors"
                      >
                        {tx.signature}
                      </a>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <span className="text-xs shrink-0 px-2 py-1 rounded bg-green-900/30 text-green-400">
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Terminal Footer */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-2 flex items-center gap-4 border-t border-green-500/30 text-xs text-gray-500 font-mono">
            <div>
              Connection: <span className="text-green-400">SSE Stream</span>
            </div>
            <div>
              Network: <span className="text-green-400">Solana</span>
            </div>
            <div>
              Status: <span className="text-green-400">{error ? 'Disconnected' : 'Live'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Real-Time Data</h3>
          <p className="text-sm text-gray-400">
            All transactions are pulled directly from the Solana blockchain. This is not simulated data - it&apos;s real on-chain activity.
          </p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Transparent</h3>
          <p className="text-sm text-gray-400">
            Every transaction is verifiable on Solscan. Click any transaction signature to view it on the blockchain explorer.
          </p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Live Updates</h3>
          <p className="text-sm text-gray-400">
            New transactions are pushed instantly via Server-Sent Events. Watch the Santa ecosystem grow in real-time with zero polling.
          </p>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #000;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #22c55e;
          border-radius: 4px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #16a34a;
        }

        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slide-down {
          animation: slide-down 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

