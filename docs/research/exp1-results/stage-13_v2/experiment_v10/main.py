import numpy as np
import json
from experiment_harness import ExperimentHarness
from strategies import ContextInjectionStrategy

# Hyperparameters dictionary
HYPERPARAMETERS = {
    'context_window_size': 1024,
    'learning_rate': 0.001,
    'prioritization_strategy': 'task_specific',
    'detection_threshold': 0.7,
    'response_time': 'real_time'
}

def run_experiment(condition_name, seed, harness, strategy):
    """
    Simulate the experiment for a given condition and seed.
    This function implements the core logic for task completion evaluation.
    """
    np.random.seed(seed)
    task_completion_rate = strategy.evaluate(condition_name)

    if task_completion_rate is None:
        print(f"CONDITION_FAILED: {condition_name} evaluation returned None")
        return None

    # Introduce variability based on random noise to simulate real-world conditions
    noise = np.random.normal(loc=0.0, scale=0.05)  # small noise
    task_completion_rate += noise

    # Check for numerical stability
    if np.isnan(task_completion_rate) or task_completion_rate > 100:
        print('FAIL: NaN/divergence detected')
        harness.report_metric(f'{condition_name} seed={seed} primary_metric', 0)
        return None

    harness.report_metric(f'{condition_name} seed={seed} primary_metric', task_completion_rate)
    return task_completion_rate

def main():
    harness = ExperimentHarness(time_budget=600)
    strategy = ContextInjectionStrategy()
    conditions = strategy.get_conditions()
    print(f"REGISTERED_CONDITIONS: {', '.join(conditions)}")
    
    collected_metrics = {}

    for condition in conditions:
        try:
            metrics = []
            for seed in range(1, 6):  # Using 5 random seeds
                if harness.should_stop():
                    break
                
                result = run_experiment(condition, seed, harness, strategy)
                if result is not None:
                    metrics.append(result)
            
            if metrics:
                mean_metric = np.mean(metrics)
                std_metric = np.std(metrics)
                collected_metrics[condition] = {
                    'primary_metric_mean': mean_metric,
                    'primary_metric_std': std_metric
                }
                print(f'condition={condition} primary_metric_mean: {mean_metric} primary_metric_std: {std_metric}')

        except Exception as e:
            print(f"CONDITION_FAILED: {condition} {str(e)}")

    results = {'hyperparameters': HYPERPARAMETERS, 'metrics': collected_metrics}
    with open('results.json', 'w') as f:
        json.dump(results, f, indent=2)

    harness.finalize()

if __name__ == "__main__":
    main()