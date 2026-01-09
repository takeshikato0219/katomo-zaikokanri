import { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2, X, Check, AlertCircle } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import type { Product, VoiceCommandResult } from '../../types';

interface VoiceInputButtonProps {
  products: Product[];
  context: 'receipt' | 'usage';
  onCommandConfirmed: (result: VoiceCommandResult) => void;
  disabled?: boolean;
}

export function VoiceInputButton({
  products,
  context,
  onCommandConfirmed,
  disabled = false,
}: VoiceInputButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const {
    isRecording,
    isProcessing,
    transcription,
    commandResult,
    error,
    startRecording,
    stopRecording,
    reset,
    isAIAvailable,
  } = useVoiceInput({ products, context });

  // モーダルを閉じるときにリセット
  const handleClose = () => {
    setShowModal(false);
    reset();
  };

  // 録音開始
  const handleStartRecording = async () => {
    setShowModal(true);
    await startRecording();
  };

  // 録音停止
  const handleStopRecording = async () => {
    await stopRecording();
  };

  // コマンド確定
  const handleConfirm = () => {
    if (commandResult && commandResult.action !== 'unknown') {
      onCommandConfirmed(commandResult);
      handleClose();
    }
  };

  // 録音中の自動停止（10秒後）
  useEffect(() => {
    if (isRecording) {
      const timer = setTimeout(() => {
        handleStopRecording();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isRecording]);

  if (!isAIAvailable) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
        title="音声入力を使用するにはOpenAI APIキーを設定してください"
      >
        <MicOff className="w-5 h-5" />
        <span className="hidden md:inline">音声入力</span>
      </button>
    );
  }

  return (
    <>
      {/* 音声入力ボタン */}
      <button
        onClick={handleStartRecording}
        disabled={disabled || isRecording || isProcessing}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-purple-500 hover:bg-purple-600 text-white'
        }`}
      >
        <Mic className="w-5 h-5" />
        <span className="hidden md:inline">音声入力</span>
      </button>

      {/* 音声入力モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                音声入力 - {context === 'receipt' ? '入荷処理' : '使用処理'}
              </h3>
              <button
                onClick={handleClose}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-6">
              {/* 録音中 */}
              {isRecording && (
                <div className="text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <div className="absolute w-24 h-24 bg-red-100 rounded-full animate-ping opacity-50" />
                    <button
                      onClick={handleStopRecording}
                      className="relative w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                      <Mic className="w-8 h-8" />
                    </button>
                  </div>
                  <p className="mt-4 text-gray-600">
                    話しかけてください...
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    例: 「オイルフィルターを5個{context === 'receipt' ? '入荷' : '使用'}」
                  </p>
                </div>
              )}

              {/* 処理中 */}
              {isProcessing && (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto" />
                  <p className="mt-4 text-gray-600">音声を認識中...</p>
                </div>
              )}

              {/* 結果表示 */}
              {!isRecording && !isProcessing && (transcription || error) && (
                <div className="space-y-4">
                  {/* エラー */}
                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                      </div>
                    </div>
                  )}

                  {/* 認識結果 */}
                  {transcription && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        認識結果
                      </label>
                      <div className="p-3 bg-gray-50 rounded-lg text-gray-800">
                        「{transcription}」
                      </div>
                    </div>
                  )}

                  {/* コマンド解析結果 */}
                  {commandResult && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        解析結果
                      </label>
                      <div
                        className={`p-3 rounded-lg ${
                          commandResult.action === 'unknown'
                            ? 'bg-yellow-50 border border-yellow-200'
                            : 'bg-green-50 border border-green-200'
                        }`}
                      >
                        <p className="text-gray-800">{commandResult.interpretation}</p>

                        {commandResult.action !== 'unknown' && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            {commandResult.productName && (
                              <div>
                                <span className="text-gray-500">商品:</span>
                                <span className="ml-1 font-medium">
                                  {commandResult.productName}
                                </span>
                              </div>
                            )}
                            {commandResult.quantity && (
                              <div>
                                <span className="text-gray-500">数量:</span>
                                <span className="ml-1 font-medium">
                                  {commandResult.quantity}個
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
              {!isRecording && !isProcessing && (
                <>
                  <button
                    onClick={handleStartRecording}
                    className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    やり直す
                  </button>

                  {commandResult && commandResult.action !== 'unknown' && (
                    <button
                      onClick={handleConfirm}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      確定
                    </button>
                  )}
                </>
              )}

              {(isRecording || isProcessing) && (
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
