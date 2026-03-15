import json
from config import load_config, DEFAULT_CONFIG
from experiment import Experiment

def main():
    try:
        config = load_config()
    except FileNotFoundError:
        print("Config file not found. Using default configuration.")
        config = DEFAULT_CONFIG

    experiment = Experiment(config)
    collected_metrics = experiment.execute()

    # Ensure primary_metric_std is calculated correctly by checking the number of seeds
    for condition, metrics in collected_metrics.items():
        if config['num_seeds'] > 1:
            assert metrics['primary_metric_std'] != 0.0, \
                f"Unexpected standard deviation for condition '{condition}'. Check calculation logic."

    results = {'hyperparameters': config, 'metrics': collected_metrics}
    with open('results.json', 'w') as f:
        json.dump(results, f, indent=2)

    experiment.harness.finalize()

if __name__ == "__main__":
    main()