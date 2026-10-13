# Benchmark

Measured live on 2026-10-13; 2 run(s) per model, no fallback, one search allowed per question.

## nvidia/Nemotron-3-Ultra-550b-a55b

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 1.3 | 1.4 | 6 | 2/2 |
| plain question | 1.0 | 1.0 | 24 | 2/2 |
| places (search) | 3.3 | 3.5 | 41 | 2/2 |
| news (search) | 3.1 | 3.5 | 38 | 2/2 |
| save expense | 1.9 | 2.1 | 8 | 2/2 |
| add to visit list | 1.8 | 1.9 | 9 | 2/2 |
| recall spending | 0.9 | 0.9 | 8 | 2/2 |
| recall list | 0.9 | 1.0 | 7 | 2/2 |
| save draft | 2.0 | 2.2 | 20 | 2/2 |

Overall: 18/18 passed; median 1.8 s, slowest 3.5 s.

## nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 1.0 | 1.3 | 7 | 2/2 |
| plain question | 1.1 | 1.5 | 15 | 2/2 |
| places (search) | 12.7 | 17.9 | 19 | 2/2 |
| news (search) | 5.1 | 10.3 | 8 | 1/2 (searched 0 times) |
| save expense | 2.3 | 4.6 | 14 | 2/2 |
| add to visit list | 2.4 | 2.7 | 9 | 2/2 |
| recall spending | 1.2 | 1.4 | 7 | 2/2 |
| recall list | 1.0 | 1.3 | 8 | 2/2 |
| save draft | 2.9 | 5.2 | 20 | 2/2 |

Overall: 17/18 passed; median 2.3 s, slowest 17.9 s.

