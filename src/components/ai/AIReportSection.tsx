import { FileText, RefreshCw, TrendingUp, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import type { AIReport } from '../../types';

interface AIReportSectionProps {
  report: AIReport | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  yearMonth: string;
  isAIAvailable: boolean;
}

export function AIReportSection({
  report,
  isGenerating,
  error,
  onGenerate,
  yearMonth,
  isAIAvailable,
}: AIReportSectionProps) {
  // ハイライトタイプごとのアイコンとスタイル
  const highlightStyles = {
    positive: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-700',
      iconColor: 'text-green-500',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-700',
      iconColor: 'text-yellow-500',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      iconColor: 'text-blue-500',
    },
  };

  return (
    <div className="card">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-gray-800">AI経営サマリー</h3>
          {!isAIAvailable && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              簡易モード
            </span>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating ? '生成中...' : 'レポート生成'}
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ローディング */}
      {isGenerating && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-2 text-gray-500">レポートを生成中...</span>
        </div>
      )}

      {/* レポート未生成 */}
      {!isGenerating && !report && !error && (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>「レポート生成」をクリックして{yearMonth}のサマリーを作成</p>
        </div>
      )}

      {/* レポート表示 */}
      {!isGenerating && report && (
        <div className="space-y-4">
          {/* エグゼクティブサマリー */}
          <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
            <h4 className="font-medium text-indigo-800 mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {yearMonth} 概要
            </h4>
            <p className="text-gray-700">{report.executiveSummary}</p>
          </div>

          {/* トレンド分析 */}
          <div>
            <h4 className="font-medium text-gray-700 mb-2">トレンド分析</h4>
            <p className="text-gray-600 text-sm">{report.trendAnalysis}</p>
          </div>

          {/* ハイライト */}
          {report.highlights.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">ハイライト</h4>
              <div className="space-y-2">
                {report.highlights.map((highlight, index) => {
                  const style = highlightStyles[highlight.type];
                  const Icon = style.icon;
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-2 p-3 rounded-lg border ${style.bgColor} ${style.borderColor}`}
                    >
                      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
                      <span className={style.textColor}>{highlight.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 推奨アクション */}
          {report.recommendations.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">推奨アクション</h4>
              <ul className="space-y-1">
                {report.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-indigo-500 font-medium">{index + 1}.</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 生成日時 */}
          <div className="text-xs text-gray-400 text-right pt-2 border-t">
            生成日時: {new Date(report.generatedAt).toLocaleString('ja-JP')}
          </div>
        </div>
      )}

      {/* AIが無効の場合の説明 */}
      {!isAIAvailable && !report && (
        <div className="mt-4 pt-4 border-t text-xs text-gray-500">
          <p>
            OpenAI APIキーを設定すると、より詳細なAI分析レポートが利用できます。
          </p>
        </div>
      )}
    </div>
  );
}
