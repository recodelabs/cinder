// ABOUTME: Form page to create a new project within the active organization.
// ABOUTME: Collects project name, description, and GCP coordinates, then POSTs to the API.
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { useOrg } from '../contexts/OrgContext';
import { ProjectForm, type ProjectFormValues } from './ProjectForm';

export function CreateProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrgId, activeOrgSlug, refreshProjects } = useOrg();

  const handleSubmit = async (values: ProjectFormValues): Promise<void> => {
    const response = await fetch(`/api/orgs/${activeOrgId}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Failed to create project');
    }
    await refreshProjects();
    navigate(`/orgs/${activeOrgSlug}/projects`);
  };

  return <ProjectForm title="Create Project" submitLabel="Create Project" onSubmit={handleSubmit} />;
}
