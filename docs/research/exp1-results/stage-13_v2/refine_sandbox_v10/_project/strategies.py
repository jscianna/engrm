class ContextInjectionStrategy:
    def __init__(self):
        self.conditions = {
            "StaticContextInjection": 0.6,
            "MultiAgentContextManagement": 0.65,
            "DynamicTaskAwareContextInjection": 0.75,
            "AIRealTimeVulnerabilityDetection": 0.7,
            "NoContextPrioritization": 0.55,
            "HumanOnlyVulnerabilityDetection": 0.5
        }

    def get_conditions(self):
        return list(self.conditions.keys())

    def evaluate(self, condition_name):
        """
        Evaluate the task completion rate for a given condition.
        """
        if condition_name in self.conditions:
            return self.conditions[condition_name]
        else:
            print(f"CONDITION_FAILED: {condition_name} unrecognized")
            return None