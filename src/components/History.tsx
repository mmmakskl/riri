import { useState } from 'react';
import { useSearchHistory, SearchHistoryEntry } from '../hooks/useSearchHistory';
import { useFlowStore } from '../stores/flowStore';
import { useInboxVideos } from '../hooks/useInboxVideos';
import { InstagramSearchResult } from '../services/videoService';
import { Search, Clock, Video, ExternalLink, Trash2, X, ChevronLeft } from 'lucide-react';
import { cn } from '../utils/cn';
import { toast } from 'sonner';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { MarketingBadges, searchBadges } from './ui/MarketingBadges';
import { DuplicateVideoModal } from './ui/DuplicateVideoModal';

type TabType = 'queries' | 'videos';


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

// Форматирование даты видео
function formatVideoDate(takenAt?: string | number | Date): string {
  if (!takenAt) return '';
  
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
    return '';
  }
  
  if (isNaN(videoDate.getTime())) return '';
  
  const now = new Date();
  const diffTime = now.getTime() - videoDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн.`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} мес.`;
  return `${Math.floor(diffDays / 365)} г.`;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7) return `${days} дн. назад`;
  
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function History() {
  const [activeTab, setActiveTab] = useState<TabType>('queries');
  const [selectedEntry, setSelectedEntry] = useState<SearchHistoryEntry | null>(null);
  const { historyEntries, removeFromHistory, clearHistory } = useSearchHistory();
  const { incomingVideos } = useFlowStore();
  const { addVideoToInbox, removeVideo, refreshThumbnail, saveThumbnailFromUrl, duplicateVideoPrompt, resolveDuplicateVideoPrompt } = useInboxVideos();

  const handleAddToInbox = async (reel: InstagramSearchResult) => {
    const captionText = typeof reel.caption === 'string' ? reel.caption : 'Видео из Instagram';
    
    try {
      const savedVideo = await addVideoToInbox({
        title: captionText,
        previewUrl: reel.thumbnail_url || reel.display_url || '',
        url: reel.url,
        viewCount: reel.view_count,
        likeCount: reel.like_count,
        commentCount: reel.comment_count,
        ownerUsername: reel.owner?.username,
      });
      if (!savedVideo) return;
      toast.success(savedVideo.saveAction === 'updated' ? 'Видео обновлено' : 'Видео добавлено', {
        description: savedVideo.saveAction === 'updated'
          ? 'Обновили существующую запись'
          : `@${reel.owner?.username || 'instagram'}`,
      });
    } catch (err) {
      console.error('Ошибка сохранения видео:', err);
      toast.error('Ошибка сохранения');
    }
  };

  // Детальный просмотр результатов запроса
  if (selectedEntry) {
    return (
      <div className="h-full overflow-hidden flex flex-col">
        <div className="max-w-6xl mx-auto w-full p-6 pt-6 pb-24 md:pb-6 flex flex-col h-full">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => setSelectedEntry(null)}
              className="flex items-center gap-2 min-h-[44px] min-w-[44px] pr-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 mb-4 transition-colors active:scale-95 touch-manipulation"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Назад к истории</span>
            </button>
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Search className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-800">
                  "{selectedEntry.query}"
                </h1>
                <p className="text-neutral-500 text-sm">
                  {formatDate(selectedEntry.searchedAt)} в {formatTime(selectedEntry.searchedAt)} • {selectedEntry.resultsCount} результатов
                </p>
              </div>
            </div>
          </div>

          {/* Results Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar-light">
            {selectedEntry.results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center mb-4">
                  <Video className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-medium text-slate-800 mb-1">Результаты не сохранены</h3>
                <p className="text-slate-500 text-sm">Этот поиск был выполнен до обновления</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {selectedEntry.results.map((reel, idx) => {
                  const captionText = typeof reel.caption === 'string' ? reel.caption : 'Видео из Instagram';
                  const thumbnailUrl = reel.thumbnail_url || reel.display_url;
                  const viralCoef = calculateViralCoefficient(reel.view_count, reel.taken_at);
                  const dateText = formatVideoDate(reel.taken_at);
                  
                  return (
                    <VideoGradientCard
                      key={`history-${reel.shortcode || reel.id}-${idx}`}
                      thumbnailUrl={thumbnailUrl}
                      username={reel.owner?.username || 'instagram'}
                      caption={captionText}
                      viewCount={reel.view_count}
                      likeCount={reel.like_count}
                      date={dateText || '-'}
                      viralCoef={viralCoef}
                      onAdd={() => handleAddToInbox(reel)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="max-w-5xl mx-auto w-full p-6 pt-6 pb-24 md:pb-6 flex flex-col h-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800">
            История
          </h1>
          <p className="text-neutral-500 text-base mt-1">
            Все твои поиски и сохранённые видео
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('queries')}
            className={cn(
              "px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-all flex items-center gap-2 touch-manipulation",
              activeTab === 'queries'
                ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20"
                : "bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            <Search className="w-4 h-4" />
            Запросы
            <span className={cn(
              "ml-1 px-1.5 py-0.5 rounded-full text-xs",
              activeTab === 'queries' ? "bg-white/20" : "bg-slate-100"
            )}>
              {historyEntries.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={cn(
              "px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-all flex items-center gap-2 touch-manipulation",
              activeTab === 'videos'
                ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20"
                : "bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            <Video className="w-4 h-4" />
            Сохранённые
            <span className={cn(
              "ml-1 px-1.5 py-0.5 rounded-full text-xs",
              activeTab === 'videos' ? "bg-white/20" : "bg-slate-100"
            )}>
              {incomingVideos.length}
            </span>
          </button>
          
          {activeTab === 'queries' && historyEntries.length > 0 && (
            <button
              onClick={clearHistory}
              className="ml-auto px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all flex items-center gap-1.5 touch-manipulation"
            >
              <Trash2 className="w-4 h-4" />
              Очистить
            </button>
          )}
        </div>

        {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar-light" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Queries Tab */}
          {activeTab === 'queries' && (
            <>
              {historyEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 text-center">
                  <MarketingBadges badges={searchBadges} className="mb-8" />
                  <h3 className="text-lg font-medium text-slate-800 mb-1">История поиска пуста</h3>
                  <p className="text-slate-500 text-sm">Используйте поиск для нахождения вирусного контента</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="group bg-white rounded-2xl p-4 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center flex-shrink-0">
                        <Search className="w-5 h-5 text-orange-500" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{entry.query}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(entry.searchedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            {entry.resultsCount} видео
                          </span>
                        </div>
                      </div>

                      {/* Preview thumbnails */}
                      {entry.results.length > 0 && (
                        <div className="hidden sm:flex -space-x-2">
                          {entry.results.slice(0, 3).map((reel, idx) => (
                            <div
                              key={reel.id}
                              className="w-10 h-14 rounded-lg overflow-hidden ring-2 ring-white shadow-sm"
                              style={{ zIndex: 3 - idx }}
                            >
                              <img
                                src={reel.thumbnail_url || reel.display_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                          {entry.results.length > 3 && (
                            <div className="w-10 h-14 rounded-lg bg-slate-100 ring-2 ring-white flex items-center justify-center text-xs font-medium text-slate-500">
                              +{entry.results.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromHistory(entry.query);
                        }}
                        className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all flex items-center justify-center touch-manipulation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Videos Tab */}
          {activeTab === 'videos' && (
            <>
              {incomingVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 text-center">
                  <MarketingBadges badges={searchBadges} className="mb-8" />
                  <h3 className="text-lg font-medium text-slate-800 mb-1">Нет сохранённых видео</h3>
                  <p className="text-slate-500 text-sm">Добавь видео через поиск</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {incomingVideos.map((video, idx) => {
                    const videoData = video as any;
                    const thumbnailUrl = video.previewUrl;
                    const viralCoef = calculateViralCoefficient(videoData.view_count, videoData.taken_at || videoData.receivedAt?.toISOString());
                    const dateText = formatVideoDate(videoData.taken_at || video.receivedAt);
                    
                    return (
                      <VideoGradientCard
                        key={`saved-${video.id}-${idx}`}
                        thumbnailUrl={thumbnailUrl}
                        username={videoData.owner_username || 'instagram'}
                        caption={video.title}
                        viewCount={videoData.view_count}
                        likeCount={videoData.like_count}
                        date={dateText || '-'}
                        viralCoef={viralCoef}
                        videoId={!String(video.id).startsWith('local-') ? video.id : undefined}
                        shortcode={video.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1]}
                        onThumbnailError={refreshThumbnail}
                        onThumbnailLoad={saveThumbnailFromUrl}
                        onAdd={() => {
                          window.open(video.url, '_blank');
                        }}
                        folderMenu={
                          <div className="absolute bottom-12 right-0 bg-white rounded-2xl shadow-2xl p-2 min-w-[140px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <ExternalLink className="w-4 h-4 text-blue-600" />
                              </div>
                              <span className="text-sm font-medium text-slate-700">Открыть</span>
                            </a>
                            <button
                              onClick={() => removeVideo(video.id)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </div>
                              <span className="text-sm font-medium text-slate-700">Удалить</span>
                            </button>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <DuplicateVideoModal
        prompt={duplicateVideoPrompt}
        onResolve={resolveDuplicateVideoPrompt}
      />
    </div>
  );
}
