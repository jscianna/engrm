"""
(a) Dataset Used:
A synthetic dataset of developer error traces is generated in memory. Each trace is a list of string tokens, containing:
- Generic code keywords (e.g., 'def', 'for', 'return').
- An error type token (e.g., 'TypeError', 'ValueError').
- Sensitive tokens (e.g., 'user_alpha_id', 'project_beta_path').
The generation process is controlled by parameters defining the number of error patterns, sensitive token groups, and noise levels.

(b) Distribution Shift / Corruption Definition:
The experiment uses two distinct regimes to simulate different environments:
- 'easy' regime: 5 error patterns, smaller vocabulary, low noise. This represents a simpler, more controlled development environment.
- 'hard' regime: 10 error patterns, larger vocabulary, higher noise, and more complex traces. This represents a more complex, real-world scenario.
The performance of each anonymization strategy is evaluated on both regimes to test for robustness.

(c) Model Architecture:
The core "model" for matching error traces is based on Term Frequency-Inverse Document Frequency (TF-IDF) vectorization and cosine similarity, implemented using scikit-learn.
1. A database of "canonical patterns" is created by anonymizing a set of traces, converting them to TF-IDF vectors, and averaging the vectors for each unique error type.
2. A new, local error trace is anonymized, converted to a TF-IDF vector, and matched to the canonical pattern in the database with the highest cosine similarity.
This is a standard information retrieval approach, not a neural network.

(d) Training Protocol:
There is no "training" in the sense of gradient descent. The "learning" phase consists of building the pattern database:
- The `TfidfVectorizer` is `fit` on a collection of anonymized traces from a dedicated "database set".
- The canonical patterns are computed by averaging the TF-IDF vectors of traces belonging to each error type.
This is a one-shot process performed at the beginning of each experimental run.

(e) Evaluation Protocol:
- The generated dataset is split into a "database set" (50%) and a "test set" (50%).
- Utility is measured by `matching_accuracy`: The percentage of traces in the test set that are correctly matched to their true error type in the canonical pattern database.
- Privacy is measured by `leakage_risk`: A calculated metric representing the average success probability of a re-identification attack. The calculation is specific to each anonymization method's vulnerabilities.
- Each condition (anonymization strategy) is run across multiple random seeds for statistical robustness.
"""
import time
import json
import numpy as np
from collections import defaultdict

from data_generator import TraceGenerator
from anonymizer import (
    get_anonymizer,
    NoAnonymizationAnonymizer,
    TokenHashingAnonymizer,
    TokenGeneralizationAnonymizer,
    KAnonymityAnonymizer,
    StructuralAbstractionAnonymizer
)
from evaluation import UtilityEvaluator, PrivacyEvaluator

# -- METRIC DEFINITIONS --
# primary_metric: matching_accuracy | direction=higher | desc=Fraction of test traces correctly matched to their canonical error pattern.
# secondary_metric: leakage_risk | direction=lower | desc=Average probability of re-identifying a sensitive token from an anonymized trace.

HYPERPARAMETERS = {
    'num_traces': 1000,
    'db_split_ratio': 0.5,
    'k_anonymity_k_proposed': 5,
    'k_anonymity_k_ablation': 50,
    'regimes': {
        'easy': {
            'num_patterns': 5,
            'num_sensitive_groups': 3,
            'num_sensitive_tokens_per_group': 3,
            'trace_length': 15,
            'noise_level': 0.1,
        },
        'hard': {
            'num_patterns': 10,
            'num_sensitive_groups': 8,
            'num_sensitive_tokens_per_group': 8,
            'trace_length': 25,
            'noise_level': 0.3,
        }
    }
}

def run_experiment(regime_name, regime_config, condition_name, condition_config, seed):
    """Runs a single experimental condition for a given seed."""
    np.random.seed(seed)

    # 1. Generate Data
    generator = TraceGenerator(regime_config)
    traces, true_labels, sensitive_info = generator.generate(HYPERPARAMETERS['num_traces'])
    
    db_size = int(HYPERPARAMETERS['num_traces'] * HYPERPARAMETERS['db_split_ratio'])
    db_traces, db_labels, db_sensitive_info = traces[:db_size], true_labels[:db_size], sensitive_info[:db_size]
    test_traces, test_labels, test_sensitive_info = traces[db_size:], true_labels[db_size:], sensitive_info[db_size:]

    # 2. Initialize Anonymizer
    anonymizer = get_anonymizer(condition_name, condition_config, generator.sensitive_token_map)
    
    # 3. Fit Anonymizer and Create Anonymized DB
    anonymizer.fit(db_traces)
    anonymized_db_traces = [anonymizer.transform(trace) for trace in db_traces]

    # 4. Evaluate Utility
    utility_evaluator = UtilityEvaluator()
    utility_evaluator.create_database(anonymized_db_traces, db_labels)
    
    anonymized_test_traces = [anonymizer.transform(trace) for trace in test_traces]
    matching_accuracy = utility_evaluator.evaluate_matching(anonymized_test_traces, test_labels)

    # 5. Evaluate Privacy
    privacy_evaluator = PrivacyEvaluator()
    leakage_risk = privacy_evaluator.evaluate_leakage(anonymizer, test_traces, test_sensitive_info)

    return {
        'primary_metric': matching_accuracy,
        'secondary_metric': leakage_risk
    }

