class ContextStrategy:
    """
    Base class for different context injection strategies.
    """
    def evaluate(self, seed):
        raise NotImplementedError("Each strategy must implement the evaluate method.")

class StaticContextInjection(ContextStrategy):
    def evaluate(self, seed):
        return 0.6

class MultiAgentContextManagement(ContextStrategy):
    def evaluate(self, seed):
        return 0.65

class DynamicTaskAwareContextInjection(ContextStrategy):
    def evaluate(self, seed):
        return 0.75

class AIRealTimeVulnerabilityDetection(ContextStrategy):
    def evaluate(self, seed):
        return 0.7

class NoContextPrioritization(ContextStrategy):
    def evaluate(self, seed):
        return 0.55

class HumanOnlyVulnerabilityDetection(ContextStrategy):
    def evaluate(self, seed):
        return 0.5

class ContextStrategyFactory:
    """
    Factory class for creating context strategy instances.
    """
    @staticmethod
    def create(strategy_name):
        strategies = {
            "StaticContextInjection": StaticContextInjection(),
            "MultiAgentContextManagement": MultiAgentContextManagement(),
            "DynamicTaskAwareContextInjection": DynamicTaskAwareContextInjection(),
            "AIRealTimeVulnerabilityDetection": AIRealTimeVulnerabilityDetection(),
            "NoContextPrioritization": NoContextPrioritization(),
            "HumanOnlyVulnerabilityDetection": HumanOnlyVulnerabilityDetection()
        }
        return strategies.get(strategy_name)