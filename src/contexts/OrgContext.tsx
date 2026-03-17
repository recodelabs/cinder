// ABOUTME: React context for active organization and project selection.
// ABOUTME: Persists choices in localStorage and syncs org with Better Auth.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JSX } from 'react';
import { authClient } from '../auth/auth-client';

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly organizationId: string;
  readonly gcpProject: string;
  readonly gcpLocation: string;
  readonly gcpDataset: string;
  readonly gcpFhirStore: string;
}

interface OrgContextValue {
  readonly activeOrgId: string | undefined;
  readonly activeOrgSlug: string | undefined;
  readonly activeOrgAuthMode: 'service_account' | 'user_token';
  readonly activeProject: Project | undefined;
  readonly projects: Project[];
  readonly setActiveOrg: (orgId: string) => void;
  readonly setActiveProject: (project: Project) => void;
  readonly refreshProjects: () => Promise<void>;
}

const ACTIVE_ORG_KEY = 'cinder:active-org';
const ACTIVE_PROJECT_KEY = 'cinder:active-project';

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

interface OrgProviderProps {
  readonly children: ReactNode;
}

function loadStoredProject(): Project | undefined {
  try {
    const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (stored) {
      return JSON.parse(stored) as Project;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

export function OrgProvider({ children }: OrgProviderProps): JSX.Element {
  const [activeOrgId, setActiveOrgIdState] = useState<string | undefined>(
    () => localStorage.getItem(ACTIVE_ORG_KEY) ?? undefined
  );
  const [activeProject, setActiveProjectState] = useState<Project | undefined>(loadStoredProject);
  const [projects, setProjects] = useState<Project[]>([]);

  const activeOrg = authClient.useActiveOrganization();
  const activeOrgSlug = activeOrg.data?.slug ?? undefined;
  const activeOrgAuthMode = ((activeOrg.data?.metadata as { authMode?: string } | null)?.authMode === 'user_token'
    ? 'user_token'
    : 'service_account') as 'service_account' | 'user_token';

  // Sync stored org with Better Auth on mount
  useEffect(() => {
    if (activeOrgId) {
      authClient.organization.setActive({ organizationId: activeOrgId });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProjects = useCallback(async () => {
    if (!activeOrgId) {
      setProjects([]);
      return;
    }
    try {
      const response = await fetch(`/api/orgs/${activeOrgId}/projects`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = (await response.json()) as Project[];
        setProjects(data);
      }
    } catch {
      // ignore fetch errors
    }
  }, [activeOrgId]);

  // Refresh projects when org changes
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    authClient.organization.setActive({ organizationId: orgId });
    // Clear active project when org changes
    setActiveProjectState(undefined);
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, []);

  const setActiveProject = useCallback((project: Project) => {
    setActiveProjectState(project);
    localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(project));
  }, []);

  const value = useMemo<OrgContextValue>(
    () => ({
      activeOrgId,
      activeOrgSlug,
      activeOrgAuthMode,
      activeProject,
      projects,
      setActiveOrg,
      setActiveProject,
      refreshProjects,
    }),
    [activeOrgId, activeOrgSlug, activeOrgAuthMode, activeProject, projects, setActiveOrg, setActiveProject, refreshProjects]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within OrgProvider');
  }
  return ctx;
}
