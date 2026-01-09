import { useEffect } from 'react';
import { Brain, RefreshCw, AlertTriangle, TrendingDown, Clock, ShoppingCart } from 'lucide-react';
import type { DemandForecastResult, Page } from '../../types';
import { formatNumber } from '../../utils/calculations';

interface DemandForecastWidgetProps {
  forecastResults: DemandForecastResult[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  lastUpdated: Date | null;
  isAIAvailable: boolean;
  onNavigate?: (page: Page) => void;
}

export function DemandForecastWidget({
  forecastResults,
  isLoading,
  error,
  onRefresh,
  lastUpdated,
  isAIAvailable,
  onNavigate,
}: DemandForecastWidgetProps) {
  // 初回マウント時に自動で予測を実行
  useEffect(() => {
    if (forecastResults.length === 0 && !isLoading && !error) {
      onRefresh();
    }
  }, []);

  // 在庫切れリスクがある商品
  const atRiskProducts = forecastResults.filter((f) => f.willRunOut);

  // 信頼度ごとの色
  const confidenceColors = {
    high: 'text-[#2e844a]',
    medium: 'text-[#dd7a01]',
    low: 'text-[#c23934]',
  };

  const confidenceLabels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return (
    <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
      {/* SLDS Card Header */}
      <div className="px-4 py-3 border-b border-[#e5e5e5]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#9050e9]" />
            <h3 className="text-base font-bold text-[#181818]">AI需要予測</h3>
            {!isAIAvailable && (
              <span className="slds-badge bg-[#f3f3f3] text-[#706e6b]">
                簡易モード
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-[#706e6b]">
                更新: {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 text-[#706e6b] hover:text-[#9050e9] hover:bg-[#ece1f9]/30 rounded transition-colors disabled:opacity-50"
              title="予測を更新"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* SLDS Card Body */}
      <div className="p-4">
        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-[#feded8] border border-[#c23934]/20 rounded text-[#c23934] text-sm">
            {error}
          </div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="slds-spinner mr-2" />
            <span className="text-[#706e6b]">予測を分析中...</span>
          </div>
        )}

        {/* 結果表示 */}
        {!isLoading && forecastResults.length === 0 && !error && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-3">
              <TrendingDown className="w-6 h-6 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">予測データがありません</p>
            <p className="text-xs text-[#706e6b] mt-1">使用履歴があると予測精度が向上します</p>
          </div>
        )}

        {!isLoading && forecastResults.length > 0 && (
          <>
            {/* 警告サマリー */}
            {atRiskProducts.length > 0 && (
              <div className="mb-4 p-3 bg-[#feded8] border border-[#c23934]/20 rounded">
                <div className="flex items-center gap-2 text-[#c23934] font-medium">
                  <AlertTriangle className="w-5 h-5" />
                  <span>来週不足の可能性が高い商品: {atRiskProducts.length}件</span>
                </div>
              </div>
            )}

            {/* 予測リスト */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {forecastResults.slice(0, 10).map((forecast) => (
                <div
                  key={forecast.productId}
                  className={`p-3 rounded border ${
                    forecast.willRunOut
                      ? 'bg-[#feded8]/30 border-[#c23934]/20'
                      : 'bg-[#f3f3f3]/50 border-[#e5e5e5]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-[#181818]">
                        {forecast.productName}
                      </div>
                      <div className="text-xs text-[#706e6b] mt-0.5">
                        {forecast.supplierName}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${confidenceColors[forecast.confidenceLevel]}`}>
                      信頼度: {confidenceLabels[forecast.confidenceLevel]}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-[#706e6b]">現在庫:</span>
                      <span className={`ml-1 font-medium ${forecast.willRunOut ? 'text-[#c23934]' : ''}`}>
                        {formatNumber(forecast.currentStock)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#706e6b]">予測使用:</span>
                      <span className="ml-1 font-medium">
                        {formatNumber(forecast.predictedUsageNextWeek)}
                      </span>
                    </div>
                    {forecast.daysUntilStockout !== null && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#706e6b]" />
                        <span className={forecast.daysUntilStockout <= 7 ? 'text-[#c23934] font-medium' : ''}>
                          {forecast.daysUntilStockout}日後に不足
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-[#706e6b]">
                    {forecast.reason}
                  </div>

                  {forecast.suggestedOrderQuantity > 0 && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-[#9050e9]">
                        推奨発注: {formatNumber(forecast.suggestedOrderQuantity)}個
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* フッター */}
            {onNavigate && atRiskProducts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#e5e5e5]">
                <button
                  onClick={() => onNavigate('orders')}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#9050e9] hover:bg-[#7e3abd] text-white rounded transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" />
                  発注管理へ移動
                </button>
              </div>
            )}
          </>
        )}

        {/* AIが無効の場合の説明 */}
        {!isAIAvailable && (
          <div className="mt-4 pt-4 border-t border-[#e5e5e5] text-xs text-[#706e6b]">
            <p>
              OpenAI APIキーを設定すると、より高精度なAI予測が利用できます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
