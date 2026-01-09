import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Sparkles, Loader2, X } from 'lucide-react';
import type { AISearchResult, AISearchIntent } from '../../types';

interface AISearchBarProps {
  onSearch: (query: string) => Promise<AISearchResult>;
  onClear: () => void;
  isSearching: boolean;
  lastIntent: AISearchIntent | null;
  isAIAvailable: boolean;
  placeholder?: string;
}

export function AISearchBar({
  onSearch,
  onClear,
  isSearching,
  lastIntent,
  isAIAvailable,
  placeholder = '品名・品番で検索、または「先月よく使った商品」などAI検索...',
}: AISearchBarProps) {
  const [query, setQuery] = useState('');
  const [isAIMode, setIsAIMode] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // デバウンス検索
  const debouncedSearch = useCallback(
    (searchQuery: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!searchQuery.trim()) {
        onClear();
        return;
      }

      // AI検索は少し長めのデバウンス（API呼び出しを減らす）
      const delay = isAIMode && isAIAvailable ? 500 : 200;

      debounceRef.current = setTimeout(() => {
        if (isAIMode && isAIAvailable) {
          onSearch(searchQuery);
        } else {
          // 通常検索モードの場合は単純な検索として呼び出し
          onSearch(searchQuery);
        }
      }, delay);
    },
    [onSearch, onClear, isAIMode, isAIAvailable]
  );

  // クエリ変更時に検索
  useEffect(() => {
    debouncedSearch(query);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, debouncedSearch]);

  // クリアハンドラ
  const handleClear = () => {
    setQuery('');
    onClear();
  };

  // Enterキーで即時検索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onSearch(query);
    }
  };

  return (
    <div className="space-y-2">
      {/* 検索バー */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          {/* アイコン */}
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-[#0176d3] animate-spin" />
            ) : isAIMode && isAIAvailable ? (
              <Sparkles className="w-4 h-4 text-[#9050e9]" />
            ) : (
              <Search className="w-4 h-4 text-[#706e6b]" />
            )}
          </div>

          {/* 入力フィールド */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`input-field pl-10 pr-10 ${
              isAIMode && isAIAvailable
                ? 'border-[#9050e9]/50 focus:border-[#9050e9] focus:ring-[#9050e9]/20'
                : ''
            }`}
          />

          {/* クリアボタン */}
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#706e6b] hover:text-[#181818]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* AI/通常 切り替えトグル */}
        {isAIAvailable && (
          <div className="flex items-center bg-[#f3f3f3] rounded p-0.5">
            <button
              onClick={() => setIsAIMode(true)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isAIMode
                  ? 'bg-[#9050e9] text-white'
                  : 'text-[#706e6b] hover:bg-[#e5e5e5]'
              }`}
            >
              AI
            </button>
            <button
              onClick={() => setIsAIMode(false)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                !isAIMode
                  ? 'bg-[#181818] text-white'
                  : 'text-[#706e6b] hover:bg-[#e5e5e5]'
              }`}
            >
              通常
            </button>
          </div>
        )}
      </div>

      {/* AIの解釈表示 */}
      {isAIMode && isAIAvailable && lastIntent && query && (
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-[#9050e9]" />
          <span className="text-[#9050e9]">{lastIntent.interpretation}</span>
          {lastIntent.correctedQuery && (
            <span className="text-[#706e6b]">
              （補正: {lastIntent.correctedQuery}）
            </span>
          )}
        </div>
      )}

      {/* AIが無効の場合の通知 */}
      {!isAIAvailable && (
        <div className="text-xs text-[#706e6b]">
          AI検索を使用するには、.envファイルにOpenAI APIキーを設定してください
        </div>
      )}
    </div>
  );
}
