import json

def load_config(file_path='config.json'):
    with open(file_path, 'r') as f:
        return json.load(f)

DEFAULT_CONFIG = {
    'context_window_size': 1024,
    'learning_rate': 0.001,
    'prioritization_strategy': 'task_specific',
    'detection_threshold': 0.7,
    'response_time': 'real_time',
    'conditions': [
        "StaticContextInjection",
        "MultiAgentContextManagement",
        "DynamicTaskAwareContextInjection",
        "AIRealTimeVulnerabilityDetection",
        "NoContextPrioritization",
        "HumanOnlyVulnerabilityDetection"
    ],
    'num_seeds': 5
}