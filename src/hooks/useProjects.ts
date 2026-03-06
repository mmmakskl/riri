import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './useAuth';

export interface ProjectFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
}

/** Пункт шаблона ссылок/ответственных проекта (название применяется ко всем видео проекта) */
export interface ProjectTemplateItem {
  id: string;
  label: string;
}

/** Мета стиля сценария проекта (результат анализа примеров) */
export interface ProjectStyleMeta {
  rules?: string[];
  doNot?: string[];
  summary?: string;
}

/** Анализ структуры сценария (хук, тело, CTA и т.д.) */
export interface ScriptStructureAnalysis {
  hookDescription?: string;
  hookDuration?: string;
  bodyPhases?: string[];
  ctaType?: string;
  avgLengthSeconds?: number;
  specialFeatures?: string[];
}

/** Метаданные обучающего примера */
export interface TrainingExample {
  url?: string;
  title?: string;
  viralMultiplier?: number;
  scriptLength?: number;
}

/** Один стиль сценария в проекте (может быть несколько) */
export interface ProjectStyle {
  id: string;
  name: string;
  prompt: string;
  meta?: ProjectStyleMeta;
  examplesCount?: number;
  trainingMode?: 'reels' | 'scripts';
  preferredFormat?: 'short' | 'long';
  structureAnalysis?: ScriptStructureAnalysis;
  trainingExamples?: TrainingExample[];
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Папки для рилсов (saved_videos) */
  folders: ProjectFolder[];
  /** Папки для каруселей (saved_carousels), независимые от folders */
  carouselFolders?: ProjectFolder[];
  /** Шаблон пунктов ссылок — общий для всех видео проекта (в т.ч. общие проекты) */
  linksTemplate?: ProjectTemplateItem[];
  /** Шаблон пунктов ответственных — общий для всех видео проекта */
  responsiblesTemplate?: ProjectTemplateItem[];
  /** Промт стиля (legacy, один на проект) — при наличии project_styles не используется */
  stylePrompt?: string;
  styleMeta?: ProjectStyleMeta;
  styleExamplesCount?: number;
  /** Несколько стилей в проекте — приоритет над stylePrompt */
  projectStyles?: ProjectStyle[];
  createdAt: Date;
  isShared?: boolean;
  membershipStatus?: 'active' | 'pending';
  owner_id?: string;
}

const DEFAULT_LINKS_TEMPLATE: ProjectTemplateItem[] = [
  { id: 'link-0', label: 'Заготовка' },
  { id: 'link-1', label: 'Готовое' },
];

const DEFAULT_RESPONSIBLES_TEMPLATE: ProjectTemplateItem[] = [
  { id: 'resp-0', label: 'За сценарий' },
  { id: 'resp-1', label: 'За монтаж' },
];

const DEFAULT_FOLDERS: Omit<ProjectFolder, 'id'>[] = [
  { name: 'Все видео', color: '#64748b', icon: 'all', order: 0 },
  { name: 'Идеи', color: '#f97316', icon: 'lightbulb', order: 1 },
  { name: 'Ожидает сценария', color: '#475569', icon: 'file', order: 2 },
  { name: 'Ожидает съёмок', color: '#f59e0b', icon: 'camera', order: 3 },
  { name: 'Ожидает монтажа', color: '#10b981', icon: 'scissors', order: 4 },
  { name: 'Готовое', color: '#334155', icon: 'check', order: 5 },
  { name: 'Не подходит', color: '#ef4444', icon: 'rejected', order: 6 },
];

/** Дефолтные папки для каруселей (отдельные от папок рилсов) */
const DEFAULT_CAROUSEL_FOLDERS: ProjectFolder[] = [
  { id: 'carousel-0', name: 'Идеи', color: '#f97316', icon: 'lightbulb', order: 0 },
  { id: 'carousel-1', name: 'В работе', color: '#475569', icon: 'file', order: 1 },
  { id: 'carousel-2', name: 'Готовое', color: '#334155', icon: 'check', order: 2 },
  { id: 'carousel-3', name: 'Не подходит', color: '#ef4444', icon: 'rejected', order: 3 },
];