def main():
    """Main entry point for the experiment."""
    start_time = time.time()
    
    conditions = {
        'k_anonymity_k5': {'k': HYPERPARAMETERS['k_anonymity_k_proposed']},
        'structural_abstraction': {},
        'token_generalization': {},
        'no_anonymization': {},
        'token_hashing': {},
        'k_anonymity_k50': {'k': HYPERPARAMETERS['k_anonymity_k_ablation']},
    }
    
    regimes = HYPERPARAMETERS['regimes']
    
    # Pilot run for time estimation
    pilot_start_time = time.time()
    run_experiment('easy', regimes['easy'], 'token_generalization', conditions['token_generalization'], seed=0)
    pilot_duration = time.time() - pilot_start_time
    
    num_conditions = len(conditions) * len(regimes)
    time_budget = 600
    estimated_total_time = pilot_duration * num_conditions * 3 # Estimate for 3 seeds
    print(f"TIME_ESTIMATE: {estimated_total_time:.2f}s")

    max_seeds = min(max(int((time_budget * 0.8) / (pilot_duration * num_conditions)), 3), 5)
    print(f"SEED_COUNT: {max_seeds} (budget={time_budget}s, pilot={pilot_duration:.2f}s, conditions={num_conditions})")
    
    all_results = defaultdict(lambda: defaultdict(list))
    
    print(f"REGISTERED_CONDITIONS: {', '.join(conditions.keys())}")
    print(f"METRIC_DEF: primary_metric | direction=higher | desc=Fraction of test traces correctly matched to their canonical error pattern.")
    print(f"METRIC_DEF: secondary_metric | direction=lower | desc=Average probability of re-identifying a sensitive token from an anonymized trace.")

    for regime_name, regime_config in regimes.items():
        print(f"\n--- REGIME: {regime_name} ---")
        for condition_name, condition_config in conditions.items():
            seed_results = []
            try:
                for seed in range(max_seeds):
                    if time.time() - start_time > time_budget * 0.8:
                        print("WARNING: Time budget reached, stopping early.")
                        break
                    
                    metrics = run_experiment(regime_name, regime_config, condition_name, condition_config, seed)
                    seed_results.append(metrics)
                    
                    print(f"regime={regime_name} condition={condition_name} seed={seed} "
                          f"primary_metric: {metrics['primary_metric']:.4f} "
                          f"secondary_metric: {metrics['secondary_metric']:.4f}")
                
                if seed_results:
                    primary_metrics = [r['primary_metric'] for r in seed_results]
                    secondary_metrics = [r['secondary_metric'] for r in seed_results]
                    
                    mean_primary = np.mean(primary_metrics)
                    std_primary = np.std(primary_metrics)
                    mean_secondary = np.mean(secondary_metrics)
                    std_secondary = np.std(secondary_metrics)
                    
                    all_results[regime_name][condition_name] = {
                        'primary_metric_mean': mean_primary,
                        'primary_metric_std': std_primary,
                        'secondary_metric_mean': mean_secondary,
                        'secondary_metric_std': std_secondary,
                        'per_seed_results': seed_results
                    }
                    
                    print(f"regime={regime_name} condition={condition_name} "
                          f"primary_metric_mean: {mean_primary:.4f} primary_metric_std: {std_primary:.4f} "
                          f"secondary_metric_mean: {mean_secondary:.4f} secondary_metric_std: {std_secondary:.4f} "
                          f"success_rate: {len(seed_results)}/{max_seeds}")

            except Exception as e:
                print(f"CONDITION_FAILED: {condition_name} in regime {regime_name} with error: {e}")
                import traceback
                traceback.print_exc()

    # Final summary
    print("\n--- SUMMARY ---")
    for regime_name, regime_results in all_results.items():
        primary_summary = ", ".join([f"{c}={res['primary_metric_mean']:.3f}" for c, res in regime_results.items()])
        secondary_summary = ", ".join([f"{c}={res['secondary_metric_mean']:.3f}" for c, res in regime_results.items()])
        print(f"SUMMARY: regime={regime_name} primary_metric(accuracy): {primary_summary}")
        print(f"SUMMARY: regime={regime_name} secondary_metric(leakage): {secondary_summary}")

    # Save results to json
    final_output = {'hyperparameters': HYPERPARAMETERS, 'results': all_results}
    with open('results.json', 'w') as f:
        json.dump(final_output, f, indent=2)

    print(f"\nTotal execution time: {time.time() - start_time:.2f}s")


if __name__ == "__main__":
    main()