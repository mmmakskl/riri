import { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ExternalLink, TrendingUp, Heart, MessageCircle, Sparkles, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { ReferenceNodeData } from '../../types';
import { analyzeVideoMeaning } from '../../services/videoService';
import { cn } from '../../utils/cn';
import { proxyImageUrl, PLACEHOLDER_320x420 } from '../../utils/imagePlaceholder';
import { useFlowStore } from '../../stores/flowStore';

export function ReferenceNode({ id, data, selected }: NodeProps<ReferenceNodeData>) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(data.aiAnalysis);
  const { updateNode } = useFlowStore();

  const engagementScore = data.engagementScore !== undefined
    ? data.engagementScore
    : data.view_count && data.view_count > 0
    ? ((data.like_count || 0) + (data.comment_count || 0)) / data.view_count * 100
    : undefined;

  const isHighViral = engagementScore !== undefined && engagementScore > 5;

  const handleAnalyze = async () => {
    if (!data.description) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeVideoMeaning(data.description);
      setAiAnalysis(analysis);
      updateNode(id, { aiAnalysis: analysis });
    } catch (error) {
      console.error('Error analyzing video:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div
      className={cn(
        'rounded-2xl min-w-[280px] max-w-[320px] overflow-hidden',
        'bg-white shadow-xl shadow-black/10',
        'transition-all duration-300',
        selected && 'ring-2 ring-orange-500',
        isHighViral && 'ring-2 ring-emerald-500'
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-orange-500 !border-2 !border-white" />
      
      {/* Image */}
      <div className="relative aspect-[9/12] overflow-hidden">
        <img
          src={proxyImageUrl(data.previewUrl, PLACEHOLDER_320x420)}
          alt={data.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = PLACEHOLDER_320x420; }}
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        {isHighViral && (
          <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            High Viral
          </div>
        )}

        <div className="absolute top-2 left-2">
          <div className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm flex items-center gap-1.5 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-slate-700">На холсте</span>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-center gap-2.5 text-white/80 text-xs mb-1.5">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {formatNumber(data.view_count)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" />
              {formatNumber(data.like_count)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              {formatNumber(data.comment_count)}
            </span>
          </div>
          <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2">
            {data.title}
          </h3>
          {data.taken_at && (
            <p className="text-white/40 text-[10px] mt-1 leading-tight">
              {new Date(data.taken_at).toLocaleDateString('ru-RU')}
            </p>
          )}
        </div>
      </div>

      {/* Bottom section */}
      <div className="p-3 space-y-3 bg-white">
        {/* Engagement Score */}
        {engagementScore !== undefined && (
          <div className={cn(
            'p-3 rounded-xl',
            engagementScore > 5 ? 'bg-emerald-50' : engagementScore > 2 ? 'bg-amber-50' : 'bg-slate-50'
          )}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-400 tracking-wide">Engagement</span>
              <TrendingUp className={cn(
                'w-4 h-4',
                engagementScore > 5 ? 'text-emerald-500' : engagementScore > 2 ? 'text-amber-500' : 'text-slate-300'
              )} />
            </div>
            <div className={cn(
              'text-2xl font-bold leading-none',
              engagementScore > 5 ? 'text-emerald-600' : engagementScore > 2 ? 'text-amber-600' : 'text-slate-500'
            )}>
              {engagementScore.toFixed(2)}%
            </div>
          </div>
        )}

        {/* Analyze button */}
        {data.description && (
          <div>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={cn(
                'w-full flex items-center justify-center gap-2 p-2.5 rounded-xl',
                'bg-gradient-to-r from-orange-500 to-amber-500',
                'hover:from-orange-400 hover:to-amber-400',
                'text-white text-sm font-medium transition-all',
                'shadow-lg shadow-orange-500/20',
                isAnalyzing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Sparkles className={cn('w-4 h-4', isAnalyzing && 'animate-pulse')} />
              {isAnalyzing ? 'Анализ...' : 'Разобрать смыслы'}
            </button>

            {aiAnalysis && (
              <div className="mt-2 rounded-xl overflow-hidden bg-slate-50">
                <button
                  onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-[10px] font-semibold text-slate-600">AI Анализ</span>
                  {isAnalysisExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {isAnalysisExpanded && (
                  <div className="p-2.5 space-y-2 text-[11px] border-t border-slate-200">
                    <div>
                      <div className="font-semibold text-slate-600 mb-0.5">Цель:</div>
                      <div className="text-slate-500 leading-tight">{aiAnalysis.goal}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-600 mb-0.5">Триггер:</div>
                      <div className="text-slate-500 leading-tight">{aiAnalysis.trigger}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-600 mb-0.5">Структура:</div>
                      <div className="text-slate-500 leading-tight whitespace-pre-line">{aiAnalysis.structure}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Link */}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-orange-500 hover:text-orange-600 transition-colors font-medium"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Открыть в Instagram</span>
        </a>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-orange-500 !border-2 !border-white" />
    </div>
  );
}
