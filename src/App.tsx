import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Workspace } from './components/Workspace';
import { LandingPage } from './components/LandingPage';
import { Dashboard, getDisplayName } from './components/Dashboard';
import { OnboardingModal } from './components/OnboardingModal';
import { History } from './components/History';
import { AIScriptwriter } from './components/AIScriptwriter';
import { ProfilePage } from './components/ProfilePage';
import { Analytics } from './components/Analytics';
import { UsageStats } from './components/UsageStats';
import { IncomingVideosDrawer } from './components/sidebar/IncomingVideosDrawer';
import { SearchPanel, HIDE_SEARCH_BY_WORD } from './components/ui/SearchPanel';
import { ProjectMembersModal } from './components/ui/ProjectMembersModal';
import { 
  Sidebar, SidebarBody, SidebarLink, SidebarSection, SidebarProject, 
  SidebarLogo, SidebarDivider 
} from './components/ui/AnimatedSidebar';
import { useProjectMembers } from './hooks/useProjectMembers';
import { supabase, setUserContext } from './utils/supabase';
import { useAuth } from './hooks/useAuth';
import { TokenBalanceProvider } from './contexts/TokenBalanceContext';
import { TokenBalanceDisplay } from './components/ui/TokenBalanceDisplay';
import { useInboxVideos } from './hooks/useInboxVideos';
import { ProjectProvider, useProjectContext } from './contexts/ProjectContext';
import type { Project } from './hooks/useProjects';
import { 
  Settings, Search, LayoutGrid, User, LogOut, 
  Radar, Plus, X, Palette, Sparkles, Trash2, Users, Menu, Home, BarChart2, Activity
} from 'lucide-react';
import { GlassFolderIcon } from './components/ui/GlassFolderIcons';
import { MobileBottomBar, type MobileTabId } from './components/ui/MobileBottomBar';
import { cn } from './utils/cn';
import { Toaster, toast } from 'sonner';


type ViewMode = 'dashboard' | 'workspace' | 'canvas' | 'history' | 'profile' | 'scriptwriter' | 'analytics' | 'usage';
type SearchTab = 'search' | 'link' | 'radar';

// Цвета для проектов
const PROJECT_COLORS = [
  '#64748b', // slate (пыльно-серый)
  '#ef4444', // red
  '#ec4899', // pink
'#334155', // slate-700
    '#475569', // slate-600
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
];

// Модальное окно создания проекта
interface CreateProjectModalProps {
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}