const PROJECT_COLORS = [
  '#f97316', // orange
  '#475569', // slate-600
  '#10b981', // emerald
  '#f59e0b', // amber
  '#334155', // slate-700
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
];

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const getUserId = useCallback((): string => {
    return user?.id || 'anonymous';
  }, [user]);

  // Загрузка проектов (включая общие)
  // silent=true — фоновая подгрузка без экрана загрузки (при возврате на вкладку, после правок и т.д.)
  const fetchProjects = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? (projects.length > 0);
    const userId = getUserId();
    if (!silent) setLoading(true);
    
    try {
      // Загружаем собственные проекты
      const { data: ownProjects, error: ownError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // Загружаем общие проекты (где пользователь является участником, включая pending)
      const { data: sharedMemberships } = await supabase
        .from('project_members')
        .select('project_id, status')
        .eq('user_id', userId)
        .in('status', ['active', 'pending']); // Включаем pending приглашения

      // Проверяем, какие из собственных проектов являются общими (есть участники или is_shared=true)
      const ownProjectIds = (ownProjects || []).map(p => p.id);
      let ownProjectsWithMembers: string[] = [];
      
      if (ownProjectIds.length > 0) {
        // Проверяем, есть ли участники у собственных проектов
        const { data: membersForOwnProjects } = await supabase
          .from('project_members')
          .select('project_id')
          .in('project_id', ownProjectIds)
          .in('status', ['active', 'pending']);
        
        ownProjectsWithMembers = membersForOwnProjects?.map(m => m.project_id) || [];
      }

      let sharedProjects = [];
      if (sharedMemberships && sharedMemberships.length > 0) {
        const sharedProjectIds = sharedMemberships.map(m => m.project_id);
        const membershipMap = new Map(sharedMemberships.map(m => [m.project_id, m.status]));
        
        const { data: shared } = await supabase
          .from('projects')
          .select('*')
          .in('id', sharedProjectIds)
          .order('created_at', { ascending: true });
        
        sharedProjects = (shared || []).map(p => ({
          ...p,
          membershipStatus: membershipMap.get(p.id) || 'active'
        }));
      }

      if (ownError) {
        throw ownError;
      }

      // Помечаем собственные проекты как общие, если у них есть участники или is_shared=true
      const ownProjectsMapped = (ownProjects || []).map(p => ({
        ...p,
        isShared: p.is_shared === true || ownProjectsWithMembers.includes(p.id),
        membershipStatus: undefined
      }));

      // Убираем дубликаты: если проект и собственный, и в списке общих, оставляем только в списке общих
      const sharedProjectIds = new Set(sharedProjects.map(p => p.id));
      const ownProjectsFiltered = ownProjectsMapped.filter(p => !sharedProjectIds.has(p.id));

      const allProjects = [
        ...ownProjectsFiltered,
        ...sharedProjects.map(p => ({ ...p, isShared: true })),
      ];

      if (allProjects.length > 0) {
        const loadedProjects: Project[] = allProjects.map((p: any) => {
          const rawStyles = Array.isArray(p.project_styles) ? p.project_styles : [];
          const hasLegacy = p.style_prompt && p.style_prompt.trim();
          let projectStyles: ProjectStyle[] = rawStyles.map((s: any) => ({
            id: s.id || `style-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: s.name || 'Стиль',
            prompt: s.prompt || '',
            meta: s.meta || undefined,
            examplesCount: s.examplesCount ?? s.examples_count ?? 0,
          }));
          if (projectStyles.length === 0 && hasLegacy) {
            projectStyles = [{
              id: 'legacy',
              name: 'Стиль по умолчанию',
              prompt: p.style_prompt,
              meta: p.style_meta || undefined,
              examplesCount: p.style_examples_count ?? 0,
            }];
          }
          return {
            id: p.id,
            name: p.name,
            color: p.color || '#f97316',
            icon: p.icon || 'folder',
            folders: p.folders || DEFAULT_FOLDERS.map((f, i) => ({ ...f, id: `folder-${i}` })),
            carouselFolders: Array.isArray(p.carousel_folders) && p.carousel_folders.length > 0
              ? p.carousel_folders
              : DEFAULT_CAROUSEL_FOLDERS,
            linksTemplate: Array.isArray(p.links_template) && p.links_template.length > 0 ? p.links_template : DEFAULT_LINKS_TEMPLATE,
            responsiblesTemplate: Array.isArray(p.responsibles_template) && p.responsibles_template.length > 0 ? p.responsibles_template : DEFAULT_RESPONSIBLES_TEMPLATE,
            stylePrompt: p.style_prompt ?? undefined,
            styleMeta: p.style_meta ?? undefined,
            styleExamplesCount: p.style_examples_count ?? 0,
            projectStyles,
            createdAt: new Date(p.created_at),
            isShared: p.isShared || false,
            membershipStatus: p.membershipStatus,
            owner_id: p.owner_id || p.user_id,
          };
        });
        
        // Проверяем наличие pending приглашений для уведомлений
        const pendingInvitations = loadedProjects.filter(p => p.membershipStatus === 'pending');
        if (pendingInvitations.length > 0) {
          // Отправляем событие для показа уведомления
          window.dispatchEvent(new CustomEvent('pending-invitations', { 
            detail: { count: pendingInvitations.length, projects: pendingInvitations } 
          }));
        }
        setProjects(loadedProjects);
        
        // Устанавливаем текущий проект
        if (silent) {
          // Фоновый рефетч — сохраняем выбор пользователя, меняем только если проект удалён
          setCurrentProjectId(prev => {
            const stillExists = loadedProjects.find(p => p.id === prev);
            return stillExists ? prev : (loadedProjects[0]?.id ?? null);
          });
        } else {
          const savedProjectId = localStorage.getItem('currentProjectId');
          if (savedProjectId && loadedProjects.find(p => p.id === savedProjectId)) {
            setCurrentProjectId(savedProjectId);
          } else {
            setCurrentProjectId(loadedProjects[0].id);
          }
        }
      } else {
        // Создаем дефолтный проект
        const defaultProject: Project = {
          id: `project-${Date.now()}`,
          name: 'Мой проект',
          color: '#f97316',
          icon: 'folder',
          folders: DEFAULT_FOLDERS.map((f, i) => ({ ...f, id: `folder-${Date.now()}-${i}` })),
          carouselFolders: DEFAULT_CAROUSEL_FOLDERS,
          linksTemplate: DEFAULT_LINKS_TEMPLATE,
          responsiblesTemplate: DEFAULT_RESPONSIBLES_TEMPLATE,
          createdAt: new Date(),
        };

        // Пробуем сохранить в базу
        try {
          await supabase.from('projects').insert({
            id: defaultProject.id,
            user_id: userId,
            owner_id: userId,
            name: defaultProject.name,
            color: defaultProject.color,
            icon: defaultProject.icon,
            folders: defaultProject.folders,
            carousel_folders: defaultProject.carouselFolders ?? DEFAULT_CAROUSEL_FOLDERS,
            links_template: defaultProject.linksTemplate,
            responsibles_template: defaultProject.responsiblesTemplate,
          });
        } catch (e) {
          console.error('Failed to save default project:', e);
        }
        
        setProjects([defaultProject]);
        setCurrentProjectId(defaultProject.id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      // Fallback - создаём локальный проект
      const defaultProject: Project = {
        id: `project-${Date.now()}`,
        name: 'Мой проект',
        color: '#f97316',
        icon: 'folder',
        folders: DEFAULT_FOLDERS.map((f, i) => ({ ...f, id: `folder-${Date.now()}-${i}` })),
        carouselFolders: DEFAULT_CAROUSEL_FOLDERS,
        linksTemplate: DEFAULT_LINKS_TEMPLATE,
        responsiblesTemplate: DEFAULT_RESPONSIBLES_TEMPLATE,
        createdAt: new Date(),
      };
      setProjects([defaultProject]);
      setCurrentProjectId(defaultProject.id);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getUserId, projects.length]);

  // Создание проекта
  const createProject = useCallback(async (name: string, customColor?: string): Promise<Project | null> => {
    const userId = getUserId();
    const color = customColor || PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    
    const newProject: Omit<Project, 'createdAt'> = {
      id: `project-${Date.now()}`,
      name,
      color,
      icon: 'folder',
      folders: DEFAULT_FOLDERS.map((f, i) => ({ ...f, id: `folder-${Date.now()}-${i}` })),
      carouselFolders: DEFAULT_CAROUSEL_FOLDERS,
      linksTemplate: DEFAULT_LINKS_TEMPLATE,
      responsiblesTemplate: DEFAULT_RESPONSIBLES_TEMPLATE,
    };

    const project: Project = { ...newProject, createdAt: new Date() };

    try {
      const { error } = await supabase
        .from('projects')
        .insert({
          id: newProject.id,
          user_id: userId,
          owner_id: userId,
          name: newProject.name,
          color: newProject.color,
          icon: newProject.icon,
          folders: newProject.folders,
          carousel_folders: newProject.carouselFolders ?? DEFAULT_CAROUSEL_FOLDERS,
          links_template: newProject.linksTemplate,
          responsibles_template: newProject.responsiblesTemplate,
        });

      if (error) {
        console.error('Error creating project:', error);
        // Всё равно добавляем в локальный state (fallback)
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
    
    // Всегда добавляем проект в state (даже если Supabase не работает)
    setProjects(prev => [...prev, project]);
    return project;
  }, [getUserId, projects.length]);

  // Обновление проекта (в т.ч. шаблоны ссылок, ответственных, стили сценария, папки каруселей)
  const updateProject = useCallback(async (projectId: string, updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'folders' | 'carouselFolders' | 'linksTemplate' | 'responsiblesTemplate' | 'stylePrompt' | 'styleMeta' | 'styleExamplesCount' | 'projectStyles'>>) => {
    try {
      const dbUpdates: Record<string, unknown> = { ...updates };
      if ('carouselFolders' in updates) dbUpdates.carousel_folders = updates.carouselFolders ?? [];
      if ('linksTemplate' in updates) dbUpdates.links_template = updates.linksTemplate;
      if ('responsiblesTemplate' in updates) dbUpdates.responsibles_template = updates.responsiblesTemplate;
      if ('stylePrompt' in updates) dbUpdates.style_prompt = updates.stylePrompt ?? null;
      if ('styleMeta' in updates) dbUpdates.style_meta = updates.styleMeta ?? null;
      if ('styleExamplesCount' in updates) dbUpdates.style_examples_count = updates.styleExamplesCount ?? null;
      if ('projectStyles' in updates) {
        dbUpdates.project_styles = (updates.projectStyles || []).map(s => ({
          id: s.id,
          name: s.name,
          prompt: s.prompt,
          meta: s.meta,
          examplesCount: s.examplesCount,
        }));
      }
      delete dbUpdates.carouselFolders;
      delete dbUpdates.linksTemplate;
      delete dbUpdates.responsiblesTemplate;
      delete dbUpdates.stylePrompt;
      delete dbUpdates.styleMeta;
      delete dbUpdates.styleExamplesCount;
      delete dbUpdates.projectStyles;

      const { error } = await supabase
        .from('projects')
        .update(dbUpdates)
        .eq('id', projectId);

      if (error) {
        console.error('Error updating project:', error);
        throw new Error(error.message || 'Не удалось сохранить проект');
      }

      setProjects(prev => prev.map(p => 
        p.id === projectId ? { ...p, ...updates } : p
      ));
    } catch (err) {
      console.error('Failed to update project:', err);
      throw err;
    }
  }, []);

  // Удаление проекта
  const deleteProject = useCallback(async (projectId: string) => {
    if (projects.length <= 1) {
      console.warn('Cannot delete the last project');
      return;
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) {
        console.error('Error deleting project:', error);
        return;
      }

      setProjects(prev => {
        const newProjects = prev.filter(p => p.id !== projectId);
        if (currentProjectId === projectId && newProjects.length > 0) {
          setCurrentProjectId(newProjects[0].id);
        }
        return newProjects;
      });
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }, [projects.length, currentProjectId]);

  // Выбор текущего проекта
  const selectProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    localStorage.setItem('currentProjectId', projectId);
  }, []);

  // Добавление папки в проект
  const addFolder = useCallback(async (projectId: string, folderName: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newFolder: ProjectFolder = {
      id: `folder-${Date.now()}`,
      name: folderName,
      color: PROJECT_COLORS[project.folders.length % PROJECT_COLORS.length],
      icon: 'folder',
      order: project.folders.length,
    };

    const updatedFolders = [...project.folders, newFolder];
    await updateProject(projectId, { folders: updatedFolders });
  }, [projects, updateProject]);

  // Удаление папки из проекта
  // Возвращает данные удаленной папки для возможности отмены
  const removeFolder = useCallback(async (projectId: string, folderId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;

    // Сохраняем данные папки перед удалением
    const folderToDelete = project.folders.find(f => f.id === folderId);
    const folderData = folderToDelete ? { ...folderToDelete, projectId } : null;

    const updatedFolders = project.folders.filter(f => f.id !== folderId);
    await updateProject(projectId, { folders: updatedFolders });
    
    return folderData;
  }, [projects, updateProject]);

  // Восстановление удаленной папки
  const restoreFolder = useCallback(async (folderData: any) => {
    if (!folderData || !folderData.projectId) return false;
    
    const project = projects.find(p => p.id === folderData.projectId);
    if (!project) return false;
    
    // Проверяем что папки с таким ID еще нет
    const folderExists = project.folders.some(f => f.id === folderData.id);
    if (folderExists) return false;
    
    // Восстанавливаем папку
    const updatedFolders = [...project.folders, folderData].sort((a, b) => a.order - b.order);
    await updateProject(folderData.projectId, { folders: updatedFolders });
    
    return true;
  }, [projects, updateProject]);

  // Обновление папки
  const updateFolder = useCallback(async (
    projectId: string, 
    folderId: string, 
    updates: Partial<Omit<ProjectFolder, 'id'>>
  ) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedFolders = project.folders.map(f => 
      f.id === folderId ? { ...f, ...updates } : f
    );
    await updateProject(projectId, { folders: updatedFolders });
  }, [projects, updateProject]);

  // Изменение порядка папок
  const reorderFolders = useCallback(async (projectId: string, newOrder: string[]) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const reorderedFolders = newOrder
      .map((id, index) => {
        const folder = project.folders.find(f => f.id === id);
        return folder ? { ...folder, order: index } : null;
      })
      .filter((f): f is ProjectFolder => f !== null);

    await updateProject(projectId, { folders: reorderedFolders });
  }, [projects, updateProject]);

  // ——— Папки каруселей (отдельно от папок рилсов) ———
  const carouselFoldersList = useCallback((projectId: string): ProjectFolder[] => {
    const project = projects.find(p => p.id === projectId);
    return (project?.carouselFolders && project.carouselFolders.length > 0)
      ? project.carouselFolders
      : DEFAULT_CAROUSEL_FOLDERS;
  }, [projects]);

  const addCarouselFolder = useCallback(async (projectId: string, folderName: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const list = carouselFoldersList(projectId);
    const newFolder: ProjectFolder = {
      id: `carousel-folder-${Date.now()}`,
      name: folderName,
      color: PROJECT_COLORS[list.length % PROJECT_COLORS.length],
      icon: 'folder',
      order: list.length,
    };
    const updated = [...list, newFolder];
    await updateProject(projectId, { carouselFolders: updated });
  }, [projects, carouselFoldersList, updateProject]);

  const removeCarouselFolder = useCallback(async (projectId: string, folderId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;
    const list = carouselFoldersList(projectId);
    const folderToDelete = list.find(f => f.id === folderId);
    const folderData = folderToDelete ? { ...folderToDelete, projectId } : null;
    const updated = list.filter(f => f.id !== folderId);
    await updateProject(projectId, { carouselFolders: updated });
    return folderData;
  }, [projects, carouselFoldersList, updateProject]);

  const updateCarouselFolder = useCallback(async (
    projectId: string,
    folderId: string,
    updates: Partial<Omit<ProjectFolder, 'id'>>
  ) => {
    const list = carouselFoldersList(projectId);
    const updated = list.map(f => (f.id === folderId ? { ...f, ...updates } : f));
    await updateProject(projectId, { carouselFolders: updated });
  }, [carouselFoldersList, updateProject]);

  const reorderCarouselFolders = useCallback(async (projectId: string, newOrder: string[]) => {
    const list = carouselFoldersList(projectId);
    const reordered = newOrder
      .map((id, index) => {
        const folder = list.find(f => f.id === id);
        return folder ? { ...folder, order: index } : null;
      })
      .filter((f): f is ProjectFolder => f !== null);
    await updateProject(projectId, { carouselFolders: reordered });
  }, [carouselFoldersList, updateProject]);

  // Стили проекта: добавить, обновить, удалить. Возвращает созданный стиль.
  const addProjectStyle = useCallback(async (projectId: string, style: Omit<ProjectStyle, 'id'>): Promise<ProjectStyle | void> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const styles = project.projectStyles || [];
    // Не сохраняем виртуальный legacy в БД — только реальные стили
    const stylesToSave = styles.filter(s => s.id !== 'legacy');
    const hadOnlyLegacy = styles.length > 0 && stylesToSave.length === 0;
    const newStyle: ProjectStyle = {
      ...style,
      id: `style-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    const updates: Parameters<typeof updateProject>[1] = { projectStyles: [...stylesToSave, newStyle] };
    if (hadOnlyLegacy) {
      updates.stylePrompt = undefined;
      updates.styleMeta = undefined;
      updates.styleExamplesCount = 0;
    }
    await updateProject(projectId, updates);
    return newStyle;
  }, [projects, updateProject]);

  const updateProjectStyle = useCallback(async (projectId: string, styleId: string, updates: Partial<Omit<ProjectStyle, 'id'>>) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const styles = (project.projectStyles || [])
      .map(s => (s.id === styleId ? { ...s, ...updates } : s))
      .filter(s => s.id !== 'legacy'); // legacy виртуальный, не сохраняем в БД
    await updateProject(projectId, { projectStyles: styles });
  }, [projects, updateProject]);

  const removeProjectStyle = useCallback(async (projectId: string, styleId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const styles = (project.projectStyles || [])
      .filter(s => s.id !== styleId && s.id !== 'legacy');
    await updateProject(projectId, { projectStyles: styles });
  }, [projects, updateProject]);

  // Текущий проект
  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // Рефетч при возврате на вкладку — приглашённый увидит новый проект (silent: без экрана загрузки)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        fetchProjects({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [user, fetchProjects]);

  return {
    projects,
    currentProject,
    currentProjectId,
    loading,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    addFolder,
    removeFolder,
    restoreFolder,
    updateFolder,
    reorderFolders,
    carouselFoldersList,
    addCarouselFolder,
    removeCarouselFolder,
    updateCarouselFolder,
    reorderCarouselFolders,
    addProjectStyle,
    updateProjectStyle,
    removeProjectStyle,
    refetch: fetchProjects,
  };
}
