// ABOUTME: Form page to edit an existing project's details and GCP coordinates.
// ABOUTME: Loads the project by slug from context and PATCHes the API on submit.
import { Container, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useOrg, type Project } from '../contexts/OrgContext';
import { ProjectForm, type ProjectFormValues } from './ProjectForm';

export function EditProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const { projectSlug } = useParams();
  const { activeOrgSlug, activeProject, projects, refreshProjects, setActiveProject } = useOrg();

  const target = projects.find((p) => p.slug === projectSlug);

  if (!target) {
    return (
      <Container size={400}>
        <Text c="dimmed" mt="xl">
          Project not found.
        </Text>
      </Container>
    );
  }

  const handleSubmit = async (values: ProjectFormValues): Promise<void> => {
    const response = await fetch(`/api/projects/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Failed to update project');
    }
    const updated = (await response.json()) as Project;
    await refreshProjects();
    if (activeProject?.id === updated.id) {
      setActiveProject(updated);
    }
    navigate(`/orgs/${activeOrgSlug}/projects`);
  };

  return (
    <ProjectForm
      title="Edit Project"
      submitLabel="Save Changes"
      initialValues={{
        name: target.name,
        description: target.description ?? '',
        gcpProject: target.gcpProject,
        gcpLocation: target.gcpLocation,
        gcpDataset: target.gcpDataset,
        gcpFhirStore: target.gcpFhirStore,
      }}
      onSubmit={handleSubmit}
    />
  );
}
