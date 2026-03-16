# Experiment 2: User Profiling for Adaptive AI Coding Assistants — Summary

**Run ID:** `rc-20260315-180111-b87441`  
**Date:** 2026-03-16 02:01–02:50 SGT (~49 min total)  
**Model:** x-ai/grok-3-mini via OpenRouter (fallback from expired Kimi key)  
**Pipeline:** ResearchClaw v0.1.0, 23 stages (29 including 2 REFINE rollbacks)

---

## Research Question

> Compare EMA, Bayesian updating, and sliding window approaches for learning user preferences from sparse session signals in cold-start scenarios (<5 sessions) for AI coding assistants.

## Key Results

### Per-Regime Performance (MAE, lower = better)

| Method | Easy Regime | Hard Regime |
|---|---|---|
| **EMA (α=0.3)** | 0.070 ± 0.024 | 0.350 ± 0.120 |
| **Bayesian Updating** | 0.082 ± 0.048 | 0.356 ± 0.159 |
| **Sliding Window** | 0.101 ± 0.048 | 0.460 ± 0.205 |
| Oracle (upper bound) | 0.000 | 0.000 |

### Statistical Significance
- **No statistically significant differences** between methods (Bayesian vs. EMA: p=0.48)
- All methods achieved 100% success rate on easy regime
- EMA showed lowest variance across conditions

## Findings

1. **EMA is the pragmatic winner.** Lowest error and lowest variance in both regimes. Its simplicity (one α hyperparameter) is an advantage, not a limitation, when data is sparse.

2. **Bayesian updating doesn't justify its complexity.** Slightly worse than EMA with 2× variance. Prior selection in <5 session scenarios is essentially guessing — the theoretical advantage of uncertainty modeling doesn't materialize.

3. **Sliding window is worst for cold-start.** With <5 sessions, the "window" is the entire history — the method degenerates. Its strength (recency bias) becomes irrelevant.

4. **Cold-start is legitimately hard.** Even EMA's best case (easy regime) has 7% MAE. Hard regime pushes all methods to 35-46% error. The problem demands more than incremental updating.

5. **No method achieves meaningful separation.** p=0.48 means the differences could be noise. For FatHippo, this suggests the choice of updating algorithm matters less than the signal quality and feature engineering.

## Implications for FatHippo

- **Don't over-engineer the update mechanism.** EMA with α=0.3 is a solid default. Simple, fast, lowest variance.
- **Focus effort on signal quality.** Better feature extraction from sessions will have more impact than algorithm selection.
- **Hybrid approach worth exploring.** EMA for warm users, Bayesian for cold-start with informative priors derived from user cohort clustering — but only if priors are actually informative (not default).
- **Consider session weighting.** All three methods treat sessions equally. Weighting by session richness (number of signals, interaction depth) could improve cold-start performance more than algorithm choice.

## Quality Assessment
- **Quality gate score:** 8/10, verdict "Accept"
- **Paper length:** ~5,000 words (19K chars), LaTeX + markdown versions generated
- **Citations:** 12 verified references (1 orphaned key stripped)
- **Limitations:** Synthetic data only, n=1 seed run, ablation conditions produced identical outputs (implementation defect)

## Artifacts
- `exp2-results/paper_final.md` — Full paper (markdown)
- `exp2-results/paper.tex` — LaTeX version
- `exp2-results/references.bib` — Bibliography (12 entries)
- `exp2-results/code/` — Experiment code (algorithms.py, harness, main)
- `exp2-paper.md` — Original draft before peer review revision

## Pipeline Notes
- Original Kimi API key (`sk-kimi-TJvV...`) returned 401; switched to OpenRouter (grok-3-mini)
- Semantic Scholar rate-limited throughout (circuit breaker tripped 3×); arXiv also 429'd
- 2 REFINE rollbacks triggered by analysis stage requesting improvements
- matplotlib unavailable — no charts generated (text tables only)
- Ablation conditions produced identical outputs due to code defect (conditions not properly differentiated in all branches)
