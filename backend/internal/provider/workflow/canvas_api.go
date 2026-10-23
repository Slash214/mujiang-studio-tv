package workflow

// ValidateMediaInputs checks reference media against mapped workflow slots.
func ValidateMediaInputs(fields []Field, input Input) error {
	return validateWorkflowMediaInputs(fields, input)
}

// NodeInfo resolves field values for a workflow graph.
func NodeInfo(fields []Field, files map[string]string, input Input, graph map[string]interface{}) ([]map[string]any, error) {
	return runningHubNodeInfoWithWorkflow(fields, files, input, graph)
}

// FieldsBindPrompt reports whether a prompt source is already mapped.
func FieldsBindPrompt(fields []Field) bool {
	return workflowFieldsBindPrompt(fields)
}

// UpsertNodeInfo merges prompt fallbacks into an existing node info list.
func UpsertNodeInfo(items []map[string]any, overrides []map[string]any) []map[string]any {
	return upsertRunningHubNodeInfo(items, overrides)
}
