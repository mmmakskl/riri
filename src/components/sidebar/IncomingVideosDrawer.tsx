import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X, ExternalLink, Loader2, Video, Eye, Heart, Sparkles, TrendingUp } from 'lucide-react';
import { IncomingVideo } from '../../types';
import { useFlowStore } from '../../stores/flowStore';
import { useInboxVideos } from '../../hooks/useInboxVideos';
import { cn } from '../../utils/cn';
import { proxyImageUrl, PLACEHOLDER_320x400 } from '../../utils/imagePlaceholder';

const ROW_HEIGHT_ESTIMATE = 320;
const ROW_GAP = 16;

interface IncomingVideosDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Расчёт коэффициента виральности
function calculateViralCoefficient(views?: number, takenAt?: string | number | Date): number {
  if (!views || views < 30000 || !takenAt) return 0;
  
  let videoDate: Date;
  
  if (takenAt instanceof Date) {
    videoDate = takenAt;
  } else if (typeof takenAt === 'string') {
    if (takenAt.includes('T') || takenAt.includes('-')) {
      videoDate = new Date(takenAt);
    } else {
      videoDate = new Date(Number(takenAt) * 1000);
    }
  } else if (typeof takenAt === 'number') {
    videoDate = takenAt > 1e12 ? new Date(takenAt) : new Date(takenAt * 1000);
  } else {
    return 0;
  }
  
  if (isNaN(videoDate.getTime())) return 0;
  
  const today = new Date();
  const diffTime = today.getTime() - videoDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 0;
  
  return Math.round((views / (diffDays * 1000)) * 100) / 100;
}

function VideoCard({
  video,
  onDragStart,
  onThumbnailError,
}: {
  video: IncomingVideo;
  onDragStart: (e: React.DragEvent, v: IncomingVideo) => void;
  onThumbnailError?: (videoId: string, shortcode: string) => void | Promise<void>;
}) {
  const videoData = video as any;
  const thumbnailUrl = proxyImageUrl(video.previewUrl, PLACEHOLDER_320x400);
  const viralCoef = calculateViralCoefficient(videoData.view_count, videoData.taken_at || videoData.receivedAt);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, video)}
      className={cn(
        'group relative overflow-hidden rounded-[1.75rem]',
        'cursor-grab active:cursor-grabbing',
        'shadow-lg hover:shadow-xl',
        'transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]'
      )}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${thumbnailUrl})`,
          filter: 'blur(20px) brightness(0.9)',
          transform: 'scale(1.1)',
        }}
      />
      <div className="relative z-10">
        <div className="relative m-2 mb-0" style={{ aspectRatio: '3/4' }}>
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover rounded-[1.25rem]"
            onError={(e) => {
              e.currentTarget.src = PLACEHOLDER_320x400;
              const videoId = (video as any).id;
              const shortcode = (video as any).url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];
              if (onThumbnailError && videoId && shortcode && !String(videoId).startsWith('local-')) {
                onThumbnailError(videoId, shortcode);
              }
            }}
          />
          <div className="absolute top-2 left-2 z-10">
            <div
              className={cn(
                'px-2 py-0.5 rounded-full backdrop-blur-md flex items-center gap-1 shadow-lg',
                viralCoef > 10 ? 'bg-emerald-500 text-white' : viralCoef > 5 ? 'bg-amber-500 text-white' : viralCoef > 0 ? 'bg-white/90 text-slate-700' : 'bg-slate-200/90 text-slate-500'
              )}
            >
              <TrendingUp className="w-2.5 h-2.5" />
              <span className="text-[10px] font-bold">{viralCoef > 0 ? viralCoef : '-'}</span>
            </div>
          </div>
        </div>
        <div className="p-3 pt-2">
          <h3 className="font-semibold text-slate-900 text-[13px] truncate mb-1">
            @{videoData.owner_username || 'instagram'}
          </h3>
          <p className="font-sans text-slate-700 text-[11px] leading-relaxed line-clamp-2 mb-2">
            {video.title?.slice(0, 50)}...
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="flex items-center gap-0.5 text-[10px]">
                <Eye className="w-3 h-3" />
                {formatNumber(videoData.view_count)}
              </span>
              <span className="flex items-center gap-0.5 text-[10px]">
                <Heart className="w-3 h-3" />
                {formatNumber(videoData.like_count)}
              </span>
            </div>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-medium transition-all flex items-center gap-1 active:scale-95"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Open
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IncomingVideosDrawer({ isOpen, onClose }: IncomingVideosDrawerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { incomingVideos } = useFlowStore();
  const { loading, loadingMore, hasMore, loadMore, refreshThumbnail } = useInboxVideos();

  const virtualizer = useVirtualizer({
    count: incomingVideos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE + ROW_GAP,
    overscan: 3,
  });

  const handleDragStart = (e: React.DragEvent, video: IncomingVideo) => {
    e.dataTransfer.setData('application/reactflow/video', JSON.stringify(video));
    e.dataTransfer.effectAllowed = 'move';
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-[90%] max-w-sm z-50',
          'bg-[#f5f5f5]',
          'transform transition-transform duration-300 ease-in-out',
          'flex flex-col shadow-2xl shadow-black/20'
        )}
      >
        <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-gradient-to-bl from-orange-500/30 to-transparent rounded-full blur-[60px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[150px] h-[150px] bg-gradient-to-tr from-neutral-900/10 to-transparent rounded-full blur-[50px] pointer-events-none" />
        <div className="flex items-center justify-between p-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/30">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base text-slate-800 font-semibold leading-none">Входящие</h2>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">Перетащите на холст</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl glass text-slate-500 hover:text-slate-700 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar-light relative z-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
              <div className="p-4 rounded-xl bg-orange-100">
                <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
              </div>
              <p className="text-sm text-slate-500">Загрузка...</p>
            </div>
          ) : incomingVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-4">
              <div className="p-5 rounded-2xl glass">
                <Sparkles className="w-10 h-10 text-orange-500" />
              </div>
              <div>
                <p className="text-slate-700 font-medium text-sm leading-tight">Нет видео</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">Добавь через поиск</p>
              </div>
            </div>
          ) : (
            <div
              className="p-4 pb-6"
              style={{
                height: virtualizer.getTotalSize() + (hasMore ? 56 : 0),
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const video = incomingVideos[virtualRow.index];
                return (
                  <div
                    key={video.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: 16,
                    }}
                  >
                    <VideoCard video={video} onDragStart={handleDragStart} onThumbnailError={refreshThumbnail} />
                  </div>
                );
              })}
              {hasMore && (
                <div
                  style={{
                    position: 'absolute',
                    top: virtualizer.getTotalSize(),
                    left: 0,
                    width: '100%',
                    paddingTop: 8,
                  }}
                  className="flex justify-center"
                >
                  <button
                    type="button"
                    onClick={() => loadMore()}
                    disabled={loadingMore}
                    className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
                  >
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