function CreateProjectModal({ onSave, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), color);
      setName('');
      setColor(PROJECT_COLORS[0]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white/90 backdrop-blur-[28px] backdrop-saturate-[180%] rounded-3xl shadow-2xl border border-white/60 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-500 flex items-center justify-center shadow-glass">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Новый проект</h2>
              <p className="text-sm text-slate-500">Создайте проект для организации контента</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 safe-x">
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Название проекта
            </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Кулинарный блог"
                className="w-full px-5 py-3.5 min-h-[44px] rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm outline-none focus:ring-2 focus:ring-slate-200/50 focus:border-slate-400/50 transition-all text-slate-800 placeholder:text-slate-400 font-medium text-base touch-manipulation"
                autoFocus
              />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" strokeWidth={2.5} />
                Цвет проекта
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-11 h-11 rounded-xl transition-all touch-manipulation",
                    color === c 
                      ? "ring-2 ring-offset-2 ring-slate-400 scale-110" 
                      : "hover:scale-105 active:scale-95"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 mb-2">Предпросмотр</p>
            <div className="flex items-center gap-3">
              <GlassFolderIcon iconType="folder" color={color} size={22} simple />
              <span className="font-medium text-slate-800">
                {name || 'Название проекта'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 safe-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-3.5 min-h-[44px] rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm text-slate-600 font-medium hover:bg-white/80 active:scale-95 transition-all touch-manipulation"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-5 py-3.5 min-h-[44px] rounded-2xl bg-slate-600 hover:bg-slate-700 text-white font-medium active:scale-95 transition-all shadow-glass hover:shadow-glass-hover disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm touch-manipulation"
            >
              Создать проект
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Модальное окно редактирования проекта
interface EditProjectModalProps {
  project: { id: string; name: string; color: string } | null;
  onClose: () => void;
  onSave: (projectId: string, name: string, color: string) => void;
  onDelete: (projectId: string) => void;
}

function EditProjectModal({ project, onSave, onDelete, onClose }: EditProjectModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Обновляем состояние когда проект меняется
  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color || PROJECT_COLORS[0]);
      setShowDeleteConfirm(false);
    }
  }, [project]);

  if (!project) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(project.id, name.trim(), color);
      onClose();
    }
  };

  const handleDelete = () => {
    onDelete(project.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center safe-top safe-bottom safe-left safe-right">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md mx-0 md:mx-4 bg-white/90 backdrop-blur-[28px] backdrop-saturate-[180%] rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/60 animate-in fade-in zoom-in-95 duration-200 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 safe-top safe-x">
          <div className="flex items-center gap-3">
            <GlassFolderIcon iconType="folder" color={color} size={22} simple />
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Редактировать проект</h2>
              <p className="text-sm text-slate-500">Изменить название и цвет</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 safe-x">
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Название проекта
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Кулинарный блог"
              className="w-full px-5 py-3.5 min-h-[44px] rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm outline-none focus:ring-2 focus:ring-[#f97316]/20 focus:border-[#f97316]/30 transition-all text-slate-800 placeholder:text-slate-400 font-medium text-base touch-manipulation"
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" strokeWidth={2.5} />
                Цвет проекта
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-11 h-11 rounded-xl transition-all touch-manipulation",
                    color === c 
                      ? "ring-2 ring-offset-2 ring-slate-400 scale-110" 
                      : "hover:scale-105 active:scale-95"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 mb-2">Предпросмотр</p>
            <div className="flex items-center gap-3">
              <GlassFolderIcon iconType="folder" color={color} size={22} simple />
              <span className="font-medium text-slate-800">
                {name || 'Название проекта'}
              </span>
            </div>
          </div>

          {/* Delete section */}
          <div className="pt-4 border-t border-slate-100">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Удалить проект
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-sm text-red-600 mb-3">
                  Вы уверены? Все видео проекта будут удалены.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex-1 px-3 py-2 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 flex-wrap safe-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-w-[120px] px-5 py-3.5 min-h-[44px] rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm text-slate-600 font-medium hover:bg-white/80 active:scale-95 transition-all touch-manipulation"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 min-w-[120px] px-5 py-3.5 min-h-[44px] rounded-2xl bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#fdba74] text-white font-medium hover:from-[#f97316] hover:via-[#fb923c] hover:to-[#fdba74] active:scale-95 transition-all shadow-lg shadow-[#f97316]/20 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm touch-manipulation"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppContent() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<SearchTab>(HIDE_SEARCH_BY_WORD ? 'link' : 'search');
  // На мобильных сайдбар закрыт по умолчанию — пользователь открывает через «Меню»
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; color: string } | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !getDisplayName());
  const { logout, user } = useAuth();

  // Если пользователь залогинен по нику — не спрашиваем имя, используем username
  useEffect(() => {
    if (user?.telegram_username && !getDisplayName()) {
      setShowOnboarding(false);
    }
  }, [user?.telegram_username]);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    try {
      const v = localStorage.getItem('app_view_mode');
      if (v === 'dashboard' || v === 'workspace' || v === 'canvas' || v === 'history' || v === 'profile' || v === 'scriptwriter' || v === 'analytics') return v;
    } catch { /* ignore */ }
    return 'dashboard';
  });
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem('app_view_mode', mode); } catch { /* ignore */ }
  }, []);
  const { videos } = useInboxVideos();

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const mobileTabs = [
    { id: 'dashboard' as MobileTabId, icon: Home, label: 'Главная', iconColor: 'text-slate-500' },
    { id: 'workspace' as MobileTabId, icon: LayoutGrid, label: 'Лента', iconColor: 'text-slate-500' },
    { id: 'profile' as MobileTabId, icon: User, label: 'Профиль', iconColor: 'text-slate-500' },
    { id: 'menu' as MobileTabId, icon: Menu, label: 'Меню', iconColor: 'text-slate-500' },
  ];

  const mobileActiveId: MobileTabId | null =
    sidebarExpanded ? 'menu'
    : viewMode === 'profile' ? 'profile'
    : viewMode === 'dashboard' ? 'dashboard'
    : 'workspace';

  const handleMobileTabClick = (id: MobileTabId) => {
    if (id === 'dashboard') {
      setViewMode('dashboard');
    } else if (id === 'workspace') {
      setViewMode('workspace');
    } else if (id === 'profile') {
      setViewMode('profile');
    } else if (id === 'menu') {
      setSidebarExpanded(true);
    }
  };
  
  // Используем контекст проектов
  const { projects, currentProject, currentProjectId, selectProject, createProject, updateProject, deleteProject, loading: projectsLoading, refetch: refetchProjects } = useProjectContext();
  
  // Хук для управления участниками (для принятия приглашений)
  const { acceptInvitation } = useProjectMembers(currentProjectId);
  
  // Синхронизация списка проектов при изменении участников (добавление/удаление)
  useEffect(() => {
    const handleMembersUpdated = () => {
      refetchProjects();
    };
    window.addEventListener('members-updated', handleMembersUpdated as EventListener);
    return () => window.removeEventListener('members-updated', handleMembersUpdated as EventListener);
  }, [refetchProjects]);

  // Обработка ссылки-приглашения /invite?m=memberId — принимаем и переходим в проект
  const inviteProcessedRef = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get('m');
    if (!memberId || !user?.id || inviteProcessedRef.current === memberId) return;

    const userId = user.id;
    inviteProcessedRef.current = memberId;

    (async () => {
      try {
        await setUserContext(userId);
        const { data: member, error } = await supabase
          .from('project_members')
          .select('id, project_id, user_id, status')
          .eq('id', memberId)
          .single();

        if (error || !member) {
          toast.error('Приглашение не найдено или истекло');
          return;
        }
        const isEmailInvite = member.user_id.startsWith('email-');
        const emailFromInvite = isEmailInvite ? member.user_id.replace('email-', '') : null;
        const userEmail = user.email?.toLowerCase();
        const idMatches = member.user_id === userId || (isEmailInvite && !!userEmail && emailFromInvite === userEmail);
        if (!idMatches) {
          toast.error('Это приглашение предназначено другому пользователю');
          return;
        }
        if (member.status === 'active') {
          selectProject(member.project_id);
          refetchProjects();
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        if (member.status !== 'pending') {
          toast.error('Приглашение уже обработано');
          return;
        }

        const { error: updateErr } = await supabase
          .from('project_members')
          .update({ status: 'active', joined_at: new Date().toISOString() })
          .eq('id', memberId)
          .eq('user_id', member.user_id);

        if (updateErr) throw updateErr;

        toast.success('Вы приняли приглашение в проект');
        await refetchProjects();
        selectProject(member.project_id);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        console.error('Invite link accept error:', err);
        toast.error('Не удалось принять приглашение');
      }
    })();
  }, [user?.telegram_username, selectProject, refetchProjects]);

  // Обработка уведомлений о pending приглашениях
  useEffect(() => {
    const handlePendingInvitations = (event: CustomEvent) => {
      const { count, projects: pendingProjects } = event.detail;
      if (count > 0) {
        const projectNames = pendingProjects.map((p: any) => p.name).join(', ');
        toast.info(
          `У вас ${count} ${count === 1 ? 'новое приглашение' : 'новых приглашений'}`,
          {
            description: projectNames,
            duration: 5000,
            action: {
              label: 'Посмотреть',
              onClick: () => {
                // Можно открыть список проектов или перейти к первому pending проекту
                if (pendingProjects.length > 0) {
                  selectProject(pendingProjects[0].id);
                }
              }
            }
          }
        );
      }
    };

    window.addEventListener('pending-invitations', handlePendingInvitations as EventListener);
    return () => {
      window.removeEventListener('pending-invitations', handlePendingInvitations as EventListener);
    };
  }, [selectProject]);
  
  // Обработка клика на проект - если pending, предлагаем принять приглашение
  const handleProjectClick = async (project: any) => {
    if (project.membershipStatus === 'pending') {
      // Загружаем membership для этого проекта
      const userId = user?.id || null;
      if (!userId) return;
      
      try {
        await setUserContext(userId);
        const { data: projectMember } = await supabase
          .from('project_members')
          .select('id, status')
          .eq('project_id', project.id)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .maybeSingle();
        
        if (projectMember) {
          await acceptInvitation(projectMember.id);
          toast.success(`Вы приняли приглашение в проект "${project.name}"`);
          refetchProjects(); // Обновляем список проектов
          selectProject(project.id); // Выбираем проект
        } else {
          toast.error('Приглашение не найдено');
        }
      } catch (error) {
        console.error('Error accepting invitation:', error);
        toast.error('Не удалось принять приглашение');
      }
    } else {
      selectProject(project.id);
    }
  };

  // Создание проекта
  const handleCreateProject = async (name: string, color: string) => {
    const project = await createProject(name, color);
    if (project) {
      toast.success(`Проект "${name}" создан`);
      selectProject(project.id);
    }
  };

  // Редактирование проекта
  const handleEditProject = async (projectId: string, name: string, color: string) => {
    await updateProject(projectId, { name, color });
    toast.success(`Проект "${name}" обновлён`);
  };

  // Удаление проекта
  const handleDeleteProject = async (projectId: string) => {
    const projectName = projects.find(p => p.id === projectId)?.name || 'Проект';
    await deleteProject(projectId);
    toast.success(`Проект "${projectName}" удалён`);
  };

  if (projectsLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-base">
        <div className="flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shadow-glass animate-pulse bg-slate-100 p-2">
            <img src="/riri-logo.png" alt="Riri AI" className="w-full h-full object-contain" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Загружаю проекты...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
        "w-full h-[100dvh] text-foreground overflow-hidden flex flex-col md:flex-row safe-top",
        viewMode === 'dashboard' ? "bg-[#fafafa]" : "bg-base"
      )}>
      {/* Background: clean for dashboard, subtle blobs for other views */}
      {viewMode !== 'dashboard' && (
        <>
          <div className="fixed top-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-bl from-slate-200/30 via-transparent to-transparent rounded-full blur-[120px] pointer-events-none" />
          <div className="fixed bottom-[-15%] left-[-5%] w-[45%] h-[45%] bg-gradient-to-tr from-slate-100/40 via-transparent to-transparent rounded-full blur-[100px] pointer-events-none" />
          <div className="fixed inset-0 opacity-[0.015] pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }} />
        </>
      )}

      {/* Animated Sidebar */}
      <Sidebar open={sidebarExpanded} setOpen={setSidebarExpanded}>
        <SidebarBody className="justify-between gap-3">
          <div className={cn(
            "flex flex-col flex-1 overflow-y-auto overflow-x-hidden",
            sidebarExpanded ? "custom-scrollbar-light" : "scrollbar-hide"
          )}>
            {/* Logo */}
            <SidebarLogo />
            
            {/* Navigation */}
            <SidebarSection title="С чем тебе помочь?">
              <div className="space-y-0.5">
                <SidebarLink
                  icon={<Home className="w-4 h-4" strokeWidth={2.5} />}
                  label="Рабочий стол"
                  onClick={() => setViewMode('dashboard')}
                  isActive={viewMode === 'dashboard'}
                />
                <SidebarLink
                  icon={<LayoutGrid className="w-4 h-4" strokeWidth={2.5} />}
                  label="Лента"
                  onClick={() => setViewMode('workspace')}
                  isActive={viewMode === 'workspace'}
                  badge={videos.length}
                />
                <SidebarLink
                  icon={<Radar className="w-4 h-4" strokeWidth={2.5} />}
                  label="Радар"
                  onClick={() => { setSearchTab('radar'); setIsSearchOpen(true); }}
                />
                {!HIDE_SEARCH_BY_WORD && (
                  <SidebarLink
                    icon={<Search className="w-4 h-4" strokeWidth={2.5} />}
                    label="Глобальный поиск"
                    onClick={() => { setSearchTab('search'); setIsSearchOpen(true); }}
                  />
                )}
                <SidebarLink
                  icon={<BarChart2 className="w-4 h-4" strokeWidth={2.5} />}
                  label="Аналитика"
                  onClick={() => setViewMode('analytics')}
                  isActive={viewMode === 'analytics'}
                />
                <SidebarLink
                  icon={<Sparkles className="w-4 h-4" strokeWidth={2.5} />}
                  label="ИИ-сценарист"
                  onClick={() => setViewMode('scriptwriter')}
                  isActive={viewMode === 'scriptwriter'}
                />
                <SidebarLink
                  icon={<Activity className="w-4 h-4" strokeWidth={2.5} />}
                  label="Статистика API"
                  onClick={() => setViewMode('usage')}
                  isActive={viewMode === 'usage'}
                />
              </div>
            </SidebarSection>
            
            <SidebarDivider />
            
            {/* Projects */}
            <SidebarSection title="Твои проекты" onAdd={() => setIsCreateProjectOpen(true)}>
              <div className="space-y-1">
                {projects.length === 0 ? (
                  <button
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-dashed border-slate-200/60 text-slate-400 hover:border-slate-400/50 hover:text-slate-600 transition-all hover:bg-white/30 backdrop-blur-sm"
                  >
                    <Plus className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
                  </button>
                ) : (
                  <>
                    {/* Сначала мои проекты, потом общие */}
                    {projects.filter((p: any) => !p.isShared).length > 0 && (
                      <div className="space-y-1">
                        {projects.filter((p: any) => p.isShared).length > 0 && (
                          <p className="px-3 py-1 text-xs font-medium text-slate-500 font-heading tracking-[-0.01em]">Мои проекты</p>
                        )}
                        {projects.filter((p: Project) => !p.isShared).map((project: Project) => (
                          <div key={project.id} className="relative group">
                            <SidebarProject
                              name={project.name}
                              color={project.color}
                              isActive={currentProjectId === project.id}
                              onClick={() => { selectProject(project.id); if (isMobile) setSidebarExpanded(false); }}
                              onEdit={() => setEditingProject({ id: project.id, name: project.name, color: project.color })}
                            />
                            {currentProjectId === project.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setIsMembersModalOpen(true); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/60 backdrop-blur-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-white/80 touch-manipulation"
                                title="Управление участниками"
                              >
                                <Users className="w-3.5 h-3.5 text-slate-600" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Общие проекты — после моих */}
                    {projects.filter((p: any) => p.isShared).length > 0 && (
                      <div className={cn("space-y-1", "pt-2 mt-2 border-t border-slate-200/60")}>
                        <p className="px-3 py-1 text-xs font-medium text-slate-500 font-heading tracking-[-0.01em]">Общие проекты</p>
                        <div className="space-y-1">
                          {projects.filter((p: Project) => p.isShared).map((project: Project) => {
                            const isPending = project.membershipStatus === 'pending';
                            return (
                              <div key={project.id} className="relative group">
                                <SidebarProject
                                  name={project.name}
                                  color={project.color}
                                  isActive={currentProjectId === project.id}
                                  onClick={async () => { await handleProjectClick(project); if (isMobile) setSidebarExpanded(false); }}
                                  onEdit={() => setEditingProject({ id: project.id, name: project.name, color: project.color })}
                                  badge={isPending ? 'Новое' : undefined}
                                />
                                {isPending && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
                                )}
                                {currentProjectId === project.id && !isPending && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setIsMembersModalOpen(true); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/60 backdrop-blur-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-white/80 touch-manipulation"
                                    title="Управление участниками"
                                  >
                                    <Users className="w-3.5 h-3.5 text-slate-600" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </SidebarSection>
          </div>
          
          {/* Bottom Actions */}
          <div className="space-y-0.5">
            <SidebarDivider />
            <SidebarLink
              icon={<User className="w-4 h-4" strokeWidth={2.5} />}
              label="Профиль"
              onClick={() => setViewMode('profile')}
              isActive={viewMode === 'profile'}
              rightElement={<TokenBalanceDisplay variant="compact" />}
            />
            <SidebarLink
              icon={<Settings className="w-4 h-4" strokeWidth={2.5} />}
              label="Настройки"
              onClick={() => toast.info('Настройки скоро будут доступны')}
            />
            <SidebarLink
              icon={<LogOut className="w-4 h-4" strokeWidth={2.5} />}
              label="Выйти"
              onClick={logout}
              variant="danger"
            />
          </div>
        </SidebarBody>
      </Sidebar>

      {/* Main Content — контент идёт до низа, таб-бар поверх */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            className="flex-1 min-h-0 overflow-hidden flex flex-col absolute inset-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {viewMode === 'dashboard' && (
              <Dashboard
                onOpenSearch={(tab) => { setSearchTab(tab); setIsSearchOpen(true); }}
                onOpenFeed={() => setViewMode('workspace')}
                onOpenTeam={() => setIsMembersModalOpen(true)}
                videosCount={videos.length}
                telegramUsername={user?.telegram_username}
              />
            )}
            {viewMode === 'workspace' && <Workspace />}
            {viewMode === 'scriptwriter' && <AIScriptwriter />}
            {viewMode === 'analytics' && <Analytics />}
            {viewMode === 'history' && <History />}
            {viewMode === 'profile' && <ProfilePage />}
            {viewMode === 'usage' && <UsageStats />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Нижнее меню в стиле iOS — только на мобильных */}
      <MobileBottomBar
        items={mobileTabs}
        activeId={mobileActiveId}
        onTabClick={handleMobileTabClick}
      />

      {/* Incoming Videos Drawer */}
      <IncomingVideosDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* Search Panel */}
      <SearchPanel
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        initialTab={searchTab}
        currentProjectId={currentProjectId}
        currentProjectName={currentProject?.name || 'Проект'}
      />

      {/* Create Project Modal */}
      {isCreateProjectOpen && (
        <CreateProjectModal
          onSave={handleCreateProject}
          onClose={() => setIsCreateProjectOpen(false)}
        />
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onSave={handleEditProject}
          onDelete={handleDeleteProject}
          onClose={() => setEditingProject(null)}
        />
      )}

      {/* Members Modal */}
      {isMembersModalOpen && currentProjectId && (
        <ProjectMembersModal
          projectId={currentProjectId}
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
        />
      )}

      {/* Onboarding — имя при первом входе */}
      <OnboardingModal
        open={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />

      {/* Toast notifications */}
      <Toaster 
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#18181b',
            color: '#fff',
            border: 'none',
            borderRadius: '1rem',
            marginBottom: 'max(20px, env(safe-area-inset-bottom))',
          },
          className: 'safe-bottom',
        }}
      />
    </div>
  );
}

// Wrapper component with auth check
function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-base">
        <div className="flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shadow-glass animate-pulse bg-slate-100 p-2">
            <img src="/riri-logo.png" alt="Riri AI" className="w-full h-full object-contain" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Проверка сессии...</p>
          <p className="text-slate-400 text-xs">Если долго - обновите страницу</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <ProjectProvider>
      <TokenBalanceProvider>
        <AppContent />
      </TokenBalanceProvider>
    </ProjectProvider>
  );
}

export default App;
