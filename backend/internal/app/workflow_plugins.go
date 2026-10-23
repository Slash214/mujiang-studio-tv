package app

import (
	"infinite-canvas/backend/internal/plugins"
)

const (
	WorkflowPluginRunningHub   = plugins.WorkflowRunningHub
	WorkflowPluginComfyUILocal = plugins.WorkflowComfyUILocal
)

func workflowPluginIDForInterface(value string) (string, bool) {
	return plugins.WorkflowIDForInterface(value)
}

func (s *Service) WorkflowPluginStatuses() map[string]string {
	statuses := s.pluginDomain().WorkflowStatuses()
	if s.IsLocalMode() {
		if statuses == nil {
			statuses = map[string]string{}
		}
		statuses[plugins.WorkflowComfyUILocal] = plugins.StatusEnabled
	}
	return statuses
}

func (s *Service) WorkflowPluginStatusesForUser(userID string) (map[string]string, error) {
	statuses, err := s.pluginDomain().WorkflowStatusesForUser(userID)
	if err != nil {
		return nil, err
	}
	if s.IsLocalMode() {
		if statuses == nil {
			statuses = map[string]string{}
		}
		statuses[plugins.WorkflowComfyUILocal] = plugins.StatusEnabled
	}
	return statuses, nil
}

func (s *Service) RequireWorkflowPluginForInterface(interfaceType string) error {
	if s.IsLocalMode() && isComfyUILocalInterface(interfaceType) {
		return nil
	}
	return mapPluginAccessError(s.pluginDomain().RequireWorkflowForInterface(interfaceType))
}

func (s *Service) RequireWorkflowPluginForUser(userID string, interfaceType string) error {
	if s.IsLocalMode() && isComfyUILocalInterface(interfaceType) {
		return nil
	}
	return mapPluginAccessError(s.pluginDomain().RequireWorkflowForUser(userID, interfaceType))
}
