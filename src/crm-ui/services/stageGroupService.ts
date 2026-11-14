import { api } from './apiClient';

/**
 * CRM > Stage Groups — how the Overview's breakdown reads a pipeline's stages.
 *
 * Presentation only. Nothing here renames, merges or deletes a stage; the Leads list, the
 * Kanban board and the pipeline itself go on working with the real ones.
 */

export interface StageGroup {
  id: string;
  pipelineId: string;
  name: string;
  sortOrder: number;
  /** In pipeline order, whatever order the boxes were ticked in. */
  stages: { id: string; name: string; color: string }[];
}

export interface StageGroupStageOption {
  id: string;
  name: string;
  color: string;
  /** The group that already has it — a stage may only be in one. */
  groupId: string | null;
}

export interface StageGroupConfig {
  groups: StageGroup[];
  stages: StageGroupStageOption[];
}

export async function listStageGroups(pipelineId: string): Promise<StageGroupConfig> {
  return api.get<StageGroupConfig>(`/stage-groups?pipelineId=${encodeURIComponent(pipelineId)}`);
}

export async function createStageGroup(input: {
  pipelineId: string;
  name: string;
  stageIds: string[];
}): Promise<StageGroup> {
  return api.post<StageGroup>('/stage-groups', input);
}

export async function updateStageGroup(
  id: string,
  input: { name?: string; stageIds?: string[] }
): Promise<StageGroup> {
  return api.patch<StageGroup>(`/stage-groups/${id}`, input);
}

export async function deleteStageGroup(id: string): Promise<void> {
  await api.delete(`/stage-groups/${id}`);
}
